/**
 * Missions.
 * Backed by `GET /missions`, `GET /missions/progress`, `POST /missions/:id/complete`.
 *
 * Three different levels of trust, and the difference matters:
 *
 * - The **catalog** is the backend's. Most importantly `xpReward` is, so the
 *   reward is a fact about the mission rather than a number the browser passes
 *   up. It used to be read out of `src/mock/missions.js` and handed to the
 *   career store, which meant editing a mission in a console minted XP.
 * - **Progress** is advisory. It is written from the browser so part-finished
 *   objectives survive a reload, and nothing that matters is decided from it.
 *   The client cannot assert `completed` and have it believed.
 * - **Completion** is re-derived. `completeMission` asks the backend to pay the
 *   mission, and the backend recounts every objective against the career events
 *   it recorded itself. Forged progress earns a 409, not XP.
 */
import { apiClient, withMock, ApiError } from './apiClient.js';
import { db, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { signedInCareerPathId } from './candidateService.js';
import { mockApplyEvent, mockRecordedEvents } from './careerService.js';
import { CAREER_EVENTS, contextSatisfies } from '../utils/careerEvents.js';

/** @returns {Promise<import('../models/index.js').Mission[]>} */
export function listMissions(filters = {}) {
  return withMock(
    async () => {
      await delay();
      // Core missions serve everyone. A mission with a pathId belongs to that
      // path's chain and only serves accounts resolved to it.
      const myPathId = filters.pathId ?? signedInCareerPathId();
      return db.missions.filter((mission) => {
        if (filters.type && mission.type !== filters.type) return false;
        if (filters.locationId && mission.locationId !== filters.locationId) return false;
        if (mission.pathId && mission.pathId !== myPathId) return false;
        return true;
      });
    },
    () => apiClient.get('/missions', { params: filters }),
  );
}

/** @returns {Promise<import('../models/index.js').Mission | null>} */
export function getMission(missionId) {
  return withMock(
    async () => {
      await delay(180);
      return db.missions.find((m) => m.id === missionId) ?? null;
    },
    () => apiClient.get(`/missions/${missionId}`),
  );
}

/**
 * Mission progress for the signed-in account.
 *
 * Progress belongs to the account, not the browser — switching accounts must
 * not inherit someone else's half-finished missions.
 *
 * @returns {Promise<Record<string, import('../models/index.js').MissionProgress>>}
 */
export function getMissionProgress() {
  return withMock(
    async () => {
      await delay(160);
      const id = currentAccount()?.id;
      return id ? { ...(db.missionProgress[id] ?? {}) } : {};
    },
    async () => {
      const result = await apiClient.get('/missions/progress');
      return result?.progress ?? {};
    },
  );
}

/**
 * Store the browser's in-flight objective counts.
 *
 * Advisory, but not unchecked - the endpoint enforces three things and so does
 * this, because a cache that can assert anything is a cache that will
 * eventually be mistaken for a source of truth:
 *
 *   1. Unknown mission ids are dropped.
 *   2. Counts are clamped to each objective's real target, so the UI cannot
 *      store "47 of 3".
 *   3. A mission the backend has already paid out cannot be reopened.
 *
 * `completed` is not rejected outright: the store sets it on the mission it is
 * about to ask the backend to pay. It is simply never *believed* - completion
 * is read back from the reply to `completeMission`.
 */
export function saveMissionProgress(progress) {
  return withMock(
    async () => {
      const id = currentAccount()?.id;
      if (!id) return progress;

      const stored = db.missionProgress[id] ?? {};
      const next = { ...stored };

      Object.entries(progress ?? {}).forEach(([missionId, state]) => {
        const mission = db.missions.find((m) => m.id === missionId);
        if (!mission) return;
        if (stored[missionId]?.status === 'completed') return;

        const counts = {};
        mission.objectives.forEach((objective) => {
          const value = Math.floor(state?.objectiveCounts?.[objective.id] ?? 0);
          if (value > 0) counts[objective.id] = Math.min(objective.target, value);
        });

        next[missionId] = {
          ...state,
          missionId,
          objectiveCounts: counts,
          // A payload that omits the stamp must not wipe the 24h reminder rule.
          lastRemindedAt: state?.lastRemindedAt ?? stored[missionId]?.lastRemindedAt,
        };
      });

      db.missionProgress[id] = next;
      return next;
    },
    () => apiClient.put('/missions/progress', { progress }),
  );
}

/**
 * Ask the backend to pay a mission.
 *
 * The request names only the mission. The reward comes from the catalog row and
 * the proof comes from the account's recorded career events, so neither is read
 * from the browser. If the work the objectives name has not actually been done
 * this rejects with 409 and `details.outstanding` - which is what the UI needs
 * in order to explain itself rather than quietly disagree with the badge.
 *
 * The reply carries the new career totals, so the caller sets XP from it rather
 * than adding the reward to a figure it was already holding.
 *
 * @returns {Promise<{ status: string, missionId: string, completedAt: string,
 *   xpAwarded: number, progress: object, awardedAchievements: object[] }>}
 */
export function completeMission(missionId) {
  return withMock(
    () => mockCompleteMission(missionId),
    () => apiClient.post(`/missions/${missionId}/complete`),
  );
}

/**
 * The mock's version of the same, down to the 409.
 *
 * Reputation is deliberately 0: the verifiable work *inside* a mission already
 * raised it through that work's own event, and counting it again at the mission
 * boundary would make the number fiction.
 */
async function mockCompleteMission(missionId) {
  await delay(300);

  const id = currentAccount()?.id;
  if (!id) throw new Error('Your session has expired. Sign in again.');

  const mission = db.missions.find((m) => m.id === missionId);
  if (!mission) {
    throw new ApiError('That mission does not exist.', { status: 404, code: 'not_found' });
  }

  // Count the events the backend itself recorded, not the progress the browser
  // reported. Counting rows gives "three *distinct* suitable applications"
  // rather than three clicks, because each one was keyed on the application it
  // was about.
  //
  // Counted per objective, not per event name: two objectives can listen for
  // the same event and want different things, so an objective carrying a
  // `context` only counts events whose recorded context matches it.
  const recorded = mockRecordedEvents();
  const outstanding = mission.objectives
    .map((objective) => {
      const done = recorded.filter(
        (row) =>
          row.event === objective.event &&
          contextSatisfies(objective.context, row.context),
      ).length;
      return {
        id: objective.id,
        label: objective.label,
        event: objective.event,
        target: objective.target,
        done: Math.min(objective.target, done),
      };
    })
    .filter((objective) => objective.done < objective.target);

  if (outstanding.length) {
    throw new ApiError('That mission is not finished yet.', {
      status: 409,
      code: 'conflict',
      details: { outstanding },
    });
  }

  const applied = await mockApplyEvent(
    CAREER_EVENTS.MISSION_COMPLETED,
    { missionId: mission.id },
    {
      xp: mission.xpReward,
      reputation: 0,
      label: `Mission complete - ${mission.title}`,
      statKey: 'completedMissions',
    },
  );

  const completedAt = applied.occurredAt;
  const stored = db.missionProgress[id] ?? {};
  db.missionProgress[id] = {
    ...stored,
    [mission.id]: {
      missionId: mission.id,
      status: 'completed',
      // Stored at their targets: the work is finished, and the panel should not
      // have to recount events to draw a full bar.
      objectiveCounts: Object.fromEntries(mission.objectives.map((o) => [o.id, o.target])),
      completedAt,
      lastRemindedAt: stored[mission.id]?.lastRemindedAt,
    },
  };

  return {
    status: applied.status,
    missionId: mission.id,
    completedAt,
    xpAwarded: applied.xpAwarded,
    progress: applied.progress,
    awardedAchievements: applied.awardedAchievements,
  };
}

/**
 * Run a skill challenge.
 *
 * In the prototype the challenge resolves to a graded result after a short
 * pause. The real implementation will hand off to the AI service, which scores
 * the attempt server-side.
 *
 * @param {import('../models/index.js').Mission} mission
 */
export function runSkillChallenge(mission) {
  return withMock(
    async () => {
      await delay(900);
      const score = 72 + Math.floor(Math.random() * 24);
      return {
        missionId: mission.id,
        score,
        passed: score >= 70,
        feedback:
          score >= 88
            ? 'Strong across the board. Your reasoning was easy to follow and you handled the edge case without being prompted.'
            : 'Solid attempt. Tighten how you justify the trade-off — state the constraint first, then the decision.',
      };
    },
    () => apiClient.post(`/missions/${mission.id}/attempt`),
  );
}
/* ----------------------------------------- mission reminders --- */

/**
 * Reminder preferences for the signed-in account.
 * Backed by `GET /users/me/notification-preferences`.
 */
export function getNotificationPreferences() {
  return withMock(
    async () => {
      await delay(140);
      const id = currentAccount()?.id;
      return {
        missionReminders: true,
        quietHours: null,
        ...(id ? db.notificationPreferences[id] ?? {} : {}),
      };
    },
    () => apiClient.get('/users/me/notification-preferences'),
  );
}

/**
 * Save reminder preferences. `quietHours` is `{ start, end }` in 24h hours or
 * null for no quiet period.
 * Backed by `PUT /users/me/notification-preferences`.
 */
export function saveNotificationPreferences(patch) {
  return withMock(
    async () => {
      await delay(200);
      const id = currentAccount()?.id;
      const current = {
        missionReminders: true,
        quietHours: null,
        ...(id ? db.notificationPreferences[id] ?? {} : {}),
      };
      const next = { ...current, ...patch };
      if (id) db.notificationPreferences[id] = next;
      return { ...next };
    },
    () => apiClient.put('/users/me/notification-preferences', patch),
  );
}

/**
 * Missions worth nudging about: active (started, not complete), not reminded
 * in the last 24h, and outside quiet hours. The UI calls this on load and
 * turns the result into in-app notices; the backend runs the same rule on a
 * scheduler and writes `POST /notifications` rows.
 *
 * @param {Record<string, import('../models/index.js').MissionProgress>} progress
 */
export function dueMissionReminders(progress = {}) {
  const id = currentAccount()?.id;
  const prefs = id ? db.notificationPreferences[id] ?? {} : {};
  if (prefs.missionReminders === false) return [];

  const hour = new Date().getHours();
  const quiet = prefs.quietHours;
  if (quiet && typeof quiet.start === 'number' && typeof quiet.end === 'number') {
    const inQuiet = quiet.start <= quiet.end
      ? hour >= quiet.start && hour < quiet.end
      : hour >= quiet.start || hour < quiet.end;
    if (inQuiet) return [];
  }

  const dayAgo = Date.now() - 86400000;
  return db.missions.filter((mission) => {
    const state = progress[mission.id];
    if (!state || state.status !== 'active') return false;
    const last = state.lastRemindedAt ? new Date(state.lastRemindedAt).getTime() : 0;
    return last < dayAgo;
  });
}

/**
 * Stamp a mission as reminded so the 24h rule has something to read.
 * Backed by the scheduler's write; the mock keeps it on the progress row.
 */
export function markMissionReminded(missionId, progress) {
  return withMock(
    async () => {
      const id = currentAccount()?.id;
      const next = {
        ...(progress ?? {}),
        [missionId]: {
          missionId,
          status: 'active',
          objectiveCounts: {},
          ...(progress?.[missionId] ?? {}),
          lastRemindedAt: new Date().toISOString(),
        },
      };
      if (id) db.missionProgress[id] = next;
      return next;
    },
    () => apiClient.post(`/missions/${missionId}/reminded`),
  );
}

