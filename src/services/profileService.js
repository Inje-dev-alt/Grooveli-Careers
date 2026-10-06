/**
 * Candidate profile, career statistics and achievements.
 * Backed by `GET /career/profile`, `PATCH /career/profile`, `GET /career/stats`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db } from './mockDb.js';
import { delay } from '../utils/delay.js';

/** Fields that have to be present before a profile counts as complete. */
const COMPLETENESS_FIELDS = [
  { key: 'headline', weight: 15, test: (p) => Boolean(p.headline?.trim()) },
  { key: 'summary', weight: 15, test: (p) => (p.summary?.trim().length ?? 0) > 40 },
  { key: 'location', weight: 10, test: (p) => Boolean(p.location?.trim()) },
  { key: 'skills', weight: 20, test: (p) => (p.skills?.length ?? 0) >= 5 },
  { key: 'industries', weight: 10, test: (p) => (p.industries?.length ?? 0) >= 1 },
  { key: 'salaryExpectation', weight: 10, test: (p) => (p.salaryExpectation?.min ?? 0) > 0 },
  { key: 'openTo', weight: 10, test: (p) => (p.openTo?.length ?? 0) >= 1 },
  { key: 'cv', weight: 10, test: (p) => Boolean(p.cv?.hasCv) },
];

/** @param {import('../models/index.js').CandidateProfile} profile */
export function calculateCompleteness(profile) {
  if (!profile) return 0;
  return COMPLETENESS_FIELDS.reduce((total, f) => (f.test(profile) ? total + f.weight : total), 0);
}

/** Which parts are still missing — drives the profile checklist. */
export function missingProfileFields(profile) {
  if (!profile) return COMPLETENESS_FIELDS.map((f) => f.key);
  return COMPLETENESS_FIELDS.filter((f) => !f.test(profile)).map((f) => f.key);
}

/** @returns {Promise<import('../models/index.js').CandidateProfile>} */
export function getProfile() {
  return withMock(
    async () => {
      await delay();
      return { ...db.profile, completeness: calculateCompleteness(db.profile) };
    },
    () => apiClient.get('/career/profile'),
  );
}

/**
 * @param {Partial<import('../models/index.js').CandidateProfile>} patch
 * @returns {Promise<import('../models/index.js').CandidateProfile>}
 */
export function updateProfile(patch) {
  return withMock(
    async () => {
      await delay(420);
      db.profile = { ...db.profile, ...patch };
      db.profile.completeness = calculateCompleteness(db.profile);
      return { ...db.profile };
    },
    () => apiClient.patch('/career/profile', patch),
  );
}

/**
 * CV upload.
 *
 * The real endpoint takes multipart form data and returns a stored file
 * reference. The prototype records the file name only — nothing is uploaded
 * anywhere, and the file never leaves the browser.
 *
 * @param {{ fileName: string }} file
 */
export function uploadCv({ fileName }) {
  return withMock(
    async () => {
      await delay(640);
      db.profile.cv = { hasCv: true, fileName, updatedAt: new Date().toISOString() };
      db.profile.completeness = calculateCompleteness(db.profile);
      return { ...db.profile };
    },
    () => apiClient.post('/career/profile/cv', { fileName }),
  );
}

/** @returns {Promise<import('../models/index.js').CareerStats>} */
export function getCareerStats() {
  return withMock(
    async () => {
      await delay(260);
      return { ...db.stats };
    },
    () => apiClient.get('/career/stats'),
  );
}

export function listAchievements() {
  return withMock(
    async () => {
      await delay(220);
      return [...db.achievements];
    },
    () => apiClient.get('/career/achievements'),
  );
}

/**
 * Mark a skill as verified after its skill mission is completed.
 * @param {string} skillName
 */
export function verifySkill(skillName) {
  return withMock(
    async () => {
      await delay(200);
      const skill = db.profile.skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
      if (skill) {
        skill.verified = true;
        skill.level = Math.min(100, skill.level + 4);
      }
      return { ...db.profile };
    },
    () => apiClient.post('/career/profile/skills/verify', { skill: skillName }),
  );
}
