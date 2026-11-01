import { createClient } from 'jsr:@supabase/supabase-js@2';
import { inQuietHours } from '../api/_shared/quietHours.ts';
import { refreshNews } from '../api/_shared/news.ts';

/**
 * The reminder sweep.
 *
 * A second Edge Function, invoked on a schedule by `pg_cron` — see README.md
 * in this folder for the one-time SQL that sets that up.
 *
 * WHY THIS EXISTS. The 24-hour reminder rule has always run in the browser,
 * on load. `MissionReminders.jsx` even says a backend scheduler runs the same
 * rule, which was never true. So reminders only fired while somebody had the
 * app open — the one moment they are useless, because the missions are right
 * there on the screen.
 *
 * IT IS A SWEEP, NOT A QUEUE. Every run asks the same question of the whole
 * table — who has an active mission they have not been nudged about in a day
 * — rather than consuming scheduled jobs. That makes a missed run harmless:
 * the next one picks up everyone the last one would have. A queue would need
 * to be drained, retried and reconciled, and would be a second source of
 * truth about something `mission_progress` already knows.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** How long somebody is left alone after a nudge. */
const COOLDOWN_HOURS = 24;

/** Nobody gets more than this named in one notice. */
const NAMES_IN_NOTICE = 2;

type Row = Record<string, unknown>;

/**
 * Only the scheduler may call this.
 *
 * The service-role key is already in this function's environment and is
 * already what `pg_cron` will send, so it serves as the shared secret with
 * nothing new to configure and nothing new to leak. A function that writes
 * notifications to every account must not be reachable by anyone who finds
 * its URL.
 */
function authorised(req: Request): boolean {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return Boolean(SERVICE_KEY) && token === SERVICE_KEY;
}

Deno.serve(async (req) => {
  if (!authorised(req)) {
    return new Response(JSON.stringify({ code: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const cutoff = new Date(now.getTime() - COOLDOWN_HOURS * 3600 * 1000).toISOString();

  /*
   * Everyone with an active mission that has gone quiet for a day. A null
   * `last_reminded_at` has never been nudged, which is also due — PostgREST
   * needs that spelled out, because `lt` alone excludes nulls.
   */
  const { data: due, error } = await admin
    .from('mission_progress')
    .select('user_id, mission_id, last_reminded_at')
    .eq('status', 'active')
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${cutoff}`);

  if (error) {
    console.error('[scheduler] could not read mission progress:', error.message);
    return json({ ok: false, error: 'read_failed' }, 500);
  }

  const rows = (due ?? []) as Row[];
  if (!rows.length) return json({ ok: true, swept: 0, notified: 0, reason: 'nothing due' });

  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const userId = String(row.user_id);
    const list = byUser.get(userId) ?? [];
    list.push(String(row.mission_id));
    byUser.set(userId, list);
  }

  const userIds = [...byUser.keys()];

  const [{ data: prefs }, { data: profiles }, { data: missions }] = await Promise.all([
    admin.from('notification_preferences').select('*').in('user_id', userIds),
    admin.from('profiles').select('id, timezone').in('id', userIds),
    admin.from('missions').select('id, title'),
  ]);

  const prefOf = new Map(((prefs ?? []) as Row[]).map((r) => [String(r.user_id), r]));
  const zoneOf = new Map(
    ((profiles ?? []) as Row[]).map((r) => [String(r.id), String(r.timezone ?? 'UTC')]),
  );
  const titleOf = new Map(((missions ?? []) as Row[]).map((r) => [String(r.id), String(r.title)]));

  let notified = 0;
  let skippedQuiet = 0;
  let skippedOff = 0;
  const stamped: { user_id: string; mission_id: string }[] = [];

  for (const [userId, missionIds] of byUser) {
    const pref = prefOf.get(userId);

    // No row means never chose, and the default is on — the same rule the
    // preferences endpoint applies, so a sweep and a screen never disagree.
    if (pref && pref.mission_reminders === false) {
      skippedOff += 1;
      continue;
    }

    const quiet =
      pref && pref.quiet_start !== null && pref.quiet_start !== undefined
        ? { start: Number(pref.quiet_start), end: Number(pref.quiet_end) }
        : null;

    /*
     * The whole reason item 5 came first. Quiet hours are hours on this
     * person's clock, and this is the only place in the product that acts on
     * them unprompted — get the zone wrong here and somebody is woken up.
     *
     * Skipped, not deferred: their rows keep their old stamp, so the next
     * sweep after they wake finds them still due.
     */
    if (inQuietHours(quiet, zoneOf.get(userId) ?? 'UTC', now)) {
      skippedQuiet += 1;
      continue;
    }

    const titles = missionIds.map((id) => titleOf.get(id)).filter(Boolean) as string[];
    if (!titles.length) continue;

    const named = titles.slice(0, NAMES_IN_NOTICE).join(' and ');
    const rest = titles.length - NAMES_IN_NOTICE;

    /*
     * ONE notice per person per sweep, not one per mission. Somebody with
     * five missions in flight does not need five notifications; they need to
     * be told that five are in flight.
     */
    const { error: notifyError } = await admin.from('notifications').insert({
      user_id: userId,
      type: 'mission-reminder',
      title:
        titles.length === 1
          ? `${named} is still open`
          : `${titles.length} missions are still open`,
      body: rest > 0 ? `${named}, and ${rest} more.` : named,
      route: '/missions',
    });

    if (notifyError) {
      console.error(`[scheduler] notice failed for ${userId}:`, notifyError.message);
      continue;
    }

    notified += 1;
    missionIds.forEach((missionId) => stamped.push({ user_id: userId, mission_id: missionId }));
  }

  /*
   * Stamp only the rows actually notified about.
   *
   * Stamping everything the sweep looked at would silence anyone who was
   * asleep for a further day — the cooldown would restart without a notice
   * ever being sent, which is a reminder system that reliably reminds nobody.
   */
  for (const row of stamped) {
    await admin
      .from('mission_progress')
      .update({ last_reminded_at: now.toISOString() })
      .eq('user_id', row.user_id)
      .eq('mission_id', row.mission_id);
  }

  /*
   * The news cache rides the same timer.
   *
   * Last, and awaited rather than fired and forgotten, so a run's summary
   * describes everything it did. It rate-limits itself on the cache's own
   * freshness, so the sweep can stay on a half-hourly cron while the feeds
   * are only read every couple of hours.
   *
   * Failures here are reported, never thrown: somebody else's feed being
   * down must not stop people being reminded about their missions.
   */
  const news = await refreshNews(admin, now).catch((error) => {
    console.error('[scheduler] news refresh threw:', error?.message);
    return { fetched: 0, failed: ['threw'] };
  });

  const summary = {
    ok: true,
    swept: byUser.size,
    notified,
    skippedQuiet,
    skippedOff,
    stamped: stamped.length,
    news,
  };
  console.log('[scheduler]', JSON.stringify(summary));
  return json(summary);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
