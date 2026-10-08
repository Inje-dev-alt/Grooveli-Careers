/**
 * The candidate profile — Grooveli's career identity.
 * Backed by `GET /candidates/me`, `PATCH /candidates/me`, `POST /candidates/me/cv`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';

/** What a complete career identity contains, and what each part is worth. */
const COMPLETENESS_FIELDS = [
  { key: 'headline', weight: 12, label: 'Add a headline', test: (p) => Boolean(p.headline?.trim()) },
  { key: 'summary', weight: 12, label: 'Write a summary of at least 40 characters', test: (p) => (p.summary?.trim().length ?? 0) > 40 },
  { key: 'location', weight: 8, label: 'Set your location', test: (p) => Boolean(p.location?.trim()) },
  { key: 'skills', weight: 18, label: 'List at least five skills', test: (p) => (p.skills?.length ?? 0) >= 5 },
  { key: 'experience', weight: 14, label: 'Add your experience', test: (p) => (p.experience?.length ?? 0) >= 1 },
  { key: 'education', weight: 8, label: 'Add your education', test: (p) => (p.education?.length ?? 0) >= 1 },
  { key: 'careerGoal', weight: 8, label: 'Describe your career goal', test: (p) => Boolean(p.careerGoal?.trim()) },
  { key: 'salaryExpectation', weight: 8, label: 'Set a salary expectation', test: (p) => (p.salaryExpectation?.min ?? 0) > 0 },
  { key: 'cv', weight: 12, label: 'Upload your CV', test: (p) => Boolean(p.cv?.hasCv) },
];

/** @param {import('../models/index.js').CandidateProfile} profile */
export function calculateCompleteness(profile) {
  if (!profile) return 0;
  return COMPLETENESS_FIELDS.reduce((total, f) => (f.test(profile) ? total + f.weight : total), 0);
}

/** What is still missing, as instructions rather than field names. */
export function missingProfileFields(profile) {
  if (!profile) return COMPLETENESS_FIELDS.map((f) => ({ key: f.key, label: f.label }));
  return COMPLETENESS_FIELDS.filter((f) => !f.test(profile)).map((f) => ({ key: f.key, label: f.label }));
}

function resolveProfile() {
  const account = currentAccount();
  const profile = account?.candidateProfileId ? db.profiles[account.candidateProfileId] : null;
  if (!profile) throw new Error('No career profile on this account yet.');
  return profile;
}

/** @returns {Promise<import('../models/index.js').CandidateProfile>} */
export function getProfile() {
  return withMock(
    async () => {
      await delay();
      const profile = resolveProfile();
      profile.completeness = calculateCompleteness(profile);
      return { ...profile };
    },
    () => apiClient.get('/candidates/me'),
  );
}

export function updateProfile(patch) {
  return withMock(
    async () => {
      await delay(420);
      const profile = resolveProfile();
      Object.assign(profile, patch);
      profile.completeness = calculateCompleteness(profile);
      return { ...profile };
    },
    () => apiClient.patch('/candidates/me', patch),
  );
}

/**
 * CV upload.
 *
 * The real endpoint takes multipart form data and returns a stored file
 * reference. The prototype records the file name only — nothing is uploaded and
 * the file never leaves the browser.
 */
export function uploadCv({ fileName }) {
  return withMock(
    async () => {
      await delay(640);
      const profile = resolveProfile();
      profile.cv = { hasCv: true, fileName, updatedAt: new Date().toISOString() };
      profile.completeness = calculateCompleteness(profile);
      return { ...profile };
    },
    () => apiClient.post('/candidates/me/cv', { fileName }),
  );
}

/** Mark a skill verified after its assessment or skill mission is passed. */
export function verifySkill(skillName, score) {
  return withMock(
    async () => {
      await delay(200);
      const profile = resolveProfile();
      const skill = profile.skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
      if (skill) {
        skill.verified = true;
        skill.score = score ?? skill.score ?? 90;
        skill.level = Math.min(100, skill.level + 4);
      } else {
        profile.skills.push({
          id: `skl-${skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: skillName,
          category: 'general',
          level: 70,
          verified: true,
          score: score ?? 90,
        });
      }
      profile.completeness = calculateCompleteness(profile);
      return { ...profile };
    },
    () => apiClient.post('/candidates/me/skills/verify', { skill: skillName, score }),
  );
}

/** Add an experience entry during or after onboarding. */
export function addExperience(entry) {
  return withMock(
    async () => {
      await delay(300);
      const profile = resolveProfile();
      profile.experience.unshift({ id: `exp-${Date.now()}`, ...entry });
      profile.completeness = calculateCompleteness(profile);
      return { ...profile };
    },
    () => apiClient.post('/candidates/me/experience', entry),
  );
}

/** The candidate pool, as an employer discovers it. */
export function listCandidates(filters = {}) {
  return withMock(
    async () => {
      await delay();
      let results = [...db.candidates];
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        results = results.filter((c) =>
          [c.name, c.headline, c.location, ...c.skills.map((s) => s.name)].join(' ').toLowerCase().includes(needle),
        );
      }
      if (filters.skill) {
        results = results.filter((c) => c.skills.some((s) => s.name === filters.skill));
      }
      return results.sort((a, b) => b.matchScore - a.matchScore);
    },
    () => apiClient.get('/candidates', { params: filters }),
  );
}

export function getCandidate(candidateId) {
  return withMock(
    async () => {
      await delay(220);
      return db.candidates.find((c) => c.id === candidateId) ?? null;
    },
    () => apiClient.get(`/candidates/${candidateId}`),
  );
}
