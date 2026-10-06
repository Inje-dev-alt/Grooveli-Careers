/**
 * Applications and interviews.
 * Backed by `POST /jobs/:id/apply`, `GET /applications`, `GET /interviews`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId } from './mockDb.js';
import { delay } from '../utils/delay.js';

/** @returns {Promise<import('../models/index.js').Application[]>} */
export function listApplications() {
  return withMock(
    async () => {
      await delay();
      return [...db.applications].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    () => apiClient.get('/applications'),
  );
}

/**
 * Submit an application.
 *
 * The AI flow in the PRD confirms before consequential actions; the UI asks
 * first and only then calls this. Re-applying is rejected rather than silently
 * duplicated, which is also the behaviour the backend should implement.
 *
 * @param {string} jobId
 * @param {{ note?: string }} [payload]
 * @returns {Promise<import('../models/index.js').Application>}
 */
export function applyToJob(jobId, payload = {}) {
  return withMock(
    async () => {
      await delay(520);
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) {
        throw new Error('That role is no longer listed.');
      }
      const existing = db.applications.find((a) => a.jobId === jobId);
      if (existing) return existing;

      const now = new Date().toISOString();
      /** @type {import('../models/index.js').Application} */
      const application = {
        id: nextId('app'),
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.companyName,
        status: 'submitted',
        appliedAt: now,
        updatedAt: now,
        note: payload.note,
      };
      db.applications.unshift(application);
      db.stats.applications += 1;
      return application;
    },
    () => apiClient.post(`/jobs/${jobId}/apply`, payload),
  );
}

/** @returns {Promise<import('../models/index.js').Interview[]>} */
export function listInterviews() {
  return withMock(
    async () => {
      await delay(240);
      return [...db.interviews].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    },
    () => apiClient.get('/interviews'),
  );
}

/**
 * Record a completed interview simulation.
 * The score is produced by the AI service; the frontend only reports completion.
 */
export function recordInterviewSimulation({ jobTitle, companyName, score }) {
  return withMock(
    async () => {
      await delay(300);
      /** @type {import('../models/index.js').Interview} */
      const interview = {
        id: nextId('int'),
        applicationId: '',
        companyName: companyName || 'Grooveli AI',
        jobTitle: jobTitle || 'Interview simulation',
        type: 'simulation',
        scheduledAt: new Date().toISOString(),
        status: 'completed',
        score,
      };
      db.interviews.push(interview);
      db.stats.interviews += 1;
      return interview;
    },
    () => apiClient.post('/interviews/simulations', { jobTitle, companyName, score }),
  );
}
