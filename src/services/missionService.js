/**
 * Missions.
 * Backed by `GET /missions`, `GET /missions/progress`, `POST /missions/:id/complete`.
 *
 * Mission *definitions* come from the backend. Mission *progress* is derived
 * from career events, which the mission store tracks locally until the backend
 * can persist it.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';

/** @returns {Promise<import('../models/index.js').Mission[]>} */
export function listMissions(filters = {}) {
  return withMock(
    async () => {
      await delay();
      return db.missions.filter((mission) => {
        if (filters.type && mission.type !== filters.type) return false;
        if (filters.locationId && mission.locationId !== filters.locationId) return false;
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

export function saveMissionProgress(progress) {
  return withMock(
    async () => {
      const id = currentAccount()?.id;
      if (id) db.missionProgress[id] = progress;
      return progress;
    },
    () => apiClient.put('/missions/progress', { progress }),
  );
}

/**
 * Report a mission as complete so the backend can award XP and persist it.
 * The frontend already knows locally; this is the write that makes it real.
 */
export function completeMission(missionId) {
  return withMock(
    async () => {
      await delay(300);
      return { missionId, completedAt: new Date().toISOString() };
    },
    () => apiClient.post(`/missions/${missionId}/complete`),
  );
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

