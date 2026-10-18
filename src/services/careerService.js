/**
 * Career progression: XP, level, reputation, statistics, achievements and the
 * activity stream that feeds social proof.
 *
 * Backed by `GET /career/progress`, `GET /career/stats`, `GET /career/achievements`,
 * `GET /career/activity`, `GET /career/ledger` and `POST /career/events`.
 *
 * XP and reputation are deliberately separate numbers. XP measures progression
 * - what you have done. Reputation measures credibility - what others can
 * trust. Collapsing them would make either one meaningless.
 *
 * Three integrity rules live here rather than in the screens, because a rule
 * that lives in a screen is a rule the next screen breaks:
 *
 * 1. One-shot events are persisted per account. The guard survives a reload;
 *    before this, a page refresh re-awarded the profile-completion XP.
 * 2. Achievements are counted, not fired. Career Explorer needs five district
 *    visits and the Excel award needs the Excel challenge specifically.
 * 3. The XP ledger is stored, not just the totals - a level-up with no visible
 *    history is a number the player cannot defend.
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
const LEDGER_LIMIT = 60;

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

/* ------------------------------------------------ one-shot events --- */

/** Events this account has already had counted, permanently. */
export function getOneTimeEvents() {
  return withMock(
    async () => {
      await delay(120);
      return [...(db.oneTimeEvents[userId()] ?? [])];
    },
    () => apiClient.get('/career/one-time-events'),
  );
}

/** Claim a one-shot event. Returns false if another tab claimed it first. */
export function markOneTimeEvent(event) {
  return withMock(
    async () => {
      const id = userId();
      const held = (db.oneTimeEvents[id] = db.oneTimeEvents[id] ?? []);
      if (held.includes(event)) return false;
      held.push(event);
      return true;
    },
    () => apiClient.post('/career/one-time-events', { event }),
  );
}

/* ------------------------------------------------------- the ledger --- */

/** @returns {Promise<{ id: string, event: string, label: string, xp: number, at: string }[]>} */
export function getLedger() {
  return withMock(
    async () => {
      await delay(150);
      return [...(db.xpLedger[userId()] ?? [])];
    },
    () => apiClient.get('/career/ledger'),
  );
}

/** Prepend one row. The backend appends to `xp_ledger` keyed by career event id. */
export function appendLedger(entry) {
  return withMock(
    async () => {
      const id = userId();
      const rows = [entry, ...(db.xpLedger[id] ?? [])].slice(0, LEDGER_LIMIT);
      db.xpLedger[id] = rows;
      return [...rows];
    },
    () => apiClient.post('/career/ledger', entry),
  );
}

/* ------------------------------------------------------ statistics --- */

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

/* --------------------------------------------------- achievements --- */

/** Achievements, with the earned ones resolved against this account. */
export function listAchievements() {
  return withMock(
    async () => {
      await delay(240);
      const id = userId();
      const earned = db.achievements[id] ?? [];
      const progress = db.achievementProgress[id] ?? {};
      return achievementCatalog.map((a) => ({
        ...a,
        earned: earned.includes(a.id),
        verified: earned.includes(a.id),
        progress: Math.min(a.count ?? 1, progress[a.id] ?? 0),
      }));
    },
    () => apiClient.get('/career/achievements'),
  );
}

/** Does this event carry the context the achievement demands? */
function contextMatches(wanted, context) {
  if (!wanted) return true;
  if (!context) return false;
  return normaliseContext(context[wanted.key]) === normaliseContext(wanted.value);
}

const normaliseContext = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Evaluate every achievement listening for this event.
 *
 * The count advances only when the context matches, and the award lands when
 * the count reaches the target - so "visit five districts" is five visits and
 * "Excel Foundations" is the Excel challenge, not whichever came first.
 *
 * @param {string} event one of CAREER_EVENTS
 * @param {Record<string, unknown>} [context] event payload, e.g. { skill: 'Excel' }
 * @returns {Promise<import('../models/index.js').Achievement[]>} newly earned
 */
export function awardAchievementsFor(event, context = {}) {
  return withMock(
    async () => {
      const id = userId();
      const earned = (db.achievements[id] = db.achievements[id] ?? []);
      const progress = (db.achievementProgress[id] = db.achievementProgress[id] ?? {});
      const won = [];

      achievementCatalog
        .filter((a) => a.event === event && contextMatches(a.context, context))
        .forEach((a) => {
          if (earned.includes(a.id)) return;
          const target = a.count ?? 1;
          progress[a.id] = Math.min(target, (progress[a.id] ?? 0) + 1);
          if (progress[a.id] >= target) {
            earned.push(a.id);
            won.push({ ...a, earned: true, verified: true });
          }
        });

      return won;
    },
    () => apiClient.post('/career/achievements/evaluate', { event, context }),
  );
}

/* ---------------------------------------------------- the activity --- */

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
 * Record a career activity. This is the raw material for social proof - a log
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