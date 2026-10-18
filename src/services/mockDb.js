/**
 * In-memory stand-in for the backend, for the duration of the prototype.
 *
 * It exists so mock services behave like a real API - an application you submit
 * shows up in the list afterwards, a job an employer publishes appears in the
 * marketplace - without the UI pretending to own business data. It is session
 * scoped on purpose: persistence is the backend's job.
 *
 * Per-account data (progress, ledger, one-time guards, saves, interviews,
 * notifications, referrals) is keyed by account id so a second account never
 * inherits a stranger's state.
 *
 * Delete this file when the API lands.
 */
import { registerMockObserver } from './apiClient.js';
import { jobs as seedJobs } from '../mock/jobs.js';
import { organizations as seedOrganizations } from '../mock/organizations.js';
import {
  applications as seedApplications,
  interviews as seedInterviews,
} from '../mock/applications.js';
import { notifications as seedNotifications } from '../mock/notifications.js';
import { missions as seedMissions } from '../mock/missions.js';
import { candidatePool } from '../mock/candidates.js';
import { posts as seedPosts, seededActivity, suggestedOrganizationIds } from '../mock/social.js';
import {
  accounts as seedAccounts,
  candidateProfile as seedProfile,
  careerProgress as seedProgress,
  careerStats as seedStats,
  seededAchievementIds,
  seededAchievementProgress,
} from '../mock/users.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const db = {
  /** Registered accounts, keyed by nothing in particular - this is a list, like a table. */
  accounts: clone(seedAccounts),
  /** Candidate profiles by profile id. */
  profiles: { 'cp-001': clone(seedProfile) },
  /** Career progression and statistics by user id. */
  careerProgress: clone(seedProgress),
  careerStats: clone(seedStats),
  /** Earned achievement ids by user id. */
  achievements: { 'usr-001': clone(seededAchievementIds) },
  /** How many times each achievement's trigger has fired, by user id. */
  achievementProgress: clone(seededAchievementProgress),
  /** Events that may only ever count once, by user id. Guards XP across reloads. */
  oneTimeEvents: {},
  /** The XP ledger - every award with its reason, by user id. */
  xpLedger: {},
  /** Career activity stream by user id. */
  activity: { 'usr-001': clone(seededActivity) },

  organizations: clone(seedOrganizations),
  jobs: clone(seedJobs),
  missions: clone(seedMissions),
  /** Mission objective progress by user id. */
  missionProgress: {},
  /** Course enrolments by user id: { courseId, status, completedAt }. */
  enrollments: {},
  candidates: clone(candidatePool),

  /**
   * One collection, as the API will have it. Rows belong to an organization and
   * a candidate; the employer pipeline and the candidate list are two views of
   * the same table, never two tables.
   */
  applications: clone(seedApplications),
  /** Stage history rows by application id. */
  applicationEvents: {},
  interviews: clone(seedInterviews),
  /** Interview simulation attempts by user id - passed or failed, on the record. */
  interviewAttempts: {},
  /** Notification rows by user id. */
  notificationsByUser: { 'usr-001': clone(seedNotifications) },

  posts: clone(seedPosts),
  /** Reports raised against posts, for moderation review. */
  reports: [],
  /** Authors a user has blocked, by user id. */
  blockedAuthorIds: {},
  /** Referral requests between connections. */
  referrals: [],
  /** Users who opted out of the leaderboard, by user id. */
  leaderboardOptOut: {},
  /** Social graph. Connections and follows are separate relationships. */
  connections: [],
  followedOrganizationIds: clone(suggestedOrganizationIds).slice(0, 1),
  /** Notification preferences by user id: mission reminders and quiet hours. */
  notificationPreferences: {},

  /** Saved job ids by user id. */
  savedJobIdsByUser: {},

  /** The signed-in account id, set by authService. */
  currentUserId: null,
};

let sequence = 1000;
export function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/** The signed-in account, or null. */
export function currentAccount() {
  return db.accounts.find((a) => a.id === db.currentUserId) ?? null;
}

/** The signed-in account id, or null. */
export function currentUserId() {
  return db.currentUserId ?? null;
}

/** Saved jobs for one account, defaulting to an empty list. */
export function savedJobIdsFor(userId) {
  if (!userId) return [];
  return db.savedJobIdsByUser[userId] ?? [];
}

/** Strip the mock password before anything leaves the service layer. */
export function toPublicUser(account) {
  if (!account) return null;
  const { password, ...user } = account;
  return clone(user);
}

/* ------------------------------------------------------- persistence --- */

/**
 * The mock backend snapshots itself to localStorage.
 *
 * This is storage belonging to the backend stand-in, not to the interface - an
 * account you register or a job you publish should still be there after a
 * reload, or the prototype cannot be demonstrated in one sitting. It disappears
 * with this file when the real API lands.
 */
const SNAPSHOT_KEY = 'grooveli:mock-db';
const SNAPSHOT_VERSION = 2;

/**
 * `currentUserId` is deliberately excluded: who is signed in belongs to the
 * auth token, not to the data. Persisting it means a reload can restore a
 * previous user's session over the current token.
 */
function serialise() {
  const { currentUserId: _ignored, ...rest } = db;
  return JSON.stringify({ version: SNAPSHOT_VERSION, data: rest });
}

function restore() {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Version bump: the v1 shape keyed saves globally and split applications
    // into two tables. Stale snapshots start clean rather than hydrate wrong.
    if (parsed?.version !== SNAPSHOT_VERSION) return;
    const { currentUserId, ...data } = parsed.data ?? {};
    Object.assign(db, data);
  } catch {
    // A corrupt or blocked snapshot just means starting from the seed data.
  }
}

let commitHandle = null;

/** Debounced so a burst of writes costs one serialisation. */
export function scheduleCommit() {
  if (commitHandle) return;
  commitHandle = setTimeout(() => {
    commitHandle = null;
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, serialise());
    } catch {
      // Private windows and full quotas are survivable: the session still works.
    }
  }, 120);
}

/** Wipe the snapshot and reload from seed data. */
export function resetMockDb() {
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // nothing to clear
  }
}

if (typeof window !== 'undefined') {
  restore();
  registerMockObserver(scheduleCommit);
}