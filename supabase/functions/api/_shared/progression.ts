/**
 * The career progression rules, ported from the frontend so the server owns
 * them (handoff §4.5).
 *
 * Every table here is a verbatim port of `src/utils/careerEvents.js` and
 * `src/utils/progression.js`. They must not drift: the frontend keeps its
 * copies only so the UI can explain an award before it happens, but these are
 * now authoritative. If you change a number here, change it there too.
 *
 * Note: the handoff's §4.5 XP table is *incomplete* — it omits
 * `offer.accepted` (150 XP, +5 reputation) and the explicit zeros for
 * `experience.added`, `application.rejected`, `offer.received`,
 * `offer.declined` and `referral.requested`. `careerEvents.js` is the real
 * source of truth and is what this file follows.
 */

/** The fixed event vocabulary. Anything else is a 400. */
export const CAREER_EVENTS = [
  'profile.completed',
  'cv.uploaded',
  'assessment.completed',
  'experience.added',
  'job.viewed',
  'job.saved',
  'application.suitable',
  'application.unsuitable',
  'application.rejected',
  'interview.simulated',
  'skill.challenge',
  'course.completed',
  'mission.completed',
  'location.visited',
  'ai.consulted',
  'social.posted',
  'social.connected',
  'referral.requested',
  'offer.received',
  'offer.accepted',
  'offer.declined',
] as const;

export type CareerEvent = typeof CAREER_EVENTS[number];

const EVENT_SET = new Set<string>(CAREER_EVENTS);

export const isCareerEvent = (value: string): value is CareerEvent => EVENT_SET.has(value);

/**
 * XP is attached to meaningful career activity only.
 *
 * The deliberate zeros are a product rule, not an oversight: viewing a job,
 * saving a job, walking into a district, posting, being rejected and applying
 * to a role that does not suit the candidate are all worth nothing. Volume
 * alone can never raise a career level.
 *
 * `mission.completed` is 0 here because a mission's XP is its own `xp_reward`,
 * which lives on the `missions` table (Batch 3.2) — it is the one event whose
 * value is a property of the row rather than of the event, so no entry in this
 * table could be right. It is paid by `POST /missions/:id/complete`, which
 * reads the column after verifying the objectives against the account's
 * recorded events; `POST /career/events` refuses the event outright rather
 * than award it for the 0 above. Neither path accepts a reward from the
 * browser, which is the hole these endpoints exist to close.
 */
export const XP_REWARDS: Record<CareerEvent, number> = {
  'profile.completed': 50,
  'cv.uploaded': 25,
  'assessment.completed': 75,
  'skill.challenge': 100,
  'interview.simulated': 100,
  'application.suitable': 25,
  'course.completed': 200,
  'offer.accepted': 150,

  'experience.added': 0,
  'job.viewed': 0,
  'job.saved': 0,
  'application.unsuitable': 0,
  'application.rejected': 0,
  'mission.completed': 0,
  'location.visited': 0,
  'ai.consulted': 0,
  'social.posted': 0,
  'social.connected': 0,
  'referral.requested': 0,
  'offer.received': 0,
  'offer.declined': 0,
};

/**
 * Reputation moves on evidence, not activity — only work another person could
 * verify. Credibility that could be farmed would not be credibility.
 * Reputation is clamped to 0-100 by the column check.
 */
export const REPUTATION_REWARDS: Partial<Record<CareerEvent, number>> = {
  'skill.challenge': 3,
  'course.completed': 5,
  'assessment.completed': 2,
  'interview.simulated': 2,
  'profile.completed': 1,
  'offer.accepted': 5,
};

/** Human-readable labels for the ledger, toasts and the activity stream. */
export const EVENT_LABELS: Record<CareerEvent, string> = {
  'profile.completed': 'Career profile completed',
  'cv.uploaded': 'CV uploaded',
  'assessment.completed': 'AI career assessment completed',
  'experience.added': 'Experience added',
  'job.viewed': 'Job viewed',
  'job.saved': 'Job saved',
  'application.suitable': 'Applied to a suitable role',
  'application.unsuitable': 'Applied to a role outside your match range',
  'application.rejected': 'Application not progressing',
  'interview.simulated': 'Interview simulation completed',
  'skill.challenge': 'Skill challenge completed',
  'course.completed': 'Course completed',
  'mission.completed': 'Mission completed',
  'location.visited': 'District visited',
  'ai.consulted': 'Spoke with Grooveli AI',
  'social.posted': 'Shared a career post',
  'social.connected': 'Connected with a professional',
  'referral.requested': 'Asked a connection for a referral',
  'offer.received': 'Offer received',
  'offer.accepted': 'Offer accepted',
  'offer.declined': 'Offer declined',
};

/**
 * Events that may only ever be counted once per account.
 *
 * Enforced twice: here, so the response is honest, and by the partial unique
 * index `career_events_one_shot_idx`, so a race cannot slip a second row in.
 * The frontend's `one_time_events` array was a guard a page reload reset.
 */
export const ONE_SHOT_EVENTS = new Set<string>([
  'profile.completed',
  'cv.uploaded',
  'assessment.completed',
]);

/**
 * Which `career_stats` column an event advances.
 *
 * `completed_missions` and `applications` are ports of the only `bumpStat`
 * calls the frontend actually makes. The other three are new: `certifications`,
 * `jobs_viewed` and `locations_visited` are rendered by the HUD but were never
 * incremented anywhere in the prototype, so they displayed a permanent zero.
 * Now that the server sees the events, it counts them.
 *
 * `interviews` and `offers` are deliberately absent: they advance on
 * application *stage* transitions, which the employer or the pipeline drives,
 * not on an event the candidate's browser can fire.
 */
export const STAT_FOR_EVENT: Partial<Record<CareerEvent, string>> = {
  'mission.completed': 'completed_missions',
  'application.suitable': 'applications',
  'application.unsuitable': 'applications',
  'course.completed': 'certifications',
  'job.viewed': 'jobs_viewed',
  'location.visited': 'locations_visited',
};

/** A job must be a plausible fit before an application counts as progress. */
export const SUITABLE_MATCH_THRESHOLD = 60;

/* ------------------------------------------------------- the level curve --- */

const BASE_XP = 120;
const GROWTH = 1.18;

/** XP required to advance *from* `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return Math.round(BASE_XP * Math.pow(GROWTH, Math.max(0, level - 1)));
}

/**
 * Resolve a total XP figure into a level and the progress within it.
 *
 * Level is never stored — it is derived here on every read, so the level and
 * the ledger can never disagree.
 */
export function resolveProgression(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
} {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  let level = 1;
  let remaining = xp;

  while (remaining >= xpForLevel(level) && level < 100) {
    remaining -= xpForLevel(level);
    level += 1;
  }

  const xpForNextLevel = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel,
    progress: xpForNextLevel > 0 ? remaining / xpForNextLevel : 1,
  };
}

/** Title shown beside the level badge. */
export function careerTitleForLevel(level: number): string {
  if (level >= 40) return 'Career Luminary';
  if (level >= 30) return 'Principal';
  if (level >= 22) return 'Career Strategist';
  if (level >= 15) return 'Established Professional';
  if (level >= 9) return 'Practitioner';
  if (level >= 4) return 'Emerging Professional';
  return 'Newcomer';
}

/** Does this event carry the context an achievement demands? */
export function contextMatches(
  key: string | null,
  value: string | null,
  context: Record<string, unknown>,
): boolean {
  if (!key) return true;
  if (!context) return false;
  const normalise = (v: unknown) => String(v ?? '').trim().toLowerCase();
  return normalise(context[key]) === normalise(value);
}
