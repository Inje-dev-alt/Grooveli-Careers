/**
 * Job discovery.
 * Backed by `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/save`.
 *
 * Search, filtering and sorting are query parameters rather than work done in
 * components, because the backend will own them. The mock branch implements the
 * same semantics locally so the UI never changes shape.
 *
 * The service consumes a normalised Job and never branches on `source`: a role
 * published by an employer here, a partner feed later and a seeded mock today
 * are all the same object to every screen above this line.
 */
import { apiClient, withMock } from './apiClient.js';
import { db } from './mockDb.js';
import { delay } from '../utils/delay.js';

/**
 * @typedef {Object} JobQuery
 * @property {string} [search]
 * @property {string} [districtId]
 * @property {string} [location]
 * @property {string} [industry]
 * @property {string[]} [employmentTypes]
 * @property {string[]} [workTypes]
 * @property {string[]} [experienceLevels]
 * @property {string[]} [skills]
 * @property {number} [minSalary]
 * @property {number} [minMatch]
 * @property {'match' | 'recent' | 'salary'} [sort]
 */

const SORTERS = {
  match: (a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0),
  recent: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  salary: (a, b) => b.salaryMax - a.salaryMax,
};

/** Every skill a job asks for, required or preferred. */
export function jobSkills(job) {
  return [...(job.requiredSkills ?? []), ...(job.preferredSkills ?? [])];
}

function matchesQuery(job, query) {
  const {
    search,
    districtId,
    location,
    industry,
    employmentTypes = [],
    workTypes = [],
    experienceLevels = [],
    skills = [],
    minSalary = 0,
    minMatch = 0,
  } = query;

  // Only published roles are discoverable; drafts and closed roles belong to
  // the employer who owns them.
  if (job.status !== 'published') return false;

  if (districtId && job.districtId !== districtId) return false;
  if (industry && job.industry !== industry) return false;
  if (location && !job.location.toLowerCase().includes(location.toLowerCase())) return false;
  if (employmentTypes.length && !employmentTypes.includes(job.employmentType)) return false;
  if (workTypes.length && !workTypes.includes(job.workType)) return false;
  if (experienceLevels.length && !experienceLevels.includes(job.experienceLevel)) return false;
  if (job.salaryMax < minSalary) return false;
  if (minMatch > 0 && (job.matchScore ?? 0) < minMatch) return false;

  if (skills.length) {
    const have = jobSkills(job).map((s) => s.toLowerCase());
    if (!skills.some((s) => have.includes(s.toLowerCase()))) return false;
  }

  if (search) {
    const needle = search.trim().toLowerCase();
    const haystack = [job.title, job.companyName, job.location, job.description, job.industry, ...jobSkills(job)]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

/**
 * @param {JobQuery} [query]
 * @returns {Promise<import('../models/index.js').Job[]>}
 */
export function listJobs(query = {}) {
  return withMock(
    async () => {
      await delay();
      const sorter = SORTERS[query.sort] ?? SORTERS.match;
      return db.jobs.filter((job) => matchesQuery(job, query)).sort(sorter);
    },
    () => apiClient.get('/jobs', { params: query }),
  );
}

/** @returns {Promise<import('../models/index.js').Job | null>} */
export function getJob(jobId) {
  return withMock(
    async () => {
      await delay(220);
      return db.jobs.find((job) => job.id === jobId) ?? null;
    },
    () => apiClient.get(`/jobs/${jobId}`),
  );
}

/** The strongest matches — what the AI surfaces as "new matches". */
export function listRecommendedJobs(limit = 4) {
  return withMock(
    async () => {
      await delay(260);
      return db.jobs
        .filter((j) => j.status === 'published')
        .sort(SORTERS.match)
        .slice(0, limit);
    },
    () => apiClient.get('/jobs/recommended', { params: { limit } }),
  );
}

/** @returns {Promise<string[]>} the full set of saved job ids after the change */
export function setJobSaved(jobId, saved) {
  return withMock(
    async () => {
      await delay(140);
      if (saved) db.savedJobIds.add(jobId);
      else db.savedJobIds.delete(jobId);
      return [...db.savedJobIds];
    },
    async () => {
      const result = saved
        ? await apiClient.post(`/jobs/${jobId}/save`)
        : await apiClient.delete(`/jobs/${jobId}/save`);
      return result?.savedJobIds ?? [];
    },
  );
}

export function listSavedJobIds() {
  return withMock(
    async () => {
      await delay(120);
      return [...db.savedJobIds];
    },
    async () => {
      const result = await apiClient.get('/jobs/saved');
      return result?.savedJobIds ?? [];
    },
  );
}

/** Distinct values for the filter facets, derived rather than hardcoded. */
export function getJobFacets() {
  return withMock(
    async () => {
      await delay(160);
      const published = db.jobs.filter((j) => j.status === 'published');
      return {
        industries: [...new Set(published.map((j) => j.industry))].sort(),
        skills: [...new Set(published.flatMap(jobSkills))].sort(),
      };
    },
    () => apiClient.get('/jobs/facets'),
  );
}
