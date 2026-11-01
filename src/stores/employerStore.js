import { create } from 'zustand';
import * as organizationService from '../services/organizationService.js';
import { useCityBoardStore } from './cityBoardStore.js';

/**
 * The employer workspace.
 *
 * Holds the organization the signed-in employer is acting for, plus the jobs
 * and pipeline that belong to it. Employers get no XP, missions or career
 * level: they are running a hiring process, not developing a career, and
 * forcing them through candidate progression would make neither experience
 * make sense.
 *
 * Publishing a role, or moving one in or out of `published`, changes the
 * open-role counts on the notice boards standing in the city. Those counts are
 * a server-side aggregate with no live channel behind them, so nothing would
 * tell the city it had gone stale — this store is the only place that knows
 * the roles moved, so it is the place that says so.
 */
export const useEmployerStore = create((set, get) => ({
  /** @type {import('../models/index.js').Organization | null} */
  organization: null,
  membership: null,
  jobs: [],
  applications: [],
  overview: null,
  status: 'idle',
  error: null,
  publishing: false,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const active = await organizationService.getActiveOrganization();
      if (!active) {
        set({ status: 'ready', organization: null, membership: null, jobs: [], applications: [], overview: null });
        return null;
      }

      const [jobs, applications, overview] = await Promise.all([
        organizationService.listOrganizationJobs(active.organization.id),
        organizationService.listInboundApplications(active.organization.id),
        organizationService.getRecruitmentOverview(active.organization.id),
      ]);

      set({
        organization: active.organization,
        membership: active.membership,
        jobs,
        applications,
        overview,
        status: 'ready',
      });
      return active.organization;
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not load your employer space.' });
      return null;
    }
  },

  reset: () =>
    set({ organization: null, membership: null, jobs: [], applications: [], overview: null, status: 'idle', error: null }),

  publishJob: async (draft) => {
    const organization = get().organization;
    if (!organization) throw new Error('No company profile on this account yet.');
    set({ publishing: true });
    try {
      const job = await organizationService.publishJob(organization.id, draft);
      const overview = await organizationService.getRecruitmentOverview(organization.id);
      set((state) => ({ jobs: [job, ...state.jobs], overview }));
      useCityBoardStore.getState().invalidate();
      return job;
    } finally {
      set({ publishing: false });
    }
  },

  setJobStatus: async (jobId, status) => {
    const job = await organizationService.updateJobStatus(jobId, status);
    const organization = get().organization;
    const overview = organization
      ? await organizationService.getRecruitmentOverview(organization.id)
      : get().overview;
    set((state) => ({ jobs: state.jobs.map((j) => (j.id === jobId ? job : j)), overview }));
    // Pausing or closing a role removes it from the city's count just as
    // surely as publishing one adds it.
    useCityBoardStore.getState().invalidate();
    return job;
  },

  setApplicationStatus: async (applicationId, status, options) => {
    const updated = await organizationService.setApplicationStatus(applicationId, status, options);
    const organization = get().organization;
    const overview = organization
      ? await organizationService.getRecruitmentOverview(organization.id)
      : get().overview;
    set((state) => ({
      applications: state.applications.map((a) =>
        a.id === applicationId ? { ...a, ...updated, candidate: a.candidate } : a,
      ),
      overview,
    }));
    return updated;
  },

  updateCompany: async (patch) => {
    const organization = get().organization;
    if (!organization) throw new Error('No company profile on this account yet.');
    const updated = await organizationService.updateOrganization(organization.id, patch);
    set({ organization: updated });
    return updated;
  },

  uploadLogo: async ({ fileName }) => {
    const organization = get().organization;
    if (!organization) throw new Error('No company profile on this account yet.');
    const updated = await organizationService.uploadOrganizationLogo(organization.id, { fileName });
    set({ organization: updated });
    return updated;
  },
}));
