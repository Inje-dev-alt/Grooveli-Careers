/**
 * Conversations (batch 4.2).
 *
 * Opening a thread is find-or-create on the ordered pair, which makes it
 * naturally idempotent: two people who both press "say hello" at the same
 * moment end up in one conversation, because the pair is what the row is
 * keyed on rather than the click. The same principle as the career awards,
 * where an award is keyed on the thing it is about.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { requireUser } from '../_shared/auth.ts';
import { badRequest, forbidden, serverError } from '../_shared/errors.ts';
import { notify } from '../_shared/notify.ts';
import {
  MESSAGE_MAX,
  assertCanSend,
  blockedEitherWay,
  id,
  partnerOf,
  requireThread,
  toConversations,
  toMessage,
} from '../_shared/conversations.ts';

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const REPORT_REASONS = new Set(['harassment', 'spam', 'scam', 'impersonation', 'other']);

/**
 * POST /conversations — `{ userId, metScene?, metLocationId? }`.
 *
 * Opening a thread sends nothing and tells nobody. A notice for "somebody
 * opened a window" would fire every time a curious player clicked a name in a
 * lobby; the first message is the thing worth interrupting someone for.
 */
route('POST', '/conversations', async (req) => {
  const body = ((await req.json().catch(() => null)) ?? {}) as Row;
  const userId = str(body.userId);
  if (!userId) throw badRequest('Say who to talk to.', { field: 'userId' });

  const admin = adminClient();
  const authUser = await requireUser(req);
  if (userId === authUser.id) throw badRequest('You cannot start a conversation with yourself.');

  const blocked = await blockedEitherWay(admin, authUser.id);
  if (blocked.has(userId)) {
    throw forbidden('You cannot start a conversation with that person.');
  }

  const { data: person } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (!person) throw badRequest('That person is no longer on Grooveli.', { field: 'userId' });

  // Find first, on the pair in either order — the unique index would catch a
  // duplicate, but answering with the existing thread is the behaviour the
  // caller wants rather than a 409 they would have to interpret.
  const { data: existing } = await admin
    .from('conversations')
    .select('*')
    .or(
      `and(a_id.eq.${authUser.id},b_id.eq.${userId}),and(a_id.eq.${userId},b_id.eq.${authUser.id})`,
    )
    .maybeSingle();

  if (existing) {
    const [card] = await toConversations(admin, [existing as Row], authUser.id);
    return { body: card };
  }

  const metScene = str(body.metScene) || null;
  const metLocationId = str(body.metLocationId) || null;

  const { data, error } = await admin
    .from('conversations')
    .insert({
      id: id('cnv'),
      a_id: authUser.id,
      b_id: userId,
      met_scene: metScene,
      met_location_id: metLocationId,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('[conversations] create failed:', error?.message);
    throw serverError();
  }

  const [card] = await toConversations(admin, [data as Row], authUser.id);
  return { status: 201, body: card };
});

/** GET /conversations — this account's threads, newest activity first. */
route('GET', '/conversations', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('conversations')
    .select('*')
    .or(`a_id.eq.${authUser.id},b_id.eq.${authUser.id}`);

  // A blocked person's thread leaves the inbox. The rows stay — a block is not
  // a delete, and unblocking should not lose what was said — but a list that
  // kept showing them would make blocking feel like it had not worked.
  const blocked = await blockedEitherWay(admin, authUser.id);
  const rows = ((data ?? []) as Row[]).filter(
    (row) => !blocked.has(partnerOf(row, authUser.id)),
  );

  return { body: await toConversations(admin, rows, authUser.id) };
});

/**
 * GET /conversations/:id/messages?since= — the thread, oldest first.
 *
 * `since` is an ISO timestamp and makes the open-panel poll cheap: after the
 * first load it asks only for what it has not seen. Reading does not mark
 * anything read — that is a separate call, because having a window open is not
 * the same as having looked at it.
 */
route('GET', '/conversations/:id/messages', async (req, params) => {
  const since = new URL(req.url).searchParams.get('since');

  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireThread(admin, params.id, authUser.id);

  let query = admin
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });
  if (since) query = query.gt('created_at', since);

  const { data } = await query;
  return { body: ((data ?? []) as Row[]).map(toMessage) };
});

/**
 * POST /conversations/:id/messages — `{ body }`.
 *
 * Every rule about whether this is allowed lives in `assertCanSend`, which the
 * client cannot run: blocks in either direction, the per-minute rate limit,
 * and the one-message invite that stops a stranger talking at somebody who has
 * not answered.
 */
route('POST', '/conversations/:id/messages', async (req, params) => {
  const payload = ((await req.json().catch(() => null)) ?? {}) as Row;
  const text = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!text) throw badRequest('Write something first.', { field: 'body' });
  if (text.length > MESSAGE_MAX) {
    throw badRequest(`Keep a message under ${MESSAGE_MAX} characters.`, { field: 'body' });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);
  const thread = await requireThread(admin, params.id, authUser.id);

  await assertCanSend(admin, thread, authUser.id);

  const { data, error } = await admin
    .from('messages')
    .insert({
      id: id('msg'),
      conversation_id: params.id,
      sender_id: authUser.id,
      body: text,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('[conversations] send failed:', error?.message);
    throw serverError();
  }

  const them = partnerOf(thread, authUser.id);
  const { data: me } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', authUser.id)
    .maybeSingle();

  // One notice per message, and the body is the message: a notice that says
  // "you have a new message" makes someone open the app to find out whether it
  // was worth opening the app. The notice is best-effort, as every notice is —
  // the message is already durable.
  await notify(admin, them, {
    type: 'message',
    title: `${String(me?.display_name ?? '') || 'Someone'} messaged you`,
    body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
    route: '/network',
  });

  return { status: 201, body: toMessage(data as Row) };
});

/**
 * POST /conversations/:id/read — mark the other side's messages read.
 *
 * Only theirs, and only the unread ones: `read_at` is a timestamp, so
 * re-marking a thread would otherwise rewrite history every time the panel
 * opened.
 */
route('POST', '/conversations/:id/read', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const thread = await requireThread(admin, params.id, authUser.id);

  const { error } = await admin
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', String(thread.id))
    .neq('sender_id', authUser.id)
    .is('read_at', null);

  if (error) console.error('[conversations] mark read failed:', error.message);
  return { status: 204 };
});

/**
 * POST /conversations/:id/report — `{ reason }`.
 *
 * A row for a human to read, never a takedown. The instant action available to
 * someone being harassed is the block, which is theirs to take and takes
 * effect immediately; a report that removed a thread on the first click would
 * be a weapon rather than a protection.
 */
route('POST', '/conversations/:id/report', async (req, params) => {
  const payload = ((await req.json().catch(() => null)) ?? {}) as Row;
  const reason = str(payload.reason) || 'other';
  if (!REPORT_REASONS.has(reason)) throw badRequest('Choose a reason.', { field: 'reason' });

  const admin = adminClient();
  const authUser = await requireUser(req);
  const thread = await requireThread(admin, params.id, authUser.id);

  const { error } = await admin.from('conversation_reports').upsert(
    {
      id: id('crp'),
      conversation_id: String(thread.id),
      reporter_user_id: authUser.id,
      reason,
    },
    { onConflict: 'conversation_id,reporter_user_id' },
  );

  if (error) {
    console.error('[conversations] report failed:', error.message);
    throw serverError();
  }

  return { body: { reported: true } };
});
