/**
 * Notifications (handoff §5) — the feed, and the reminder preferences.
 *
 * Reads are always scoped to the caller. There is no endpoint that writes a
 * notice: a notice is a consequence of something else happening, so it is
 * raised by the code that made it happen (`_shared/notify.ts`), never by a
 * client asking for one. A browser that could post into an inbox could post
 * into somebody else's.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { toNotification } from '../_shared/notify.ts';

type Row = Record<string, unknown>;

const FEED_LIMIT = 50;

/** Defaults for an account that has never set preferences. */
const DEFAULT_PREFERENCES = { missionReminders: true, quietHours: null };

function toPreferences(row: Row | null) {
  if (!row) return DEFAULT_PREFERENCES;
  const start = row.quiet_start;
  const end = row.quiet_end;
  return {
    missionReminders: row.mission_reminders ?? true,
    quietHours:
      typeof start === 'number' && typeof end === 'number' ? { start, end } : null,
  };
}

/* -------------------------------------------------------------- feed --- */

// GET /notifications — this account's feed, newest first.
route('GET', '/notifications', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data, error } = await admin
    .from('notifications')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT);

  if (error) {
    console.error('[notifications] list failed:', error.message);
    throw serverError();
  }
  return { body: ((data ?? []) as Row[]).map(toNotification) };
});

/**
 * POST /notifications/:id/read — mark one as read.
 *
 * The update is scoped by `user_id` as well as by id, so marking somebody
 * else's notice read matches nothing and answers 404. Checking ownership in a
 * separate read first would be the same number of round trips and leave a gap
 * between the check and the write.
 */
route('POST', '/notifications/:id/read', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data, error } = await admin
    .from('notifications')
    .update({ read: true })
    .eq('id', params.id)
    .eq('user_id', authUser.id)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[notifications] mark read failed:', error.message);
    throw serverError();
  }
  if (!data) throw notFound('That notification is no longer there.');
  return { body: toNotification(data as Row) };
});

// POST /notifications/read-all — clear the bell. Returns the feed as it now
// stands, which is what the store sets its items to.
route('POST', '/notifications/read-all', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { error } = await admin
    .from('notifications')
    .update({ read: true })
    .eq('user_id', authUser.id)
    .eq('read', false);

  if (error) {
    console.error('[notifications] read-all failed:', error.message);
    throw serverError();
  }

  const { data } = await admin
    .from('notifications')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT);

  return { body: ((data ?? []) as Row[]).map(toNotification) };
});

/* ------------------------------------------------------- preferences --- */

// GET /users/me/notification-preferences — the defaults when nothing is set.
// A read does not insert: asking what your preferences are should not create
// a row, and the absence of one is a meaningful "never chose".
route('GET', '/users/me/notification-preferences', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', authUser.id)
    .maybeSingle();
  return { body: toPreferences(data as Row | null) };
});

/**
 * PUT /users/me/notification-preferences — partial, as the frontend sends it.
 *
 * `missionReminders` and `quietHours` are set independently: the panel toggles
 * one without naming the other, so an absent key must leave what is stored
 * alone rather than reset it to the default.
 */
route('PUT', '/users/me/notification-preferences', async (req) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  if (!body || typeof body !== 'object') throw badRequest('Send the request as JSON.');

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: existing } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', authUser.id)
    .maybeSingle();
  const current = toPreferences(existing as Row | null);

  const next: Row = {
    user_id: authUser.id,
    mission_reminders: current.missionReminders,
    quiet_start: current.quietHours?.start ?? null,
    quiet_end: current.quietHours?.end ?? null,
    updated_at: new Date().toISOString(),
  };

  if ('missionReminders' in body) next.mission_reminders = Boolean(body.missionReminders);

  if ('quietHours' in body) {
    const quiet = body.quietHours as { start?: unknown; end?: unknown } | null;
    if (quiet === null) {
      next.quiet_start = null;
      next.quiet_end = null;
    } else {
      const start = Number(quiet?.start);
      const end = Number(quiet?.end);
      const whole = (n: number) => Number.isInteger(n) && n >= 0 && n <= 23;
      if (!whole(start) || !whole(end)) {
        throw badRequest('Quiet hours are two whole hours between 0 and 23.', {
          field: 'quietHours',
        });
      }
      next.quiet_start = start;
      next.quiet_end = end;
    }
  }

  const { data, error } = await admin
    .from('notification_preferences')
    .upsert(next, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[notifications] save preferences failed:', error?.message);
    throw serverError();
  }
  return { body: toPreferences(data as Row) };
});
