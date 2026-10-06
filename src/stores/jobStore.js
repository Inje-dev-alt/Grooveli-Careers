import { create } from 'zustand';
import * as jobService from '../services/jobService.js';
import * as applicationService from '../services/applicationService.js';

/**
 * Job discovery state: the query the user has built, and the small amount of
 * per-user state (saved, applied) the UI needs to render a list correctly.
 *
 * The job records themselves are not cached here — they are fetched through the
 * service layer by whichever screen needs them, so there is one source of truth
 * and no stale copy to invalidate.
 */
export const EMPTY_QUERY = {
  search: '',
  districtId: '',
  employmentTypes: [],
  workModes: [],
  seniority: [],
  minSalary: 0,
  minMatch: 0,
  sort: 'match',
};

export const useJobStore = create((set, get) => ({
  query: { ...EMPTY_QUERY },
  savedJobIds: [],
  /** @type {import('../models/index.js').Application[]} */
  applications: [],
  applyingJobId: null,

  setQuery: (patch) => set((state) => ({ query: { ...state.query, ...patch } })),
  resetQuery: () => set({ query: { ...EMPTY_QUERY } }),

  /** Toggle one value inside a multi-select facet. */
  toggleFacet: (facet, value) =>
    set((state) => {
      const current = state.query[facet] ?? [];
      return {
        query: {
          ...state.query,
          [facet]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
        },
      };
    }),

  hasActiveFilters: () => {
    const q = get().query;
    return Boolean(
      q.search ||
        q.districtId ||
        q.employmentTypes.length ||
        q.workModes.length ||
        q.seniority.length ||
        q.minSalary > 0 ||
        q.minMatch > 0,
    );
  },

  /**
   * Saved jobs and application history are supporting data for the list — a
   * failure should cost a bookmark icon, not the whole screen, so it degrades
   * quietly rather than rejecting into the caller's effect.
   */
  loadSavedJobs: async () => {
    try {
      const savedJobIds = await jobService.listSavedJobIds();
      set({ savedJobIds });
    } catch {
      set({ savedJobIds: [] });
    }
  },

  isSaved: (jobId) => get().savedJobIds.includes(jobId),

  toggleSaved: async (jobId) => {
    const saved = !get().isSaved(jobId);
    // Optimistic: saving is cheap and reversible, and the list should not lag.
    set((state) => ({
      savedJobIds: saved
        ? [...state.savedJobIds, jobId]
        : state.savedJobIds.filter((id) => id !== jobId),
    }));
    try {
      const savedJobIds = await jobService.setJobSaved(jobId, saved);
      set({ savedJobIds });
    } catch {
      set((state) => ({
        savedJobIds: saved
          ? state.savedJobIds.filter((id) => id !== jobId)
          : [...state.savedJobIds, jobId],
      }));
    }
    return saved;
  },

  loadApplications: async () => {
    try {
      const applications = await applicationService.listApplications();
      set({ applications });
      return applications;
    } catch {
      return get().applications;
    }
  },

  hasApplied: (jobId) => get().applications.some((a) => a.jobId === jobId),

  /**
   * Submit an application. Returns the created record so the caller can decide
   * what the action was worth in career terms — this store does not award XP.
   */
  apply: async (jobId, payload) => {
    set({ applyingJobId: jobId });
    try {
      const application = await applicationService.applyToJob(jobId, payload);
      set((state) => ({
        applications: state.applications.some((a) => a.id === application.id)
          ? state.applications
          : [application, ...state.applications],
      }));
      return application;
    } finally {
      set({ applyingJobId: null });
    }
  },
}));
