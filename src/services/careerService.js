/**
 * Career progression: XP, level, reputation, statistics, achievements and the
 * activity stream that feeds social proof.
 *
 * Backed by `GET /career/progress`, `GET /career/stats`, `GET /career/achievements`,
 * `GET /career/activity` and `POST /career/events`.
 *
 * XP and reputation are deliberately separate numbers. XP measures progression
 * — what you have done. Reputation measures credibility — what others can
 * trust. Collapsing them would make either one meaningless.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentAccount, nextId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { achievementCatalog } from '../mock/users.js';

const EMPTY_PROGRESS = { xp: 0, level: 1, reputation: 0 };
const EMPTY_STATS = {
  completedMissions: 0, certifications: 0, applications: 0,
  interviews: 0, offers: 0, jobsViewed: 0, locationsVisited: 0,
};

function userId() {
  const account = currentAccount();
  if (!account) throw new Error('Your session has expired. Sign in again.');
  return account.id;
}

/** @returns {Promise<import('../models/index.js').CareerProgress>} */
export function getProgress() {
  return withMock(
    async () => {
      await delay(200);
      return { ...EMPTY_PROGRESS, ...(db.careerProgress[userId()] ?? {}) };
    },
    () => apiClient.get('/career/progress'),
  );
}

/**
 * Persist progression after a career event.
 *
 * The XP table, the one-off rule and the "no XP for volume applications" rule
 * all belong server-side eventually; this writes what the client computed so
 * the two stay in step until `POST /career/events` exists.
 */
export function saveProgress(progress) {
  return withMock(
    async () => {
      db.careerProgress[userId()] = { ...progress };
      return { ...progress };
    },
    () => apiClient.put('/career/progress', progress),
  );
}

/** @returns {Promise<import('../models/index.js').CareerStats>} */
export function getStats() {
  return withMock(
    async () => {
      await delay(220);
      return { ...EMPTY_STATS, ...(db.careerStats[userId()] ?? {}) };
    },
    () => apiClient.get('/career/stats'),
  );
}

export function bumpStat(key, amount = 1) {
  return withMock(
    async () => {
      const id = userId();
      db.careerStats[id] = { ...EMPTY_STATS, ...(db.careerStats[id] ?? {}) };
      db.careerStats[id][key] = (db.careerStats[id][key] ?? 0) + amount;
      return { ...db.careerStats[id] };
    },
    () => apiClient.post('/career/stats/increment', { key, amount }),
  );
}

/**
 * Achievements, with the earned ones resolved against this account.
 * @returns {Promise<import('../models/index.js').Achievement[]>}
 */
export function listAchievements() {
  return withMock(
    async () => {
      await delay(240);
      const earned = db.achievements[userId()] ?? [];
      return achievementCatalog.map((a) => ({
        ...a,
        earned: earned.includes(a.id),
        verified: earned.includes(a.id),
      }));
    },
    () => apiClient.get('/career/achievements'),
  );
}

/**
 * Award any achievement whose trigger event just fired.
 * @param {string} event
 * @returns {Promise<import('../models/index.js').Achievement[]>} newly earned
 */
export function awardAchievementsFor(event) {
  return withMock(
    async () => {
      const id = userId();
      const earned = (db.achievements[id] = db.achievements[id] ?? []);
      const won = achievementCatalog.filter((a) => a.event === event && !earned.includes(a.id));
      won.forEach((a) => earned.push(a.id));
      return won.map((a) => ({ ...a, earned: true, verified: true }));
    },
    () => apiClient.post('/career/achievements/evaluate', { event }),
  );
}

/** @returns {Promise<import('../models/index.js').CareerActivity[]>} */
export function listActivity(limit = 20) {
  return withMock(
    async () => {
      await delay(220);
      return [...(db.activity[userId()] ?? [])]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    },
    () => apiClient.get('/career/activity', { params: { limit } }),
  );
}

/**
 * Record a career activity. This is the raw material for social proof — a log
 * of career work, not of engagement.
 */
export function recordActivity({ type, label, xp = 0, shareable = true }) {
  return withMock(
    async () => {
      const id = userId();
      const entry = {
        id: nextId('act'),
        userId: id,
        type,
        label,
        xp,
        createdAt: new Date().toISOString(),
        shareable,
      };
      db.activity[id] = [entry, ...(db.activity[id] ?? [])].slice(0, 60);
      return entry;
    },
    () => apiClient.post('/career/activity', { type, label, xp, shareable }),
  );
}
