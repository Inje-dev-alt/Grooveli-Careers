import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { requireUser } from '../_shared/auth.ts';

/**
 * The live ticker (handoff item 8).
 *
 * Two feeds interleaved: what people on Grooveli have just achieved, and what
 * is happening in the wider market. The first says the place is inhabited;
 * the second says it is connected to the world outside it. Either alone is
 * half a ticker — a wall of our own achievements reads as marketing, and a
 * wall of headlines reads as an RSS reader somebody left running.
 */

type Row = Record<string, unknown>;

/**
 * What a public ticker is allowed to announce, and how to say it.
 *
 * `shareable` is the right flag for somebody's OWN activity feed, where the
 * audience is them. It is far too broad for a strip every signed-in person
 * can read, for two separate reasons.
 *
 * PRIVACY. `application.suitable` is shareable, so without this the ticker
 * would announce "Tester T. applied to a suitable role" to everybody —
 * including, on a platform with employers on it, the one she currently works
 * for. Broadcasting that somebody is job hunting is a real-world consequence,
 * and no career platform should do it as a side effect of a scrolling strip.
 * Offers are excluded for the same reason: accepting one says you are leaving.
 *
 * SIGNAL. Visiting a district and viewing a job are the most repeatable
 * actions in the product and mean nothing to anybody else. A ticker full of
 * them is what a dead city looks like with the lights on.
 *
 * What remains is verified capability — the thing this product claims to
 * exist for. Proof rather than promises, and nothing about who is looking.
 *
 * The phrasing is per type rather than taken from the row, because the
 * labels in EVENT_LABELS are written as ledger entries ("Course completed")
 * and read badly after a name. Richer sentences would need the progression
 * write to carry the course or skill through to the activity row.
 */
const TICKER_EVENTS = {
  'skill.challenge': 'passed a skill challenge',
  'course.completed': 'finished a course',
  'interview.simulated': 'completed an interview simulation',
  'assessment.completed': 'finished their career assessment',
  'mission.completed': 'completed a mission',
} as Record<string, string>;


/** How many of each half to send. */
const PER_SIDE = 8;

/**
 * "Amara K." — first name, initial of the last.
 *
 * A public ticker naming people in full is a different privacy proposition
 * from one that does not, and the shortened form costs nothing while being
 * considerably harder to search for.
 */
function shortName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Someone';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * GET /ticker — recent milestones and headlines, newest first.
 *
 * Signed in only. The ticker names real people, and a feed of who achieved
 * what is not something to serve to anyone who finds the URL.
 */
route('GET', '/ticker', async (req) => {
  const admin = adminClient();
  await requireUser(req);

  const [{ data: activity }, { data: optedOut }, { data: news }] = await Promise.all([
    /*
     * `shareable` is already set per event by the progression write — an
     * application is shareable, a one-off like finishing onboarding is not —
     * so the ticker does not need to decide what is worth announcing. It was
     * decided when the thing happened.
     */
    admin
      .from('career_activity')
      .select('id, user_id, type, xp, created_at')
      .eq('shareable', true)
      .in('type', Object.keys(TICKER_EVENTS))
      .order('created_at', { ascending: false })
      .limit(PER_SIDE * 4),
    admin.from('leaderboard_opt_out').select('user_id'),
    admin
      .from('news_items')
      .select('uuid, title, source, published_at, fetched_at, url')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(PER_SIDE),
  ]);

  /*
   * ONE OPT-OUT, NOT TWO.
   *
   * Somebody who opted out of the public leaderboard has said they do not
   * want to be listed publicly. Reading that as "ranked, specifically" and
   * putting their name in a ticker anyway would be technically defensible and
   * a straightforward breach of what they asked for. Excluded before the list
   * is built, as everywhere else that honours it.
   */
  const hidden = new Set(((optedOut ?? []) as Row[]).map((r) => String(r.user_id)));
  const rows = ((activity ?? []) as Row[]).filter((r) => !hidden.has(String(r.user_id)));

  const ids = [...new Set(rows.map((r) => String(r.user_id)))];
  const { data: profiles } = ids.length
    ? await admin.from('profiles').select('id, display_name').in('id', ids)
    : { data: [] };

  const nameOf = new Map(
    ((profiles ?? []) as Row[]).map((r) => [String(r.id), String(r.display_name ?? '')]),
  );

  /*
   * One line per person per kind of achievement.
   *
   * Visiting districts is shareable and repeatable, so without this a player
   * exploring the map fills the entire strip with their own name saying the
   * same thing five times. The newest of each wins, because the rows arrive
   * newest first.
   */
  const seen = new Set<string>();
  const distinct = rows.filter((row) => {
    const key = `${row.user_id}|${row.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const milestones = distinct.slice(0, PER_SIDE).map((row) => ({
    kind: 'milestone' as const,
    id: String(row.id),
    text: `${shortName(nameOf.get(String(row.user_id)) || '')} ${TICKER_EVENTS[String(row.type)]}`,
    xp: typeof row.xp === 'number' ? row.xp : 0,
    at: String(row.created_at),
  }));

  const headlines = ((news ?? []) as Row[]).map((row) => ({
    kind: 'news' as const,
    // The source's own article id. `url` was the key when these came from
    // RSS; the news API's listing does not return one, and the link is a
    // best-effort second lookup that may be null — see scheduler/news.ts.
    id: String(row.uuid),
    text: String(row.title),
    source: String(row.source ?? ''),
    // Null when the link lookup failed. The client renders those as plain
    // text rather than a dead anchor, so it must stay null rather than
    // becoming the string "null".
    url: typeof row.url === 'string' && row.url ? row.url : null,
    at: String(row.published_at ?? row.fetched_at),
  }));

  /*
   * Interleaved rather than concatenated, so the strip alternates between the
   * two kinds instead of showing eight of one and then eight of the other.
   * Whichever side runs out, the remainder of the other follows.
   */
  const items: unknown[] = [];
  for (let i = 0; i < Math.max(milestones.length, headlines.length); i += 1) {
    if (milestones[i]) items.push(milestones[i]);
    if (headlines[i]) items.push(headlines[i]);
  }

  return { body: items };
});
