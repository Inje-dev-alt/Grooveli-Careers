/**
 * City standings (handoff §5).
 *
 * **Ranked by reputation, never by XP.** Reputation only moves on work someone
 * else could verify — a passed assessment, a finished course, a completed
 * interview — while XP moves on everything. A board ranked by XP would become
 * a farming contest within a week, and the board is supposed to be the one
 * number an employer can read without context.
 *
 * **An opted-out account is absent for everyone**, not hidden from itself. The
 * prototype filtered only the viewer's own row (`!e.isMe || !optedOut`), so
 * opting out removed you from your own screen and left you on everybody
 * else's — which is the opposite of what the setting promises. Here the
 * exclusion happens before the ranks are assigned, so the board has no gap
 * where an opted-out account used to be.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { requireUser } from '../_shared/auth.ts';
import { resolveProgression } from '../_shared/progression.ts';

type Row = Record<string, unknown>;

const BOARD_LIMIT = 50;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * GET /leaderboard — the standings.
 *
 * Only accounts with a candidate profile are ranked: an employer has no career
 * to compare. Reputation decides it, with career level breaking ties.
 */
route('GET', '/leaderboard', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const [{ data: progress }, { data: optedOut }] = await Promise.all([
    admin.from('career_progress').select('user_id, xp, reputation'),
    admin.from('leaderboard_opt_out').select('user_id'),
  ]);

  const hidden = new Set(((optedOut ?? []) as Row[]).map((r) => String(r.user_id)));
  const rows = ((progress ?? []) as Row[]).filter((r) => !hidden.has(String(r.user_id)));
  if (!rows.length) return { body: [] };

  const ids = rows.map((r) => String(r.user_id));

  // A candidate profile is what makes an account rankable, and it carries the
  // headline the board shows.
  const [{ data: candidates }, { data: profiles }] = await Promise.all([
    admin.from('candidate_profiles').select('user_id, headline').in('user_id', ids),
    admin.from('profiles').select('id, display_name').in('id', ids),
  ]);

  const headlineOf = new Map(
    ((candidates ?? []) as Row[]).map((r) => [String(r.user_id), String(r.headline ?? '')]),
  );
  const nameOf = new Map(
    ((profiles ?? []) as Row[]).map((r) => [String(r.id), String(r.display_name ?? '')]),
  );

  const board = rows
    .filter((row) => headlineOf.has(String(row.user_id)))
    .map((row) => {
      const userId = String(row.user_id);
      return {
        id: userId,
        name: nameOf.get(userId) || 'Grooveli member',
        headline: headlineOf.get(userId) || 'Grooveli candidate',
        careerLevel: resolveProgression(num(row.xp)).level,
        reputation: num(row.reputation),
        color: '#5be3c8',
        isMe: userId === authUser.id,
      };
    })
    .sort((a, b) => b.reputation - a.reputation || b.careerLevel - a.careerLevel)
    .slice(0, BOARD_LIMIT)
    // Ranks are assigned after the sort and after the exclusions, so they run
    // 1..n with no gaps.
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { body: board };
});

/** GET /leaderboard/opt-out — true when this account is hidden. */
route('GET', '/leaderboard/opt-out', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('leaderboard_opt_out')
    .select('user_id')
    .eq('user_id', authUser.id)
    .maybeSingle();
  return { body: Boolean(data) };
});

/**
 * POST /leaderboard/opt-out — `{ optedOut }`.
 *
 * Presence is the state: opting out inserts a row, opting back in deletes it.
 * Returns the state as it now stands, which is what the toggle renders.
 */
route('POST', '/leaderboard/opt-out', async (req) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  const optedOut = Boolean(body?.optedOut);

  const admin = adminClient();
  const authUser = await requireUser(req);

  if (optedOut) {
    await admin
      .from('leaderboard_opt_out')
      .upsert({ user_id: authUser.id }, { onConflict: 'user_id' });
  } else {
    await admin.from('leaderboard_opt_out').delete().eq('user_id', authUser.id);
  }

  return { body: optedOut };
});
