/**
 * City standings.
 * Backed by `GET /leaderboard`, `GET /leaderboard/opt-out`,
 * `POST /leaderboard/opt-out`.
 *
 * Ranked by REPUTATION, never by XP: reputation is what an employer can
 * verify, and a board ranked by activity would become a farming contest in a
 * week. Participation is opt-out, not opt-in - you appear once you have a
 * reputation score, and one click removes you.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentAccount, currentUserId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { suggestedPeople } from '../mock/social.js';
import { resolveProgression } from '../utils/progression.js';

function entryFromPool(person) {
  const pooled = db.candidates.find((c) => c.id === person.id);
  if (!pooled) return null;
  return {
    id: pooled.id,
    name: pooled.name,
    headline: pooled.headline,
    careerLevel: pooled.careerLevel,
    reputation: pooled.reputation,
    color: pooled.color,
    isMe: false,
  };
}

function entryFromAccount(account) {
  const profile = account.candidateProfileId ? db.profiles[account.candidateProfileId] : null;
  if (!profile) return null;
  const progress = db.careerProgress[account.id] ?? { xp: 0, reputation: 0 };
  return {
    id: account.id,
    name: account.displayName,
    headline: profile.headline || 'Grooveli candidate',
    careerLevel: resolveProgression(progress.xp ?? 0).level,
    reputation: progress.reputation ?? 0,
    color: '#5be3c8',
    isMe: account.id === currentUserId(),
  };
}

function buildBoard() {
  const me = currentAccount()?.id;
  const optedOut = me ? Boolean(db.leaderboardOptOut[me]) : false;
  const fromPool = suggestedPeople.map(entryFromPool).filter(Boolean);
  const fromAccounts = db.accounts
    .filter((a) => a.id !== 'usr-002') // the demo employer has no career to rank
    .map(entryFromAccount)
    .filter(Boolean)
    .filter((e) => !e.isMe || !optedOut);

  return [...fromPool, ...fromAccounts]
    .sort((a, b) => b.reputation - a.reputation || b.careerLevel - a.careerLevel)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** @returns {Promise<import('../models/index.js').LeaderboardEntry[]>} */
export function getLeaderboard() {
  return withMock(
    async () => {
      await delay(280);
      return buildBoard();
    },
    () => apiClient.get('/leaderboard'),
  );
}

/** @returns {Promise<boolean>} true when the signed-in user is hidden */
export function getLeaderboardOptOut() {
  return withMock(
    async () => {
      await delay(100);
      const me = currentAccount()?.id;
      return me ? Boolean(db.leaderboardOptOut[me]) : true;
    },
    () => apiClient.get('/leaderboard/opt-out'),
  );
}

export function setLeaderboardOptOut(optedOut) {
  return withMock(
    async () => {
      await delay(160);
      const me = currentAccount()?.id;
      if (!me) return true;
      db.leaderboardOptOut[me] = Boolean(optedOut);
      return db.leaderboardOptOut[me];
    },
    () => apiClient.post('/leaderboard/opt-out', { optedOut }),
  );
}