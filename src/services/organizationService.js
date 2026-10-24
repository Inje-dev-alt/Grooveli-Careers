/**
 * Organizations: the employer side of the marketplace.
 * Backed by `GET /organizations`, `GET /organizations/:id`, `PATCH /organizations/:id`,
 * `GET /organizations/:id/jobs`, `GET /organizations/:id/applications`.
 *
 * The pipeline reads the SAME `applications` rows the candidate list reads,
 * filtered by organization - one table, two views. An application submitted by
 * a real candidate appears here immediately, which is the whole point of the
 * marketplace the product is built on.
 */
import { apiClient, withMock, ApiError } from './apiClient.js';
import { db, nextId, currentAccount, currentUserId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { resolveCandidateForEmployer } from './candidateService.js';
import { recordStageChange, notifyUser, stageNotice } from './applicationService.js';

export function listOrganizations(filters = {}) {
  return withMock(
    async () => {
      await delay();
      return db.organizations.filter((o) => {
        if (filters.districtId && o.districtId !== filters.districtId) return false;
        if (filters.industry && o.industry !== filters.industry) return false;
        return true;
      });
    },
    () => apiClient.get('/organizations', { params: filters }),
  );
}

export function getOrganization(organizationId) {
  return withMock(
    async () => {
      await delay(200);
      return db.organizations.find((o) => o.id === organizationId) ?? null;
    },
    () => apiClient.get(`/organizations/${organizationId}`),
  );
}

export function updateOrganization(organizationId, patch) {
  return withMock(
    async () => {
      await delay(420);
      const organization = db.organizations.find((o) => o.id === organizationId);
      if (!organization) throw new Error('That company profile does not exist anymore.');
      Object.assign(organization, patch);
      return { ...organization };
    },
    () => apiClient.patch(`/organizations/${organizationId}`, patch),
  );
}

/** The organization the signed-in employer is acting for. */
export function getActiveOrganization() {
  return withMock(
    async () => {
      await delay(180);
      const account = currentAccount();
      const membership = account?.organizationMemberships?.[0];
      if (!membership) return null;
      const organization = db.organizations.find((o) => o.id === membership.organizationId) ?? null;
      return organization ? { organization, membership } : null;
    },
    () => apiClient.get('/organizations/active'),
  );
}

/** Jobs this organization has published, newest first. */
export function listOrganizationJobs(organizationId) {
  return withMock(
    async () => {
      await delay(280);
      return db.jobs
        .filter((j) => j.organizationId === organizationId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    () => apiClient.get(`/organizations/${organizationId}/jobs`),
  );
}

/**
 * Publish a job.
 *
 * It is written straight into the same job collection the candidate
 * marketplace reads, tagged `grooveli_employer`. That single fact is what
 * demonstrates the marketplace relationship the product depends on:
 * employer - company - job - candidate - application.
 *
 * @param {string} organizationId
 * @param {object} draft
 * @returns {Promise<import('../models/index.js').Job>}
 */
export function publishJob(organizationId, draft) {
  return withMock(
    async () => {
      await delay(720);
      const organization = db.organizations.find((o) => o.id === organizationId);
      if (!organization) throw new Error('That company profile does not exist anymore.');

      /** @type {import('../models/index.js').Job} */
      const job = {
        id: nextId('job'),
        organizationId,
        companyName: organization.name,
        title: draft.title,
        description: draft.description,
        salaryMin: Number(draft.salaryMin) || 0,
        salaryMax: Number(draft.salaryMax) || 0,
        currency: draft.currency || 'NGN',
        salaryPeriod: draft.salaryPeriod || 'month',
        location: draft.location,
        workType: draft.workType || 'onsite',
        employmentType: draft.employmentType || 'full-time',
        experienceLevel: draft.experienceLevel || 'mid',
        requiredSkills: draft.requiredSkills ?? [],
        preferredSkills: draft.preferredSkills ?? [],
        industry: organization.industry,
        districtId: organization.districtId,
        deadline: draft.deadline || undefined,
        status: 'published',
        source: 'grooveli_employer',
        createdAt: new Date().toISOString(),
        responsibilities: [],
        requirements: [],
        featured: false,
        // Scores are computed per requesting candidate by the matching service
        // (client-side today, backend later). The row itself carries none.
        matchScore: undefined,
        matchReasons: [],
        skillGaps: [],
      };

      db.jobs.unshift(job);
      return { ...job };
    },
    () => apiClient.post(`/organizations/${organizationId}/jobs`, draft),
  );
}

export function updateJobStatus(jobId, status) {
  return withMock(
    async () => {
      await delay(260);
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error('That role no longer exists.');
      job.status = status;
      return { ...job };
    },
    () => apiClient.patch(`/jobs/${jobId}`, { status }),
  );
}

/** Applications received by this organization - the same rows the candidate sees. */
export function listInboundApplications(organizationId) {
  return withMock(
    async () => {
      await delay(320);
      return db.applications
        .filter((a) => a.organizationId === organizationId)
        .map((a) => ({ ...a, candidate: resolveCandidateForEmployer(a.candidateId) }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    () => apiClient.get(`/organizations/${organizationId}/applications`),
  );
}

/**
 * Move an application along the pipeline.
 *
 * Rejecting asks for a reason: a no with no feedback teaches nothing, and the
 * candidate-side "Bounce Back" mission turns the lesson into the next move.
 *
 * @param {string} applicationId
 * @param {import('../models/index.js').ApplicationStatus} status
 * @param {{ feedback?: string }} [options]
 */
export function setApplicationStatus(applicationId, status, options = {}) {
  return withMock(
    async () => {
      await delay(300);
      const application = db.applications.find((a) => a.id === applicationId);
      if (!application) throw new Error('That application no longer exists.');

      const from = application.status;
      application.status = status;
      application.updatedAt = new Date().toISOString();
      application.stageEnteredAt = application.updatedAt;

      let note = options.feedback?.trim() || null;
      if (status === 'rejected') {
        // The API refuses a rejection with no reason, so this does too. It used
        // to substitute canned text, which made the prototype more permissive
        // than production and put words in an employer's mouth.
        if (!note) {
          throw new ApiError('A rejection needs a reason the candidate can act on.', {
            status: 400,
            code: 'bad_request',
            details: { field: 'feedback' },
          });
        }
        application.feedback = note;
        // A new rejection is unread, even if an earlier one on this row was read.
        application.rejectionAcknowledged = false;
      }
      recordStageChange(application, from, status, 'employer', note);

      // The same copy the simulation uses, from one table. This branch used to
      // write a flatter "moved to shortlisted", so a candidate got a worse
      // message when a real employer moved them than when the timer did.
      const notice = stageNotice(status, application.jobTitle, application.companyName);
      if (notice) notifyUser(application.candidateId, notice);

      return { ...application };
    },
    () => apiClient.patch(`/applications/${applicationId}`, { status, feedback: options.feedback }),
  );
}

/** Headline numbers for the employer dashboard. */
export function getRecruitmentOverview(organizationId) {
  return withMock(
    async () => {
      await delay(260);
      const jobs = db.jobs.filter((j) => j.organizationId === organizationId);
      const inbound = db.applications.filter((a) => a.organizationId === organizationId);
      return {
        openJobs: jobs.filter((j) => j.status === 'published').length,
        totalJobs: jobs.length,
        applications: inbound.length,
        shortlisted: inbound.filter((a) => a.status === 'shortlisted').length,
        interviews: inbound.filter((a) => a.status === 'interview').length,
      };
    },
    () => apiClient.get(`/organizations/${organizationId}/overview`),
  );
}

/** Who is signed in as an employer, for audit trails on pipeline moves. */
export function currentEmployerId() {
  return currentUserId();
}

/**
 * HR analytics: hiring as numbers, computed from the same application rows the
 * pipeline reads. No invented figures — an empty pipeline returns zeros and
 * the panel renders honest empty states.
 *
 * Backed by `GET /organizations/:id/analytics`.
 */
export function getHiringAnalytics(organizationId) {
  return withMock(
    async () => {
      await delay(320);
      const inbound = db.applications.filter((a) => a.organizationId === organizationId);
      const jobs = db.jobs.filter((j) => j.organizationId === organizationId);

      const byStage = {};
      inbound.forEach((a) => {
        byStage[a.status] = (byStage[a.status] ?? 0) + 1;
      });

      const now = Date.now();
      const daysInStage = inbound.map((a) => {
        const entered = new Date(a.stageEnteredAt ?? a.updatedAt).getTime();
        return Number.isFinite(entered) ? Math.max(0, (now - entered) / 86400000) : 0;
      });
      const avgDaysInStage = daysInStage.length === 0
        ? 0
        : Math.round((daysInStage.reduce((t, d) => t + d, 0) / daysInStage.length) * 10) / 10;

      const sourceMix = {};
      jobs.forEach((j) => {
        sourceMix[j.source ?? 'mock'] = (sourceMix[j.source ?? 'mock'] ?? 0) + 1;
      });

      // Match distribution across applicants who resolve to a real profile.
      // Buckets are fixed here so the backend can own the same boundaries.
      const matchBuckets = { '0-39': 0, '40-59': 0, '60-79': 0, '80-100': 0, unscored: 0 };
      inbound.forEach((a) => {
        const candidate = resolveCandidateForEmployer(a.candidateId);
        const score = candidate?.matchScore;
        if (typeof score !== 'number') {
          matchBuckets.unscored += 1;
        } else if (score < 40) matchBuckets['0-39'] += 1;
        else if (score < 60) matchBuckets['40-59'] += 1;
        else if (score < 80) matchBuckets['60-79'] += 1;
        else matchBuckets['80-100'] += 1;
      });

      return {
        applications: inbound.length,
        byStage,
        avgDaysInStage,
        sourceMix,
        matchBuckets,
      };
    },
    () => apiClient.get(`/organizations/${organizationId}/analytics`),
  );
}

/**
 * Company logo upload. Same contract shape as the avatar: multipart with a
 * `file` part in production, file name only in the prototype.
 * Backed by `POST /organizations/:id/logo`.
 */
export function uploadOrganizationLogo(organizationId, { fileName }) {
  return withMock(
    async () => {
      await delay(480);
      const organization = db.organizations.find((o) => o.id === organizationId);
      if (!organization) throw new Error('That company profile does not exist anymore.');
      organization.logoUrl = fileName;
      return { ...organization };
    },
    () => apiClient.post(`/organizations/${organizationId}/logo`, { fileName }),
  );
}