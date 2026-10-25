/**
 * Conversations between two people.
 *
 * The rules that only work server-side live here: who is in a thread, who may
 * open one, and whether a message is allowed to be sent. Every one of them is
 * about the second person, which is why none of them can be trusted to the
 * client that is sending.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { badRequest, forbidden, notFound } from './errors.ts';
import { resolveProgression } from './progression.ts';

type Row = Record<string, unknown>;

export const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

/** The longest a single message may be. Long enough to introduce yourself. */
export const MESSAGE_MAX = 2000;

/**
 * How many messages one account may send in a minute, across every thread.
 *
 * Generous for a conversation and useless for a campaign, which is the shape
 * a rate limit wants. Counted from `messages` rather than held in memory,
 * because an Edge Function has no memory between requests — a counter in a
 * module variable would reset on every cold start and be per-instance in
 * between, which is a rate limit that does not limit anything.
 */
export const SEND_LIMIT_PER_MINUTE = 20;

/** The other person in a thread. */
export const partnerOf = (row: Row, me: string) =>
  String(row.a_id) === me ? String(row.b_id) : String(row.a_id);

/** Both sides of a block, as one set. A block cuts in both directions. */
export async function blockedEitherWay(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const [{ data: iBlocked }, { data: blockedMe }] = await Promise.all([
    admin.from('blocked_authors').select('author_id').eq('user_id', userId),
    admin.from('blocked_authors').select('user_id').eq('author_id', userId),
  ]);
  return new Set<string>([
    ...((iBlocked ?? []) as Row[]).map((r) => String(r.author_id)),
    ...((blockedMe ?? []) as Row[]).map((r) => String(r.user_id)),
  ]);
}

/** Is there an accepted connection between these two? */
export async function areConnected(
  admin: SupabaseClient,
  a: string,
  b: string,
): Promise<boolean> {
  const { data } = await admin
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`,
    )
    .maybeSingle();
  return Boolean(data);
}

/**
 * The thread with this id, if the caller is in it.
 *
 * A thread the caller is not part of answers 404 rather than 403: that a
 * conversation exists between two other people is not something a stranger
 * should be able to confirm by guessing ids.
 */
export async function requireThread(admin: SupabaseClient, threadId: string, me: string) {
  const { data } = await admin
    .from('conversations')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  const row = (data ?? null) as Row | null;
  if (!row) throw notFound('That conversation is no longer there.');
  if (String(row.a_id) !== me && String(row.b_id) !== me) {
    throw notFound('That conversation is no longer there.');
  }
  return row;
}

/**
 * May this account send into this thread right now?
 *
 * THE ONE-MESSAGE INVITE. Against someone you are not connected to, you get a
 * single message; until they answer, you cannot send another. A stranger can
 * still say hello — which is the whole point of putting two people in a lobby
 * together — but cannot send the same hello to four hundred people and cannot
 * keep talking at somebody who has not replied.
 *
 * Connected people are exempt: they have each already agreed to the other.
 */
export async function assertCanSend(
  admin: SupabaseClient,
  thread: Row,
  me: string,
): Promise<void> {
  const them = partnerOf(thread, me);

  const blocked = await blockedEitherWay(admin, me);
  if (blocked.has(them)) {
    // Deliberately the same wording whichever side blocked. Telling someone
    // they have been blocked is information the blocker did not choose to
    // share, and a product that reports it turns a quiet exit into a
    // confrontation.
    throw forbidden('You cannot send messages in this conversation.');
  }

  const recentSince = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', me)
    .gte('created_at', recentSince);
  if ((recent ?? 0) >= SEND_LIMIT_PER_MINUTE) {
    throw badRequest('You are sending messages very quickly. Give it a minute.');
  }

  if (await areConnected(admin, me, them)) return;

  const [{ count: mine }, { count: theirs }] = await Promise.all([
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', String(thread.id))
      .eq('sender_id', me),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', String(thread.id))
      .eq('sender_id', them),
  ]);

  if ((mine ?? 0) > 0 && (theirs ?? 0) === 0) {
    throw forbidden(
      'You have sent your introduction. You can write again once they reply, or connect with them first.',
    );
  }
}

/** Row to the JSON the chat panel renders. */
export const toMessage = (row: Row) => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderId: row.sender_id,
  body: row.body,
  createdAt: row.created_at,
  readAt: row.read_at ?? null,
});

export type ConversationCard = {
  id: string;
  partner: { id: string; name: string; headline: string; color: string; careerLevel: number };
  metScene: string | null;
  metLocationId: string | null;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unread: number;
  createdAt: string;
};

const PERSON_COLOR = '#5be3c8';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Conversation rows to the list the inbox renders, newest activity first.
 *
 * One batch of lookups for every thread rather than a query per row: the inbox
 * is small today and would be an N+1 the moment it is not.
 */
export async function toConversations(
  admin: SupabaseClient,
  rows: Row[],
  me: string,
): Promise<ConversationCard[]> {
  if (!rows.length) return [];

  const threadIds = rows.map((r) => String(r.id));
  const partnerIds = [...new Set(rows.map((r) => partnerOf(r, me)))];

  const [{ data: messages }, { data: profiles }, { data: candidates }, { data: progress }] =
    await Promise.all([
      admin
        .from('messages')
        .select('conversation_id, sender_id, body, created_at, read_at')
        .in('conversation_id', threadIds)
        .order('created_at', { ascending: true }),
      admin.from('profiles').select('id, display_name').in('id', partnerIds),
      admin.from('candidate_profiles').select('user_id, headline').in('user_id', partnerIds),
      admin.from('career_progress').select('user_id, xp').in('user_id', partnerIds),
    ]);

  const nameOf = new Map(
    ((profiles ?? []) as Row[]).map((r) => [String(r.id), String(r.display_name ?? '')]),
  );
  const headlineOf = new Map(
    ((candidates ?? []) as Row[]).map((r) => [String(r.user_id), String(r.headline ?? '')]),
  );
  const xpOf = new Map(((progress ?? []) as Row[]).map((r) => [String(r.user_id), num(r.xp)]));

  const last = new Map<string, Row>();
  const unread = new Map<string, number>();
  for (const message of (messages ?? []) as Row[]) {
    const threadId = String(message.conversation_id);
    last.set(threadId, message);
    // Unread means sent BY THE OTHER SIDE and not yet read. Your own unread
    // messages are a contradiction, and counting them would make every thread
    // you opened look like it had something waiting in it.
    if (String(message.sender_id) !== me && message.read_at === null) {
      unread.set(threadId, (unread.get(threadId) ?? 0) + 1);
    }
  }

  return rows
    .map((row) => {
      const threadId = String(row.id);
      const partnerId = partnerOf(row, me);
      const latest = last.get(threadId) ?? null;
      return {
        id: threadId,
        partner: {
          id: partnerId,
          name: nameOf.get(partnerId) || 'Grooveli member',
          headline: headlineOf.get(partnerId) || 'Grooveli member',
          color: PERSON_COLOR,
          careerLevel: resolveProgression(xpOf.get(partnerId) ?? 0).level,
        },
        metScene: row.met_scene === null ? null : String(row.met_scene),
        metLocationId: row.met_location_id === null ? null : String(row.met_location_id),
        lastMessage: latest
          ? {
              body: String(latest.body ?? ''),
              senderId: String(latest.sender_id),
              createdAt: String(latest.created_at),
            }
          : null,
        unread: unread.get(threadId) ?? 0,
        createdAt: String(row.created_at),
      };
    })
    // Newest activity first, and a thread with nothing in it sorts by when it
    // was opened — which is the only time it can be empty and still be shown.
    .sort((x, y) => {
      const xAt = x.lastMessage?.createdAt ?? x.createdAt;
      const yAt = y.lastMessage?.createdAt ?? y.createdAt;
      return yAt.localeCompare(xAt);
    });
}

/** How many messages are waiting for this account, across every thread. */
export async function unreadMessageCount(
  admin: SupabaseClient,
  me: string,
): Promise<number> {
  const { data: threads } = await admin
    .from('conversations')
    .select('id')
    .or(`a_id.eq.${me},b_id.eq.${me}`);
  const ids = ((threads ?? []) as Row[]).map((r) => String(r.id));
  if (!ids.length) return 0;

  const { count } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', ids)
    .neq('sender_id', me)
    .is('read_at', null);
  return count ?? 0;
}
