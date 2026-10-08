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
