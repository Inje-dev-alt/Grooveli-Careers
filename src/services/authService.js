/**
 * Authentication and account lifecycle.
 *
 * MOCKED. This is not authentication: passwords are compared in the browser and
 * the "token" is a string. It exists so the product's identity model can be
 * exercised, and it is shaped so a real provider can replace it — the UI only
 * ever sees `register`, `login`, `getCurrentUser`, `logout`.
 *
 * One account carries both capabilities. `roles` is an array and `activeRole`
 * selects the experience, because a recruiter who is also job-hunting is one
 * person, and assuming otherwise is the hardest thing to undo later.
 */
import { apiClient, withMock, setAuthToken, getAuthToken } from './apiClient.js';
import { db, nextId, currentAccount, toPublicUser } from './mockDb.js';
import { emptyCandidateProfile } from '../mock/users.js';
import { delay } from '../utils/delay.js';

const TOKEN_PREFIX = 'mock-session:';

/** Mock tokens carry the account id so a reload can restore the session. */
function issueToken(userId) {
  const token = `${TOKEN_PREFIX}${userId}`;
  setAuthToken(token);
  db.currentUserId = userId;
  return token;
}

function userIdFromToken(token) {
  return token?.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : null;
}

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ token: string, user: import('../models/index.js').User }>}
 */
export function login(credentials) {
  return withMock(
    async () => {
      await delay();
      const email = credentials.email?.trim().toLowerCase();
      const account = db.accounts.find((a) => a.email.toLowerCase() === email);

      if (!account) {
        throw new Error('No Grooveli account uses that email address.');
      }
      if (account.password && account.password !== credentials.password) {
        throw new Error('That password does not match.');
      }

      return { token: issueToken(account.id), user: toPublicUser(account) };
    },
    async () => {
      const result = await apiClient.post('/auth/login', credentials);
      setAuthToken(result.token);
      return result;
    },
  );
}

/**
 * Create an account. The new user has no role yet — role selection is a
 * deliberate separate step, because it decides which product they enter.
 *
 * @param {{ email: string, password: string }} credentials
 */
export function register(credentials) {
  return withMock(
    async () => {
      await delay(520);
      const email = credentials.email?.trim().toLowerCase();
      if (db.accounts.some((a) => a.email.toLowerCase() === email)) {
        throw new Error('An account already uses that email address.');
      }

      /** @type {import('../models/index.js').User & { password: string }} */
      const account = {
        id: nextId('usr'),
        email,
        password: credentials.password,
        displayName: '',
        roles: [],
        activeRole: null,
        createdAt: new Date().toISOString(),
        candidateProfileId: null,
        organizationMemberships: [],
      };

      db.accounts.push(account);
      return { token: issueToken(account.id), user: toPublicUser(account) };
    },
    async () => {
      const result = await apiClient.post('/auth/register', credentials);
      setAuthToken(result.token);
      return result;
    },
  );
}

/**
 * Add a capability to the account and make it active.
 *
 * Adding rather than setting: a user who later wants the other side of the
 * marketplace keeps what they already built.
 *
 * @param {'candidate' | 'employer'} role
 */
export function chooseRole(role) {
  return withMock(
    async () => {
      await delay(200);
      const account = currentAccount();
      if (!account) throw new Error('Your session has expired. Sign in again.');
      if (!account.roles.includes(role)) account.roles.push(role);
      account.activeRole = role;
      return toPublicUser(account);
    },
    () => apiClient.post('/users/me/roles', { role }),
  );
}

/** Switch between capabilities the account already holds. */
export function switchRole(role) {
  return withMock(
    async () => {
      await delay(160);
      const account = currentAccount();
      if (!account) throw new Error('Your session has expired. Sign in again.');
      if (!account.roles.includes(role)) throw new Error('That space is not set up on this account yet.');
      account.activeRole = role;
      return toPublicUser(account);
    },
    () => apiClient.patch('/users/me', { activeRole: role }),
  );
}

/**
 * Finish candidate onboarding: create the profile and attach it to the account.
 * @param {object} draft the onboarding answers
 */
export function completeCandidateOnboarding(draft) {
  return withMock(
    async () => {
      await delay(640);
      const account = currentAccount();
      if (!account) throw new Error('Your session has expired. Sign in again.');

      const profileId = account.candidateProfileId ?? nextId('cp');
      const base = db.profiles[profileId] ?? emptyCandidateProfile(account.id, profileId);

      db.profiles[profileId] = {
        ...base,
        headline: draft.headline || '',
        summary: draft.summary || '',
        location: draft.location || '',
        yearsExperience: Number(draft.yearsExperience) || 0,
        careerGoal: draft.careerGoal || '',
        careerInterests: draft.careerInterests ?? [],
        workTypes: draft.workTypes ?? [],
        openTo: draft.openTo ?? [],
        salaryExpectation: {
          min: Number(draft.salaryMin) || 0,
          max: Number(draft.salaryMax) || 0,
          currency: draft.currency || 'NGN',
        },
        industries: draft.industries ?? [],
        skills: (draft.skills ?? []).map((name, index) => ({
          id: `skl-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
          name,
          category: 'general',
          level: 55,
          verified: false,
        })),
        education: draft.education ? [{ id: 'edu-1', qualification: draft.education, institution: draft.institution || '', year: draft.graduationYear || '' }] : [],
      };

      account.displayName = draft.name || account.displayName || 'Candidate';
      account.candidateProfileId = profileId;

      // Progression starts at zero. A career level that was handed out rather
      // than earned would make every number downstream meaningless.
      db.careerProgress[account.id] = db.careerProgress[account.id] ?? { xp: 0, level: 1, reputation: 0 };
      db.careerStats[account.id] = db.careerStats[account.id] ?? {
        completedMissions: 0, certifications: 0, applications: 0,
        interviews: 0, offers: 0, jobsViewed: 0, locationsVisited: 0,
      };
      db.achievements[account.id] = db.achievements[account.id] ?? [];
      db.activity[account.id] = db.activity[account.id] ?? [];

      return toPublicUser(account);
    },
    () => apiClient.post('/candidates', draft),
  );
}

/**
 * Finish employer onboarding: create the organization and the membership that
 * connects this person to it.
 * @param {object} draft
 */
export function completeEmployerOnboarding(draft) {
  return withMock(
    async () => {
      await delay(720);
      const account = currentAccount();
      if (!account) throw new Error('Your session has expired. Sign in again.');

      /** @type {import('../models/index.js').Organization} */
      const organization = {
        id: nextId('org'),
        name: draft.companyName,
        tagline: draft.tagline || '',
        description: draft.description || '',
        industry: draft.industry || 'Technology',
        size: draft.size || '1-10',
        location: draft.location || '',
        website: draft.website || '',
        districtId: draft.districtId || 'corporate-district',
        logoColor: draft.logoColor || '#6c8cff',
        followerCount: 0,
        verified: false,
        createdAt: new Date().toISOString(),
      };

      db.organizations.push(organization);
      account.displayName = draft.name || account.displayName || 'Employer';
      account.organizationMemberships.push({
        organizationId: organization.id,
        organizationName: organization.name,
        role: draft.role || 'owner',
        title: draft.title || 'Founder',
        joinedAt: organization.createdAt,
      });

      return { user: toPublicUser(account), organization };
    },
    () => apiClient.post('/organizations', draft),
  );
}

/** @returns {Promise<import('../models/index.js').User>} */
export function getCurrentUser() {
  return withMock(
    async () => {
      await delay(180);
      // The token decides who is signed in, every time. Trusting anything else
      // lets a reload restore a previous account over the current token.
      db.currentUserId = userIdFromToken(getAuthToken());
      const account = currentAccount();
      if (!account) throw new Error('Session expired.');
      return toPublicUser(account);
    },
    () => apiClient.get('/users/me'),
  );
}

export function logout() {
  return withMock(
    async () => {
      setAuthToken(null);
      db.currentUserId = null;
      return null;
    },
    async () => {
      await apiClient.post('/auth/logout').catch(() => {});
      setAuthToken(null);
      return null;
    },
  );
}

export function hasSession() {
  return Boolean(getAuthToken());
}

/** Demo credentials, surfaced on the sign-in screen so the prototype is usable. */
export const DEMO_ACCOUNTS = [
  { label: 'Demo candidate', email: 'candidate@grooveli.test', password: 'grooveli' },
  { label: 'Demo employer', email: 'employer@grooveli.test', password: 'grooveli' },
];
