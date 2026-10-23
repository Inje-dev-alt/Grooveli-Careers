/**
 * Career progression (handoff §4.5) — XP, levels, reputation, statistics,
 * achievements, the XP ledger and the activity stream.
 *
 * This module is the point at which progression stops being client-side.
 * Previously six endpoints took numbers straight from the browser:
 * `PUT /career/progress`, `POST /career/ledger`, `POST /career/stats/increment`,
 * `POST /career/achievements/evaluate`, `POST /career/one-time-events` and
 * `POST /career/activity`. Any of them could be forged from a console, so a
 * level meant nothing. They are all replaced by one write, `POST /career/events`,
 * which is told *what happened* and decides for itself what that is worth.
 *
 * Two rules hold throughout:
 *
 * 1. No client-supplied XP, ever. Every number comes from the tables in
 *    `_shared/progression.ts` or from the database. The mock's
 *    `recordActivity({ xp })` and the mission reward passed up from the browser
 *    are both ignored — see the note on `mission.completed` in the POST handler.
 * 2. `level` is never stored. It is derived from total XP on every read, so the
 *    badge and the ledger cannot disagree.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { ApiError, badRequest, forbidden, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import {
  CAREER_EVENTS,
  EVENT_LABELS,
  ONE_SHOT_EVENTS,
  REPUTATION_REWARDS,
  STAT_FOR_EVENT,
  XP_REWARDS,
  type CareerEvent,
  careerTitleForLevel,
  contextMatches,
  isCareerEvent,
  resolveProgression,
} from '../_shared/progression.ts';

type Row = Record<string, unknown>;

const ACTIVITY_LIMIT_MAX = 60;
const LEDGER_LIMIT = 60;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* ----------------------------------------------------------- shaping --- */

/**
 * `career_progress` row to the CareerProgress JSON the HUD renders.
 *
 * A missing row is not an error: progression is created on the first event,
 * never handed out at registration, so a new account reads as a clean level 1.
 */
function toProgress(row: Row | null) {
  const xp = num(row?.xp);
  const { level, xpIntoLevel, xpForNextLevel, progress } = resolveProgression(xp);
  return {
    xp,
    level,
    reputation: num(row?.reputation),
    title: careerTitleForLevel(level),
    xpIntoLevel,
    xpForNextLevel,
    progress,
    updatedAt: row?.updated_at ?? null,
  };
}

function toStats(row: Row | null) {
  return {
    completedMissions: num(row?.completed_missions),
    certifications: num(row?.certifications),
    applications: num(row?.applications),
    interviews: num(row?.interviews),
    offers: num(row?.offers),
    jobsViewed: num(row?.jobs_viewed),
    locationsVisited: num(row?.locations_visited),
  };
}

/** Catalog row + this account's counter, in the mock's Achievement shape. */
function toAchievement(row: Row, progress: Row | undefined) {
  const required = num(row.required_count) || 1;
  const earned = Boolean(progress?.awarded_at);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    event: row.event,
    count: required,
    context: row.context_key
      ? { key: row.context_key, value: row.context_value }
      : null,
    earned,
    verified: earned,
    progress: Math.min(required, num(progress?.count)),
    earnedAt: progress?.awarded_at ?? null,
  };
}

/** `xp_ledger` row to the `{ id, event, label, xp, at }` the drawer renders. */
function toLedgerEntry(row: Row) {
  return {
    id: row.id,
    event: row.event,
    label: row.reason,
    xp: num(row.amount),
    at: row.created_at,
  };
}

function toActivity(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    label: row.label,
    xp: num(row.xp),
    createdAt: row.created_at,
    shareable: row.shareable ?? true,
  };
}

/* -------------------------------------------------------------- reads --- */

// GET /career/progress — XP, derived level, reputation.
route('GET', '/career/progress', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('career_progress')
    .select('*')
    .eq('user_id', authUser.id)
    .maybeSingle();
  return { body: toProgress(data as Row | null) };
});

// GET /career/stats — the seven counters behind the HUD and the profile.
route('GET', '/career/stats', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('career_stats')
    .select('*')
    .eq('user_id', authUser.id)
    .maybeSingle();
  return { body: toStats(data as Row | null) };
});

// GET /career/achievements — the whole catalog, with this account's progress
// resolved against it. The catalog is returned in full (not just the earned
// ones) because the screen shows what is still available to earn.
route('GET', '/career/achievements', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const [{ data: catalog }, { data: mine }] = await Promise.all([
    admin.from('achievements').select('*').order('sort_order', { ascending: true }),
    admin.from('achievement_progress').select('*').eq('user_id', authUser.id),
  ]);

  const byId = new Map<string, Row>();
  for (const row of (mine ?? []) as Row[]) byId.set(String(row.achievement_id), row);

  return {
    body: ((catalog ?? []) as Row[]).map((row) => toAchievement(row, byId.get(String(row.id)))),
  };
});

// GET /career/ledger — why the level went up, newest first.
route('GET', '/career/ledger', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('xp_ledger')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(LEDGER_LIMIT);
  return { body: ((data ?? []) as Row[]).map(toLedgerEntry) };
});

// GET /career/activity — the career-work log behind social proof.
route('GET', '/career/activity', async (req) => {
  const url = new URL(req.url);
  const asked = Number(url.searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(asked)
    ? Math.min(ACTIVITY_LIMIT_MAX, Math.max(1, Math.floor(asked)))
    : 20;

  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('career_activity')
    .select('*')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { body: ((data ?? []) as Row[]).map(toActivity) };
});

// GET /career/one-time-events — which one-shot awards this account has already
// had counted. Replaces the client array that a page reload used to reset.
route('GET', '/career/one-time-events', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('career_events')
    .select('event')
    .eq('user_id', authUser.id)
    .in('event', [...ONE_SHOT_EVENTS]);
  const seen = new Set(((data ?? []) as Row[]).map((r) => String(r.event)));
  return { body: [...seen] };
});

/* ------------------------------------------------------------- the write --- */

/**
 * The context field that makes each event naturally unique.
 *
 * This is what stops XP farming. An idempotency key supplied by the client
 * only protects against an accidental double-fire — a caller who wants the XP
 * twice simply sends a fresh key. Deriving the key from the thing the event is
 * *about* means the database's `unique (user_id, idempotency_key)` enforces the
 * real product rule: one award per application, per course, per skill, per
 * district. Re-firing returns `replayed` and awards nothing.
 *
 * `location.visited` is keyed on the district, which makes Career Explorer
 * "visit five districts" rather than "visit one district five times" — the mock
 * counted repeat visits, and the achievement's own description disagrees with
 * it. The description is right.
 */
const NATURAL_KEY: Partial<Record<CareerEvent, string>> = {
  'application.suitable': 'applicationId',
  'application.unsuitable': 'applicationId',
  'application.rejected': 'applicationId',
  'offer.received': 'applicationId',
  'offer.accepted': 'applicationId',
  'offer.declined': 'applicationId',
  'experience.added': 'experienceId',
  'interview.simulated': 'simulationId',
  'skill.challenge': 'skill',
  'course.completed': 'courseId',
  'mission.completed': 'missionId',
  'job.viewed': 'jobId',
  'job.saved': 'jobId',
  'location.visited': 'location',
  'social.posted': 'postId',
  'social.connected': 'connectionId',
  'referral.requested': 'referralId',
};

/** Events whose `applicationId` must belong to the caller before it counts. */
const OWNED_APPLICATION_EVENTS = new Set<string>([
  'application.suitable',
  'application.unsuitable',
  'application.rejected',
  'offer.received',
  'offer.accepted',
  'offer.declined',
]);

const slug = (v: unknown) => String(v ?? '').trim().toLowerCase().slice(0, 120);

// POST /career/events — the single progression write.
//
// The caller says only what happened ("skill.challenge", { skill: 'Excel' }).
// XP, reputation, the label, the statistic and the achievements are all decided
// here from `_shared/progression.ts`, then applied in one transaction by
// `public.apply_career_event`.
route('POST', '/career/events', async (req) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw badRequest('Send the request as JSON.');

  const event = String(body.event ?? '');
  if (!isCareerEvent(event)) {
    throw badRequest('That is not a career event we record.', {
      field: 'event',
      allowed: CAREER_EVENTS,
    });
  }

  const context = (body.context && typeof body.context === 'object'
    ? body.context
    : {}) as Record<string, unknown>;

  // `mission.completed` is the one event this endpoint will not accept.
  //
  // A mission's reward is a property of the mission, not of the event, so it
  // has to be read from `missions.xp_reward` and only paid once the objectives
  // have been checked against the account's recorded events. That is exactly
  // what `POST /missions/:id/complete` does (Batch 3.2). Allowing it here too
  // would be worse than redundant: both paths derive the same natural
  // idempotency key, `mission.completed:<missionId>`, so whichever arrived
  // first would win and the other would replay as a no-op — and if this
  // generic path arrived first it would record the completion for 0 XP and the
  // mission could never pay out. One owner, therefore.
  //
  // Batch 3.3 note: `src/stores/progression.js` still fires this event through
  // its fan-out (`recordCareerEvent(CAREER_EVENTS.MISSION_COMPLETED, …)`);
  // that call is replaced by `missionService.completeMission(id)` when the
  // frontend moves onto the single event.
  if (event === 'mission.completed') {
    throw badRequest(
      'Mission completion is recorded by the mission endpoint, which verifies the objectives and pays the mission its own reward.',
      { replacedBy: 'POST /missions/:id/complete' },
    );
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  // An application-shaped event has to be about the caller's own application,
  // or the `applications` counter and the ledger could be inflated with
  // somebody else's id.
  if (OWNED_APPLICATION_EVENTS.has(event)) {
    const applicationId = String(context.applicationId ?? '').trim();
    if (!applicationId) {
      throw badRequest('That event needs the application it refers to.', {
        field: 'context.applicationId',
      });
    }
    const { data: owned } = await admin
      .from('applications')
      .select('id, candidate_id')
      .eq('id', applicationId)
      .maybeSingle();
    if (!owned || (owned as Row).candidate_id !== authUser.id) {
      throw forbidden('That application is not yours.');
    }
  }

  // XP comes from our table and nowhere else; `mission.completed`, the one
  // event whose value is per-row rather than per-event, was refused above.
  const xp = XP_REWARDS[event] ?? 0;
  const reputation = REPUTATION_REWARDS[event] ?? 0;
  const label = EVENT_LABELS[event];
  const statColumn = STAT_FOR_EVENT[event] ?? null;
  const oneShot = ONE_SHOT_EVENTS.has(event);

  // A one-shot event is unique by its own name. Otherwise prefer the natural
  // key, and fall back to the client's key (or a fresh uuid) only for events
  // with nothing to key on — all of which are worth 0 XP.
  const naturalField = NATURAL_KEY[event];
  const naturalValue = naturalField ? slug(context[naturalField]) : '';
  const idempotencyKey = oneShot
    ? event
    : naturalValue
      ? `${event}:${naturalValue}`
      : slug(body.idempotencyKey) || crypto.randomUUID();

  // Which achievements this event legitimately advances. The context test runs
  // here so the RPC is handed only ids it should count — that is what makes
  // the Excel award the Excel challenge rather than whichever came first.
  const { data: listening } = await admin
    .from('achievements')
    .select('id, context_key, context_value')
    .eq('event', event);

  const achievementIds = ((listening ?? []) as Row[])
    .filter((a) =>
      contextMatches(
        a.context_key ? String(a.context_key) : null,
        a.context_value ? String(a.context_value) : null,
        context,
      ),
    )
    .map((a) => String(a.id));

  const { data, error } = await admin.rpc('apply_career_event', {
    p_user_id: authUser.id,
    p_event: event,
    p_context: context,
    p_idempotency_key: idempotencyKey,
    p_xp: xp,
    p_reputation: reputation,
    p_label: label,
    p_stat_column: statColumn,
    p_one_shot: oneShot,
    p_achievement_ids: achievementIds,
  });

  if (error || !data) {
    console.error('[career] apply event failed:', error?.message);
    throw serverError();
  }

  const result = data as Record<string, unknown>;
  const awardedIds = (result.awarded_achievements ?? []) as string[];

  // Resolve the newly earned awards to full objects so the client can show the
  // toast without a second round trip.
  let awarded: unknown[] = [];
  if (awardedIds.length) {
    const { data: rows } = await admin
      .from('achievements')
      .select('*')
      .in('id', awardedIds)
      .order('sort_order', { ascending: true });
    awarded = ((rows ?? []) as Row[]).map((row) =>
      toAchievement(row, { count: num(row.required_count), awarded_at: new Date().toISOString() }),
    );
  }

  return {
    status: result.status === 'applied' ? 201 : 200,
    body: {
      status: result.status,
      eventId: result.event_id ?? null,
      occurredAt: result.occurred_at ?? null,
      xpAwarded: num(result.xp_awarded),
      reputationAwarded: num(result.reputation_awarded),
      progress: toProgress({
        xp: num(result.xp_total),
        reputation: num(result.reputation),
      }),
      stats: toStats((result.stats ?? null) as Row | null),
      awardedAchievements: awarded,
    },
  };
});

/* ---------------------------------------------------- retired endpoints --- */

/**
 * The six writes `POST /career/events` replaces.
 *
 * They answer 410 rather than 404 so the failure is unambiguous in the logs:
 * 404 reads as "not built yet", which is the opposite of what happened. Each
 * one used to accept a number from the browser; the frontend's progression
 * fan-out moves onto the single event in Batch 3.3.
 */
const RETIRED: [string, string][] = [
  ['PUT', '/career/progress'],
  ['POST', '/career/ledger'],
  ['POST', '/career/stats/increment'],
  ['POST', '/career/achievements/evaluate'],
  ['POST', '/career/one-time-events'],
  ['POST', '/career/activity'],
];

for (const [method, path] of RETIRED) {
  route(method, path, () => {
    throw new ApiError(
      'Progression is recorded by the server now. Send the career event instead.',
      410,
      'endpoint_retired',
      { replacedBy: 'POST /career/events' },
    );
  });
}
