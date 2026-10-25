/**
 * Conversations between two people.
 * Backed by `POST /conversations`, `GET /conversations`,
 * `GET /conversations/:id/messages`, `POST /conversations/:id/messages`,
 * `POST /conversations/:id/read`, `POST /conversations/:id/report`.
 *
 * Opening a thread is find-or-create on the pair of people, so pressing "say
 * hello" twice is one conversation rather than two — the server keys the row
 * on who is in it, not on the click.
 *
 * WHAT THE MOCK CANNOT TELL YOU. The rules that make chat safe — blocks, the
 * per-minute rate limit, and the one-message invite that stops a stranger
 * talking at somebody who has not replied — are mirrored below so the refusal
 * path is reachable without a backend, but they PROVE nothing: the mock is
 * being asked whether it agrees with itself. Every one of these rules is
 * about a second person, and only the live suite has one.
 */
import { apiClient, withMock, ApiError } from './apiClient.js';
import { db, currentUserId, nextId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { suggestedPeople } from '../mock/social.js';
import { resolveProgression } from '../utils/progression.js';

/** How long the panel waits between polls while it is open. */
export const POLL_SECONDS = 3;

/** The longest a single message may be, matching the server's limit. */
export const MESSAGE_MAX = 2000;

/** Messages per minute per account, matching the server's limit. */
export const SEND_LIMIT_PER_MINUTE = 20;

/* ----------------------------------------------------------- the mock --- */

const partnerOf = (thread, me) => (thread.aId === me ? thread.bId : thread.aId);

function mockPartnerCard(userId) {
  const person = suggestedPeople.find((p) => p.id === userId);
  const pooled = db.candidates.find((c) => c.id === userId);
  return {
    id: userId,
    name: person?.name ?? pooled?.name ?? 'Grooveli member',
    headline: person?.headline ?? pooled?.headline ?? 'Grooveli member',
    color: person?.color ?? pooled?.color ?? '#5be3c8',
    careerLevel: pooled?.careerLevel ?? resolveProgression(0).level,
  };
}

function mockCard(thread, me) {
  const messages = db.messages.filter((m) => m.conversationId === thread.id);
  const latest = messages[messages.length - 1] ?? null;
  return {
    id: thread.id,
    partner: mockPartnerCard(partnerOf(thread, me)),
    metScene: thread.metScene ?? null,
    metLocationId: thread.metLocationId ?? null,
    lastMessage: latest
      ? { body: latest.body, senderId: latest.senderId, createdAt: latest.createdAt }
      : null,
    unread: messages.filter((m) => m.senderId !== me && !m.readAt).length,
    createdAt: thread.createdAt,
  };
}

/* -------------------------------------------------------- the surface --- */

/**
 * Open a thread with someone, or find the one you already have.
 *
 * `metScene` / `metLocationId` record where the two of you were standing. Not
 * analytics: a thread that still says it started in a particular company's
 * lobby is doing the introducing a week later, when neither person remembers
 * why they spoke.
 */
export function openConversation(userId, { metScene = null, metLocationId = null } = {}) {
  return withMock(
    async () => {
      await delay(260);
      const me = currentUserId();
      // The server refuses this too. A thread you could open but never
      // send into would be a dead end that looks like a feature.
      if ((db.blockedAuthorIds[me] ?? []).includes(userId)) {
        throw new ApiError('You cannot start a conversation with that person.', {
          status: 403, code: 'forbidden',
        });
      }
      const existing = db.conversations.find(
        (t) => partnerOf(t, me) === userId && (t.aId === me || t.bId === me),
      );
      if (existing) return mockCard(existing, me);

      const thread = {
        id: nextId('cnv'),
        aId: me,
        bId: userId,
        metScene,
        metLocationId,
        createdAt: new Date().toISOString(),
      };
      db.conversations.push(thread);
      return mockCard(thread, me);
    },
    () => apiClient.post('/conversations', { userId, metScene, metLocationId }),
  );
}

/** This account's threads, newest activity first. */
export function listConversations() {
  return withMock(
    async () => {
      await delay(200);
      const me = currentUserId();
      const blocked = new Set(db.blockedAuthorIds[me] ?? []);
      return db.conversations
        .filter((t) => t.aId === me || t.bId === me)
        .filter((t) => !blocked.has(partnerOf(t, me)))
        .map((t) => mockCard(t, me))
        .sort((x, y) =>
          (y.lastMessage?.createdAt ?? y.createdAt).localeCompare(
            x.lastMessage?.createdAt ?? x.createdAt,
          ),
        );
    },
    () => apiClient.get('/conversations'),
  );
}

/**
 * The thread, oldest first. `since` asks only for what has not been seen,
 * which is what makes the open-panel poll cheap.
 */
export function listMessages(conversationId, { since = null } = {}) {
  return withMock(
    async () => {
      await delay(140);
      return db.messages
        .filter((m) => m.conversationId === conversationId)
        .filter((m) => !since || m.createdAt > since)
        .map((m) => ({ ...m }));
    },
    () => apiClient.get(`/conversations/${conversationId}/messages`, { params: { since } }),
  );
}

/**
 * The rules the server enforces, mirrored so the refusal UI is reachable.
 *
 * Deliberately the same order and the same wording as `assertCanSend` in
 * `_shared/conversations.ts`: when the two drift, the mock quietly starts
 * promising something the backend will not honour, which is the failure mode
 * the progression mock already taught — it passed 57 checks while the real
 * award was wrong.
 */
function mockAssertCanSend(thread, me) {
  const them = partnerOf(thread, me);

  const blocked = new Set(db.blockedAuthorIds[me] ?? []);
  if (blocked.has(them)) {
    throw new ApiError('You cannot send messages in this conversation.', {
      status: 403, code: 'forbidden',
    });
  }

  const recentSince = Date.now() - 60_000;
  const recent = db.messages.filter(
    (m) => m.senderId === me && new Date(m.createdAt).getTime() >= recentSince,
  ).length;
  if (recent >= SEND_LIMIT_PER_MINUTE) {
    throw new ApiError('You are sending messages very quickly. Give it a minute.', {
      status: 400, code: 'validation_failed',
    });
  }

  const connected = db.connections.some(
    (c) =>
      c.status === 'accepted' &&
      ((c.requesterId === me && c.addresseeId === them) ||
        (c.requesterId === them && c.addresseeId === me)),
  );
  if (connected) return;

  const inThread = db.messages.filter((m) => m.conversationId === thread.id);
  const mine = inThread.filter((m) => m.senderId === me).length;
  const theirs = inThread.filter((m) => m.senderId === them).length;
  if (mine > 0 && theirs === 0) {
    throw new ApiError(
      'You have sent your introduction. You can write again once they reply, or connect with them first.',
      { status: 403, code: 'forbidden' },
    );
  }
}

export function sendMessage(conversationId, body) {
  return withMock(
    async () => {
      await delay(220);
      const me = currentUserId();
      const thread = db.conversations.find((t) => t.id === conversationId);
      if (!thread) {
        throw new ApiError('That conversation is no longer there.', {
          status: 404, code: 'not_found',
        });
      }
      mockAssertCanSend(thread, me);
      const message = {
        id: nextId('msg'),
        conversationId,
        senderId: me,
        body,
        createdAt: new Date().toISOString(),
        readAt: null,
      };
      db.messages.push(message);
      return { ...message };
    },
    () => apiClient.post(`/conversations/${conversationId}/messages`, { body }),
  );
}

/** Mark the other side's messages read. Having a panel open is not reading it. */
export function markConversationRead(conversationId) {
  return withMock(
    async () => {
      await delay(100);
      const me = currentUserId();
      const now = new Date().toISOString();
      db.messages
        .filter((m) => m.conversationId === conversationId && m.senderId !== me && !m.readAt)
        .forEach((m) => {
          m.readAt = now;
        });
      return null;
    },
    () => apiClient.post(`/conversations/${conversationId}/read`),
  );
}

/**
 * Report a conversation for review.
 *
 * A row for a human, never a takedown — the instant action is the block, and
 * that is the reporter's own to take.
 */
export function reportConversation(conversationId, reason = 'other') {
  return withMock(
    async () => {
      await delay(200);
      db.conversationReports.push({
        id: nextId('crp'),
        conversationId,
        reporterUserId: currentUserId(),
        reason,
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      return { reported: true };
    },
    () => apiClient.post(`/conversations/${conversationId}/report`, { reason }),
  );
}
