/**
 * Missions (handoff §4.5) — the catalog, per-account progress, and the one
 * write that pays a mission's reward.
 *
 * This module finishes what Batch 3.1 started. `POST /career/events` closed the
 * client-supplied-XP hole for events, but missions were still client-side data:
 * `missionStore.advanceByEvent` read `mission.xpReward` out of
 * `src/mock/missions.js` and handed it to `careerStore.awardMissionXp`, so
 * editing a mission in a console minted arbitrary XP. The catalog now lives in
 * `missions` / `mission_objectives`, and the reward is read from the row.
 *
 * The division of trust is the point of this file:
 *
 *   - The **catalog** is authoritative and server-owned.
 *   - **Progress** (`GET`/`PUT /missions/progress`) is advisory. It is written
 *     from the browser so part-done objectives survive a reload, and nothing
 *     that matters is decided from it. The client cannot set `completed`.
 *   - **Completion** is re-derived from `career_events`. `POST
 *     /missions/:id/complete` recounts every objective against the events the
 *     server itself recorded, and refuses the award if they are not met. A
 *     caller who forges progress gets a 409, not XP.
 *
 * The award goes through `public.apply_career_event` — the same transaction
 * `POST /career/events` uses — so a mission's XP, its `completed_missions`
 * bump, its ledger row, its activity row and the First Career Mission
 * achievement are one atomic write, and the natural idempotency key
 * (`mission.completed:<missionId>`) makes a double-click award once.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, conflict, forbidden, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { contextMatches, toProgress } from '../_shared/progression.ts';

type Row = Record<string, unknown>;

const MISSION_COMPLETED = 'mission.completed';

/** Statuses the client is allowed to assert. `completed` is not among them. */
const CLIENT_STATUSES = new Set(['locked', 'available', 'active']);

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* ----------------------------------------------------------- shaping --- */

/** `mission_objectives` row to the MissionObjective the detail panel renders. */
function toObjective(row: Row) {
  return {
    id: row.id,
    label: row.label,
    hint: row.hint ?? undefined,
    event: row.event,
    target: num(row.target) || 1,
    actionLabel: row.action_label ?? undefined,
    actionRoute: row.action_route ?? undefined,
  };
}

/**
 * `missions` row + its objectives, in the frontend's Mission shape.
 *
 * `objectives` is always an array. The frontend's `Mission` typedef declares it
 * required and `missionStore` dereferences it without a guard, so a mission
 * served without objectives would throw in the browser rather than render empty.
 */
function toMission(row: Row, objectives: Row[]) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    category: row.category,
    difficulty: row.difficulty,
    xpReward: num(row.xp_reward),
    locationId: row.location_id ?? undefined,
    pathId: row.path_id ?? undefined,
    reward: row.reward ?? undefined,
    unlocksLevel: row.unlocks_level ?? undefined,
    objectives: objectives.map(toObjective),
  };
}

/**
 * `mission_progress` row to the MissionProgress the store keeps.
 *
 * Named apart from the imported `toProgress`, which shapes *career* progress:
 * two different things called progress in one file is how the wrong one gets
 * returned.
 */
function toMissionProgress(row: Row) {
  return {
    missionId: row.mission_id,
    status: row.status,
    objectiveCounts: (row.objective_counts ?? {}) as Record<string, number>,
    completedAt: row.completed_at ?? undefined,
    lastRemindedAt: row.last_reminded_at ?? undefined,
  };
}

/* -------------------------------------------------------------- shared --- */

type Admin = ReturnType<typeof adminClient>;

/**
 * The caller's home career path, or null.
 *
 * Mirrors `signedInCareerPathId()` in src/services/candidateService.js, with
 * one deliberate narrowing: the frontend falls back to *inferring* a path from
 * interests and skills (`resolvePathForProfile`), whereas this reads the
 * explicit `career_path_id` that onboarding resolves and stores. Inference is a
 * display convenience; gating which missions an account is served should not
 * depend on a guess that could change under it.
 *
 * Null for employer accounts and anyone without a candidate profile — they are
 * simply served the core missions.
 */
async function callerPathId(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('candidate_profiles')
    .select('career_path_id')
    .eq('user_id', userId)
    .maybeSingle();
  return ((data as Row | null)?.career_path_id as string | null) ?? null;
}

/** Objectives for a set of missions, grouped by mission id, in render order. */
async function objectivesFor(admin: Admin, missionIds: string[]) {
  const byMission = new Map<string, Row[]>();
  if (!missionIds.length) return byMission;

  const { data } = await admin
    .from('mission_objectives')
    .select('*')
    .in('mission_id', missionIds)
    .order('sort_order', { ascending: true });

  for (const row of (data ?? []) as Row[]) {
    const key = String(row.mission_id);
    const list = byMission.get(key) ?? [];
    list.push(row);
    byMission.set(key, list);
  }
  return byMission;
}

/**
 * How many times each of `events` has been recorded for this account.
 *
 * This is what makes completion unforgeable: the counts come from
 * `career_events`, which only `POST /career/events` writes and which is keyed
 * so that one application, one course or one district counts once (see
 * NATURAL_KEY in routes/career.ts). Counting rows per event name therefore
 * gives "three *distinct* suitable applications", not three clicks.
 *
 * The count spans the account's whole history on purpose. An objective asks
 * "have you done this?", and the honest answer does not depend on whether the
 * mission happened to be on screen at the time.
 */
async function eventCounts(admin: Admin, userId: string, events: string[]) {
  const counts = new Map<string, number>();
  if (!events.length) return counts;

  const { data } = await admin
    .from('career_events')
    .select('event')
    .eq('user_id', userId)
    .in('event', events);

  for (const row of (data ?? []) as Row[]) {
    const key = String(row.event);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/* --------------------------------------------------------------- reads --- */

/**
 * GET /missions/progress — this account's mission progress, keyed by mission id.
 *
 * Registered before `/missions/:id` deliberately: the router matches in
 * registration order and both patterns are two segments, so the literal has to
 * win or `progress` would be read as a mission id.
 */
route('GET', '/missions/progress', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('mission_progress')
    .select('*')
    .eq('user_id', authUser.id);

  const progress: Record<string, unknown> = {};
  for (const row of (data ?? []) as Row[]) {
    progress[String(row.mission_id)] = toMissionProgress(row);
  }
  // Wrapped in `{ progress }` because that is what missionService reads.
  return { body: { progress } };
});

/**
 * GET /missions — the catalog this account is served.
 *
 * Core missions serve everyone. A mission with a `path_id` belongs to that
 * career path's chain and is only served to accounts resolved to it (§4.6),
 * which is the rule the mock applied client-side. `?pathId=` overrides the
 * caller's own path so a panel can preview another chain, exactly as
 * `listMissions({ pathId })` does.
 */
route('GET', '/missions', async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const locationId = url.searchParams.get('locationId');
  const askedPath = url.searchParams.get('pathId');

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data, error } = await admin
    .from('missions')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[missions] list failed:', error.message);
    throw serverError();
  }

  // Filtered here rather than in the query, as routes/jobs.ts does: the catalog
  // is small, the three predicates read as one rule, and it keeps the builder
  // off the chained-.eq()-after-.order() shape the client types reject.
  const myPath = askedPath ?? (await callerPathId(admin, authUser.id));
  const rows = ((data ?? []) as Row[]).filter((row) => {
    if (type && row.type !== type) return false;
    if (locationId && row.location_id !== locationId) return false;
    if (row.path_id && row.path_id !== myPath) return false;
    return true;
  });

  const objectives = await objectivesFor(admin, rows.map((r) => String(r.id)));
  return {
    body: rows.map((row) => toMission(row, objectives.get(String(row.id)) ?? [])),
  };
});

/** GET /missions/:id — one mission, with its objectives. */
route('GET', '/missions/:id', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('missions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  const row = data as Row | null;
  if (!row) throw notFound('That mission does not exist.');

  // A path mission is not readable by an account on another path: it would show
  // a mission in the UI that can never be completed there.
  if (row.path_id) {
    const myPath = await callerPathId(admin, authUser.id);
    if (row.path_id !== myPath) throw forbidden('That mission belongs to another career path.');
  }

  const objectives = await objectivesFor(admin, [String(row.id)]);
  return { body: toMission(row, objectives.get(String(row.id)) ?? []) };
});

/* ------------------------------------------------------------- writes --- */

/**
 * PUT /missions/progress — store the browser's in-flight objective counts.
 *
 * Advisory by design (see the header, and the comment on `mission_progress`).
 * Three things are enforced anyway, because a cache that can assert anything is
 * a cache that will eventually be used as a source of truth by mistake:
 *
 *   1. Unknown mission ids are dropped rather than inserted.
 *   2. Counts are clamped to each objective's real `target`, so the UI cannot
 *      store "47 of 3".
 *   3. `completed` cannot be set here. Only `POST /missions/:id/complete`
 *      writes it, and only after re-deriving the objectives from
 *      `career_events`.
 */
route('PUT', '/missions/progress', async (req) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const incoming = body?.progress;
  if (!incoming || typeof incoming !== 'object') {
    throw badRequest('Send the progress map as JSON.', { field: 'progress' });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const ids = Object.keys(incoming as Record<string, unknown>);

  // Only ids that are really missions, and only their real objective targets.
  // An empty payload writes nothing and simply reads back the stored map.
  const { data: known } = await admin.from('missions').select('id').in('id', ids);
  const knownIds = new Set(((known ?? []) as Row[]).map((r) => String(r.id)));
  const objectives = await objectivesFor(admin, [...knownIds]);

  // What is already stored for these missions. Two things depend on it: a
  // payload that omits `lastRemindedAt` must not wipe the 24h reminder stamp,
  // and a `completed` row must be left exactly as it is.
  const { data: storedRows } = await admin
    .from('mission_progress')
    .select('mission_id, status, last_reminded_at')
    .eq('user_id', authUser.id)
    .in('mission_id', [...knownIds]);
  const stored = new Map(
    ((storedRows ?? []) as Row[]).map((r) => [String(r.mission_id), r]),
  );

  const rows = [...knownIds].map((missionId) => {
    const state = ((incoming as Record<string, Row>)[missionId] ?? {}) as Row;
    const targets = new Map(
      (objectives.get(missionId) ?? []).map((o) => [String(o.id), num(o.target) || 1]),
    );

    const counts: Record<string, number> = {};
    const given = (state.objectiveCounts ?? {}) as Record<string, unknown>;
    for (const [objectiveId, target] of targets) {
      const value = Math.floor(num(given[objectiveId]));
      if (value > 0) counts[objectiveId] = Math.min(target, value);
    }

    const asked = String(state.status ?? 'active');
    const reminded =
      (state.lastRemindedAt as string | null | undefined) ??
      (stored.get(missionId)?.last_reminded_at as string | null | undefined) ??
      null;

    return {
      user_id: authUser.id,
      mission_id: missionId,
      status: CLIENT_STATUSES.has(asked) ? asked : 'active',
      objective_counts: counts,
      last_reminded_at: reminded,
      updated_at: new Date().toISOString(),
    };
  });

  // The client must not be able to reopen a mission the server already paid out.
  const writable = rows.filter((r) => stored.get(r.mission_id)?.status !== 'completed');

  if (writable.length) {
    const { error } = await admin
      .from('mission_progress')
      .upsert(writable, { onConflict: 'user_id,mission_id' });
    if (error) {
      console.error('[missions] save progress failed:', error.message);
      throw serverError();
    }
  }

  const { data: fresh } = await admin
    .from('mission_progress')
    .select('*')
    .eq('user_id', authUser.id);

  const progress: Record<string, unknown> = {};
  for (const row of (fresh ?? []) as Row[]) progress[String(row.mission_id)] = toMissionProgress(row);
  return { body: { progress } };
});

/**
 * POST /missions/:id/complete — the write that pays the mission.
 *
 * The caller says only *which* mission. The reward comes from
 * `missions.xp_reward` and the proof comes from `career_events`; neither is
 * read from the request. If the account has not actually done the work the
 * objectives name, this answers 409 with what is still outstanding — which is
 * also what the UI needs to explain itself.
 *
 * Reputation is deliberately 0. The verifiable work *inside* a mission already
 * raised reputation through its own event (a passed challenge, a finished
 * interview); counting it again at the mission boundary would make the number
 * fiction. This mirrors the note in src/utils/careerEvents.js.
 */
route('POST', '/missions/:id/complete', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: missionRow } = await admin
    .from('missions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  const mission = missionRow as Row | null;
  if (!mission) throw notFound('That mission does not exist.');

  if (mission.path_id) {
    const myPath = await callerPathId(admin, authUser.id);
    if (mission.path_id !== myPath) {
      throw forbidden('That mission belongs to another career path.');
    }
  }

  const objectives = (await objectivesFor(admin, [String(mission.id)])).get(String(mission.id)) ?? [];
  if (!objectives.length) {
    // A mission with no objectives can never be shown as completable, so a
    // request for one is a data fault rather than a user error.
    console.error('[missions] mission has no objectives:', mission.id);
    throw serverError();
  }

  // Re-derive the objectives from the events the server recorded.
  const counts = await eventCounts(
    admin,
    authUser.id,
    [...new Set(objectives.map((o) => String(o.event)))],
  );

  const outstanding = objectives
    .map((o) => ({
      id: String(o.id),
      label: String(o.label),
      event: String(o.event),
      target: num(o.target) || 1,
      done: Math.min(num(o.target) || 1, counts.get(String(o.event)) ?? 0),
    }))
    .filter((o) => o.done < o.target);

  if (outstanding.length) {
    throw conflict('That mission is not finished yet.', { outstanding });
  }

  // Same transaction `POST /career/events` uses, so the XP, the statistic, the
  // ledger row, the activity row and the achievement move together or not at all.
  const context = { missionId: String(mission.id) };

  const { data: listening } = await admin
    .from('achievements')
    .select('id, context_key, context_value')
    .eq('event', MISSION_COMPLETED);

  const achievementIds = ((listening ?? []) as Row[])
    .filter((a) =>
      contextMatches(
        a.context_key ? String(a.context_key) : null,
        a.context_value ? String(a.context_value) : null,
        context,
      ),
    )
    .map((a) => String(a.id));

  const { data: applied, error } = await admin.rpc('apply_career_event', {
    p_user_id: authUser.id,
    p_event: MISSION_COMPLETED,
    p_context: context,
    // Identical to the key routes/career.ts derives for this event, so firing
    // `mission.completed` through either endpoint awards exactly once.
    p_idempotency_key: `${MISSION_COMPLETED}:${String(mission.id).toLowerCase()}`,
    p_xp: num(mission.xp_reward),
    p_reputation: 0,
    p_label: `Mission complete - ${String(mission.title)}`,
    p_stat_column: 'completed_missions',
    p_one_shot: false,
    p_achievement_ids: achievementIds,
  });

  if (error || !applied) {
    console.error('[missions] complete failed:', error?.message);
    throw serverError();
  }

  const result = applied as Record<string, unknown>;
  const completedAt = (result.occurred_at as string) ?? new Date().toISOString();

  // Record the completion so the catalog reads as done on the next load. The
  // objective counts are stored at their targets: the work is finished, and the
  // panel should not have to recount events to draw a full bar.
  const { error: progressError } = await admin.from('mission_progress').upsert(
    {
      user_id: authUser.id,
      mission_id: String(mission.id),
      status: 'completed',
      objective_counts: Object.fromEntries(
        objectives.map((o) => [String(o.id), num(o.target) || 1]),
      ),
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,mission_id' },
  );
  if (progressError) {
    // The award is already durable, so this is logged rather than raised: a
    // failed bookkeeping row must not read to the client as a failed mission.
    console.error('[missions] mark completed failed:', progressError.message);
  }

  const awardedIds = (result.awarded_achievements ?? []) as string[];
  let awarded: unknown[] = [];
  if (awardedIds.length) {
    const { data: rows } = await admin
      .from('achievements')
      .select('*')
      .in('id', awardedIds)
      .order('sort_order', { ascending: true });
    awarded = ((rows ?? []) as Row[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      event: row.event,
      count: num(row.required_count) || 1,
      earned: true,
      verified: true,
      progress: num(row.required_count) || 1,
      earnedAt: completedAt,
    }));
  }

  return {
    status: result.status === 'applied' ? 201 : 200,
    body: {
      status: result.status,
      missionId: mission.id,
      completedAt,
      xpAwarded: num(result.xp_awarded),
      // The new totals, in the same shape `POST /career/events` returns. The
      // client sets its XP from whichever endpoint replied, so a mission that
      // answered only with its own `xpAwarded` would leave the browser adding
      // the reward to a total it had not re-read — which is the client-side
      // arithmetic this batch exists to remove.
      progress: toProgress({
        xp: num(result.xp_total),
        reputation: num(result.reputation),
      }),
      awardedAchievements: awarded,
    },
  };
});

/**
 * POST /missions/:id/reminded — stamp a mission as nudged, for the 24h rule.
 *
 * The frontend evaluates `dueMissionReminders` on load because the mock cannot
 * run cron; the stamp has to be server-side regardless, or the rule resets with
 * the browser's storage.
 */
route('POST', '/missions/:id/reminded', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: known } = await admin
    .from('missions')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (!known) throw notFound('That mission does not exist.');

  const now = new Date().toISOString();

  // Update-then-insert rather than a plain upsert: an upsert would have to name
  // `status`, and naming it would reset a mission that is already `completed`
  // back to `active` every time a reminder fired. Only the stamp moves here.
  const { data: existing } = await admin
    .from('mission_progress')
    .select('mission_id')
    .eq('user_id', authUser.id)
    .eq('mission_id', params.id)
    .maybeSingle();

  const { error } = existing
    ? await admin
        .from('mission_progress')
        .update({ last_reminded_at: now, updated_at: now })
        .eq('user_id', authUser.id)
        .eq('mission_id', params.id)
    : await admin.from('mission_progress').insert({
        user_id: authUser.id,
        mission_id: params.id,
        status: 'active',
        last_reminded_at: now,
        updated_at: now,
      });

  if (error) {
    console.error('[missions] mark reminded failed:', error.message);
    throw serverError();
  }

  return { body: { missionId: params.id, lastRemindedAt: now } };
});

/**
 * Not implemented here: `POST /missions/:id/attempt`, which
 * `missionService.runSkillChallenge` calls. Grading an attempt is the AI
 * service's job (`POST /ai/...`, §4.7) — it needs the model credentials and a
 * rubric, and a stub that invented a score would be worse than a 404. The mock
 * branch keeps serving it until that batch lands.
 */
