/**
 * Organizations: the employer side of the marketplace.
 * Backed by `GET /organizations`, `GET /organizations/:id`, `PATCH /organizations/:id`,
 * `GET /organizations/:id/jobs`, `GET /organizations/:id/applications`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';

/** @returns {Promise<import('../models/index.js').Organization[]>} */
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
      if (!organization) throw new Error('That company profile no longer exists.');
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
 * employer → company → job → candidate → application.
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
      if (!organization) throw new Error('That company profile no longer exists.');

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
        // A real matching service scores this per candidate. Until it exists the
        // job carries no score rather than a fabricated one.
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

/** Applications received by this organization, resolved against the candidate pool. */
export function listInboundApplications(organizationId) {
  return withMock(
    async () => {
      await delay(320);
      return db.inboundApplications
        .filter((a) => a.organizationId === organizationId)
        .map((a) => ({ ...a, candidate: db.candidates.find((c) => c.id === a.candidateId) ?? null }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    () => apiClient.get(`/organizations/${organizationId}/applications`),
  );
}

/** Move an application along the pipeline. */
export function setApplicationStatus(applicationId, status) {
  return withMock(
    async () => {
      await delay(300);
      const application = db.inboundApplications.find((a) => a.id === applicationId);
      if (!application) throw new Error('That application no longer exists.');
      application.status = status;
      application.updatedAt = new Date().toISOString();
      return { ...application };
    },
    () => apiClient.patch(`/applications/${applicationId}`, { status }),
  );
}

/** Headline numbers for the employer dashboard. */
export function getRecruitmentOverview(organizationId) {
  return withMock(
    async () => {
      await delay(260);
      const jobs = db.jobs.filter((j) => j.organizationId === organizationId);
      const inbound = db.inboundApplications.filter((a) => a.organizationId === organizationId);
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
