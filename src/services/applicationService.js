/**
 * Applications and interviews, candidate side.
 * Backed by `POST /jobs/:id/apply`, `GET /applications`, `GET /interviews`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';

function candidateId() {
  return currentAccount()?.id ?? 'anonymous';
}

/** @returns {Promise<import('../models/index.js').Application[]>} */
export function listApplications() {
  return withMock(
    async () => {
      await delay();
      const me = candidateId();
      return db.applications
        .filter((a) => a.candidateId === me)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    () => apiClient.get('/applications'),
  );
}

/**
 * Submit an application.
 *
 * Re-applying returns the existing record rather than creating a duplicate,
 * which is also the behaviour the backend should implement. The UI confirms
 * before calling this — applying is consequential and should never be a side
 * effect of a click somewhere else.
 *
 * @returns {Promise<import('../models/index.js').Application>}
 */
export function applyToJob(jobId, payload = {}) {
  return withMock(
    async () => {
      await delay(520);
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error('That role is no longer listed.');

      const me = candidateId();
      const existing = db.applications.find((a) => a.jobId === jobId && a.candidateId === me);
      if (existing) return { ...existing };

      const now = new Date().toISOString();
      /** @type {import('../models/index.js').Application} */
      const application = {
        id: nextId('app'),
        jobId: job.id,
        jobTitle: job.title,
        organizationId: job.organizationId,
        companyName: job.companyName,
        candidateId: me,
        status: 'applied',
        appliedAt: now,
        updatedAt: now,
        note: payload.note,
      };

      db.applications.unshift(application);
      return { ...application };
    },
    () => apiClient.post(`/jobs/${jobId}/apply`, payload),
  );
}

export function withdrawApplication(applicationId) {
  return withMock(
    async () => {
      await delay(300);
      const application = db.applications.find((a) => a.id === applicationId);
      if (!application) throw new Error('That application no longer exists.');
      application.status = 'withdrawn';
      application.updatedAt = new Date().toISOString();
      return { ...application };
    },
    () => apiClient.patch(`/applications/${applicationId}`, { status: 'withdrawn' }),
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
 * Record a completed interview simulation. The score comes from the AI service;
 * the frontend only reports completion.
 */
export function recordInterviewSimulation({ jobTitle, companyName, score }) {
  return withMock(
    async () => {
      await delay(300);
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
      return interview;
    },
    () => apiClient.post('/interviews/simulations', { jobTitle, companyName, score }),
  );
}
