/**
 * Career progression: XP, level, reputation, statistics, achievements and the
 * activity stream that feeds social proof.
 *
 * Six reads and **one write**:
 *
 *   GET  /career/progress  /stats  /achievements  /ledger  /activity
 *   GET  /career/one-time-events
 *   POST /career/events
 *
 * XP and reputation are deliberately separate numbers. XP measures progression
 * - what you have done. Reputation measures credibility - what others can
 * trust. Collapsing them would make either one meaningless.
 *
 * ## One write, and why there used to be six
 *
 * This module previously offered `saveProgress`, `appendLedger`, `bumpStat`,
 * `markOneTimeEvent`, `awardAchievementsFor` and `recordActivity`. Every one of
 * them took a number from the browser and wrote it down, so a console could
 * award itself any level it liked and the XP ledger would agree with it. They
 * are gone, and the endpoints behind them answer 410.
 *
 * What replaces them is `recordEvent`, which sends only *what happened* -
 * `{ event: 'skill.challenge', context: { skill: 'Excel' } }` - and reads the
 * consequences off the reply. XP, reputation, the statistic, the ledger row,
 * the activity row and any achievement are decided server-side and applied in
 * one transaction, so they cannot end up disagreeing with each other.
 *
 * The three integrity rules that used to live in this file now live in the
 * database, which is the only place they were ever safe:
 *
 * 1. One-shot events are unique by name, enforced by a partial index, so a
 *    page reload cannot re-award profile completion.
 * 2. Achievements are counted against their stated condition - Career Explorer
 *    needs five *distinct* districts, the Excel award needs the Excel challenge.
 * 3. The ledger is written in the same transaction as the award, so a level-up
 *    always has a visible reason.
 *
 * The mock branch implements the same rules, keyed the same way. It has to: it
 * is the only thing standing behind the prototype while `VITE_USE_MOCKS` is on,
 * and a mock more permissive than the server would hide exactly the bugs this
 * endpoint exists to prevent.
 */
import { apiClient, withMock, ApiError } from './apiClient.js';
import { db, currentAccount, nextId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { achievementCatalog } from '../mock/users.js';
import { resolveProgression, careerTitleForLevel } from '../utils/progression.js';
import {
  CAREER_EVENTS,
  EVENT_CONTEXT_KEY,
  EVENT_LABELS,
  ONE_SHOT_EVENTS,
  REPUTATION_REWARDS,
  STAT_FOR_EVENT,
  XP_REWARDS,
} from '../utils/careerEvents.js';

const EMPTY_STATS = {
  completedMissions: 0, certifications: 0, applications: 0,
  interviews: 0, offers: 0, jobsViewed: 0, locationsVisited: 0,
};
const LEDGER_LIMIT = 60;
const ACTIVITY_LIMIT = 60;

function userId() {
  const account = currentAccount();
  if (!account) throw new Error('Your session has expired. Sign in again.');
  return account.id;
}

/**
 * Shape a stored XP total the way the API does, deriving the level rather than
 * reading one.
 *
 * Level is never stored, server-side or here. It is a function of total XP, and
 * storing it would create a second number that could disagree with the ledger.
 */
function toProgress(row) {
  const xp = Math.max(0, Math.floor(row?.xp ?? 0));
  const { level, xpIntoLevel, xpForNextLevel, progress } = resolveProgression(xp);
  return {
    xp,
    level,
    reputation: row?.reputation ?? 0,
    title: careerTitleForLevel(level),
    xpIntoLevel,
    xpForNextLevel,
    progress,
    updatedAt: row?.updatedAt ?? null,
  };
}

/* ----------------------------------------------------------- reads --- */

/** @returns {Promise<import('../models/index.js').CareerProgress>} */
export function getProgress() {
  return withMock(
    async () => {
      await delay(200);
      return toProgress(db.careerProgress[userId()]);
    },
    () => apiClient.get('/career/progress'),
  );
}

/**
 * Events this account has already had counted, permanently.
 *
 * Derived from the recorded events rather than kept as its own list. A separate
 * array is a second source of truth, and the one that used to be here lived in
 * the browser, so a reload reset it and the XP was awarded again.
 */
export function getOneTimeEvents() {
  return withMock(
    async () => {
      await delay(120);
      const seen = new Set(
        eventsFor(userId())
          .map((row) => row.event)
          .filter((event) => ONE_SHOT_EVENTS.has(event)),
      );
      return [...seen];
    },
    () => apiClient.get('/career/one-time-events'),
  );
}

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

/* ------------------------------------------------------ the write --- */

/**
 * Record that something happened, and read back what it was worth.
 *
 * The caller never names a reward. It names the event and the thing the event
 * was about, and the server decides the rest:
 *
 *     recordEvent({ event: CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
 *                   context: { skill: 'Excel', score: 86 } })
 *
 * `context` is not decoration. The field named for each event in
 * `EVENT_CONTEXT_KEY` is what the award is keyed on, so one application, one
 * course, one skill or one district counts exactly once however many times the
 * screen fires. An XP-bearing event that arrives without it is refused with a
 * 400 naming the field.
 *
 * The reply is authoritative and complete, so a caller needs no second request:
 *
 *   `status`                `applied` | `replayed` | `already_counted`
 *   `xpAwarded`             what this event actually paid - 0 on a replay
 *   `reputationAwarded`     likewise
 *   `progress`              the new totals, with the level derived from them
 *   `stats`                 the seven counters after the bump
 *   `awardedAchievements`   any award that completed on this event
 *
 * `mission.completed` is refused here. A mission's reward is a property of the
 * mission rather than of the event, so it is paid by
 * `missionService.completeMission`, which checks the objectives first.
 *
 * @param {{ event: string, context?: Record<string, unknown> }} payload
 */
export function recordEvent({ event, context = {} }) {
  return withMock(
    () => mockRecordEvent(event, context),
    () => apiClient.post('/career/events', { event, context }),
  );
}

/* ------------------------------------------- the mock backend --- */

/**
 * Everything below stands in for `POST /career/events` and the
 * `apply_career_event` transaction behind it, and mirrors them deliberately:
 * the same natural keys, the same one-shot rule, the same counted achievements,
 * the same reply. Where the server uses a unique index, this uses a lookup -
 * single-threaded, so there is no race to lose.
 *
 * It goes with `mockDb.js` when the API lands.
 */

const slug = (value) => String(value ?? '').trim().toLowerCase().slice(0, 120);

/** Recorded events for one account, oldest first. Created on first use. */
function eventsFor(id) {
  db.careerEvents[id] = db.careerEvents[id] ?? [];
  return db.careerEvents[id];
}

function progressRowFor(id) {
  db.careerProgress[id] = { xp: 0, reputation: 0, ...(db.careerProgress[id] ?? {}) };
  return db.careerProgress[id];
}

function statsRowFor(id) {
  db.careerStats[id] = { ...EMPTY_STATS, ...(db.careerStats[id] ?? {}) };
  return db.careerStats[id];
}

/** Does this event carry the context the achievement demands? */
function contextMatches(wanted, context) {
  if (!wanted) return true;
  if (!context) return false;
  return slug(context[wanted.key]) === slug(wanted.value);
}

/**
 * Apply one event, or report that it was already counted.
 *
 * Exported for `missionService`, which pays a mission's own `xpReward` through
 * the same path so that a mission award and a career award cannot be applied
 * two different ways. Not part of the service's public surface: screens call
 * `recordEvent`, which goes through the API.
 *
 * @param {string} event
 * @param {Record<string, unknown>} context
 * @param {{ xp?: number, reputation?: number, label?: string, statKey?: string }} [override]
 *        only for the mission path, where the reward is a property of the row
 */
export async function mockApplyEvent(event, context = {}, override = {}) {
  const id = userId();
  const events = eventsFor(id);

  const oneShot = ONE_SHOT_EVENTS.has(event);
  const naturalField = EVENT_CONTEXT_KEY[event];
  const naturalValue = naturalField ? slug(context[naturalField]) : '';
  const key = oneShot
    ? event
    : naturalValue
      ? `${event}:${naturalValue}`
      : `${event}:${nextId('key')}`;

  const progress = progressRowFor(id);
  const stats = statsRowFor(id);

  // Already counted, by name or by key. Reported rather than thrown: re-firing
  // is normal, because the screen cannot know what the account has done before.
  const previous = oneShot
    ? events.find((row) => row.event === event)
    : events.find((row) => row.idempotencyKey === key);

  if (previous) {
    return {
      status: oneShot ? 'already_counted' : 'replayed',
      eventId: previous.id,
      occurredAt: previous.occurredAt,
      xpAwarded: 0,
      reputationAwarded: 0,
      progress: toProgress(progress),
      stats: { ...stats },
      awardedAchievements: [],
    };
  }

  const xp = override.xp ?? XP_REWARDS[event] ?? 0;
  const reputation = override.reputation ?? REPUTATION_REWARDS[event] ?? 0;
  const label = override.label ?? EVENT_LABELS[event] ?? event;
  const statKey = override.statKey ?? STAT_FOR_EVENT[event];
  const occurredAt = new Date().toISOString();

  const row = {
    id: nextId('evt'),
    event,
    context: { ...context },
    idempotencyKey: key,
    xpAwarded: xp,
    reputationAwarded: reputation,
    occurredAt,
  };
  events.push(row);

  progress.xp += xp;
  progress.reputation = Math.min(100, Math.max(0, progress.reputation + reputation));
  progress.updatedAt = occurredAt;

  if (statKey) stats[statKey] = (stats[statKey] ?? 0) + 1;

  // The ledger answers "why did my level move", so only an award earns a row.
  if (xp !== 0) {
    db.xpLedger[id] = [
      { id: nextId('led'), event, label, xp, at: occurredAt },
      ...(db.xpLedger[id] ?? []),
    ].slice(0, LEDGER_LIMIT);
  }

  // The activity stream takes every event, award or not. This is where the
  // zero-XP ones the candidate still needs to see live - an application below
  // the match range, a rejection, a declined offer. The browser used to push
  // those into the ledger with `ledger: true`; they belong here, and keeping
  // them out of the ledger is what stops it becoming a click log.
  db.activity[id] = [
    { id: nextId('act'), userId: id, type: event, label, xp, createdAt: occurredAt, shareable: true },
    ...(db.activity[id] ?? []),
  ].slice(0, ACTIVITY_LIMIT);

  // Achievements are counted, and only when the context matches: the Excel
  // award belongs to the Excel challenge, and Career Explorer wants five
  // distinct districts - which the natural key above is what makes true.
  const earned = (db.achievements[id] = db.achievements[id] ?? []);
  const counts = (db.achievementProgress[id] = db.achievementProgress[id] ?? {});
  const awardedAchievements = [];

  achievementCatalog
    .filter((a) => a.event === event && contextMatches(a.context, context))
    .forEach((a) => {
      if (earned.includes(a.id)) return;
      const target = a.count ?? 1;
      counts[a.id] = Math.min(target, (counts[a.id] ?? 0) + 1);
      if (counts[a.id] >= target) {
        earned.push(a.id);
        awardedAchievements.push({ ...a, earned: true, verified: true, progress: target, earnedAt: occurredAt });
      }
    });

  return {
    status: 'applied',
    eventId: row.id,
    occurredAt,
    xpAwarded: xp,
    reputationAwarded: reputation,
    progress: toProgress(progress),
    stats: { ...stats },
    awardedAchievements,
  };
}

/**
 * The account's recorded events.
 *
 * For the mock mission endpoint, which re-derives a mission's completion from
 * the events the backend itself recorded rather than from the progress the
 * browser reported - the same thing `POST /missions/:id/complete` does with
 * `career_events`, and the reason forged progress earns nothing.
 */
export function mockRecordedEvents() {
  return [...eventsFor(userId())];
}

/** The validating front door, mirroring the endpoint's own refusals. */
async function mockRecordEvent(event, context) {
  await delay(180);

  if (!Object.values(CAREER_EVENTS).includes(event)) {
    throw new ApiError('That is not a career event we record.', {
      status: 400,
      code: 'bad_request',
      details: { field: 'event' },
    });
  }

  if (event === CAREER_EVENTS.MISSION_COMPLETED) {
    throw new ApiError(
      'Mission completion is recorded by the mission endpoint, which verifies the objectives and pays the mission its own reward.',
      { status: 400, code: 'bad_request', details: { replacedBy: 'POST /missions/:id/complete' } },
    );
  }

  // An XP-bearing event has to say what it was about, or it cannot be keyed,
  // and an unkeyed award is one that can be claimed again on the next click.
  const naturalField = EVENT_CONTEXT_KEY[event];
  const xp = XP_REWARDS[event] ?? 0;
  if (xp > 0 && !ONE_SHOT_EVENTS.has(event) && naturalField && !slug(context[naturalField])) {
    throw new ApiError('That event needs to say what it was about before it can be counted.', {
      status: 400,
      code: 'bad_request',
      details: { field: `context.${naturalField}` },
    });
  }

  return mockApplyEvent(event, context);
}
