/**
 * Job discovery.
 * Backed by `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/save`.
 *
 * Search, filtering and sorting are expressed as query parameters rather than
 * done in components, because the backend will own them once it exists. The
 * mock branch implements the same semantics locally so the UI never has to
 * change shape.
 */
import { apiClient, withMock } from './apiClient.js';
import { db } from './mockDb.js';
import { delay } from '../utils/delay.js';

/**
 * @typedef {Object} JobQuery
 * @property {string} [search]
 * @property {string} [districtId]
 * @property {string[]} [employmentTypes]
 * @property {string[]} [workModes]
 * @property {string[]} [seniority]
 * @property {number} [minSalary]
 * @property {number} [minMatch]
 * @property {'match' | 'recent' | 'salary'} [sort]
 */

const SORTERS = {
  match: (a, b) => b.matchScore - a.matchScore,
  recent: (a, b) => new Date(b.postedAt) - new Date(a.postedAt),
  salary: (a, b) => b.salary.max - a.salary.max,
};

function matchesQuery(job, query) {
  const {
    search,
    districtId,
    employmentTypes = [],
    workModes = [],
    seniority = [],
    minSalary = 0,
    minMatch = 0,
  } = query;

  if (districtId && job.districtId !== districtId) return false;
  if (employmentTypes.length && !employmentTypes.includes(job.employmentType)) return false;
  if (workModes.length && !workModes.includes(job.workMode)) return false;
  if (seniority.length && !seniority.includes(job.seniority)) return false;
  if (job.salary.max < minSalary) return false;
  if (job.matchScore < minMatch) return false;

  if (search) {
    const needle = search.trim().toLowerCase();
    const haystack = [job.title, job.companyName, job.location, job.summary, ...job.skills]
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

/** Roles the AI surfaces as "new matches" — the strongest fits, newest first. */
export function listRecommendedJobs(limit = 4) {
  return withMock(
    async () => {
      await delay(260);
      return [...db.jobs].sort(SORTERS.match).slice(0, limit);
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

/** @returns {Promise<string[]>} */
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
