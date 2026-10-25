import { create } from 'zustand';
import * as organizationService from '../services/organizationService.js';
import * as socialService from '../services/socialService.js';

/**
 * The company office a candidate is currently standing in.
 *
 * Every office is the same room; which company it belongs to comes from the
 * route. The furniture's interactions need to know that, and an interaction is
 * a plain function with no access to React state — so the visited company
 * lives here, the page loads it on the way in, and both the interactions and
 * the panels read it.
 *
 * Deliberately separate from `employerStore`, which holds the organization the
 * signed-in employer *acts for*. Visiting a company and running one are
 * different relationships, and sharing one slot would eventually show somebody
 * their own pipeline in a stranger's lobby.
 */
export const useOfficeStore = create((set, get) => ({
  /** @type {import('../models/index.js').Organization | null} */
  organization: null,
  /** Posts this company has shared, newest first. */
  posts: [],
  status: 'idle',
  error: null,

  /** Load the company whose office this is. */
  visit: async (organizationId) => {
    if (!organizationId) return null;
    if (get().organization?.id === organizationId && get().status === 'ready') {
      return get().organization;
    }

    set({ status: 'loading', error: null });
    try {
      const [organization, posts] = await Promise.all([
        organizationService.getOrganization(organizationId),
        // A company with nothing to say is not an error, so the notice board
        // degrades to empty rather than failing the whole room.
        socialService.listOrganizationPosts(organizationId).catch(() => []),
      ]);
      if (!organization) {
        set({ status: 'error', error: 'That company is no longer listed.', organization: null, posts: [] });
        return null;
      }
      set({ organization, posts, status: 'ready' });
      return organization;
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not open that office.' });
      return null;
    }
  },

  /** Leave. Called on the way out so the next office starts empty. */
  reset: () => set({ organization: null, posts: [], status: 'idle', error: null }),
}));
