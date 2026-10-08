import { create } from 'zustand';
import * as authService from '../services/authService.js';

/**
 * Session and identity.
 *
 * One account holds both capabilities. The store exposes where the user is in
 * the identity flow — signed out, no role yet, role chosen but not onboarded,
 * ready — so routing never has to infer it from scattered fields.
 *
 * @typedef {'idle' | 'restoring' | 'authenticating' | 'authenticated' | 'error'} AuthStatus
 */
export const useAuthStore = create((set, get) => ({
  /** @type {import('../models/index.js').User | null} */
  user: null,
  /** @type {AuthStatus} */
  status: authService.hasSession() ? 'restoring' : 'idle',
  error: null,

  /** Re-establish a session from a stored token. Called once on boot. */
  restoreSession: async () => {
    if (!authService.hasSession()) {
      set({ status: 'idle' });
      return null;
    }
    if (get().user) return get().user;
    try {
      const user = await authService.getCurrentUser();
      set({ user, status: 'authenticated', error: null });
      return user;
    } catch {
      await authService.logout().catch(() => {});
      set({ user: null, status: 'idle', error: null });
      return null;
    }
  },

  signIn: async (credentials) => {
    set({ status: 'authenticating', error: null });
    try {
      const { user } = await authService.login(credentials);
      set({ user, status: 'authenticated', error: null });
      return user;
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not sign you in.' });
      throw error;
    }
  },

  register: async (credentials) => {
    set({ status: 'authenticating', error: null });
    try {
      const { user } = await authService.register(credentials);
      set({ user, status: 'authenticated', error: null });
      return user;
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not create your account.' });
      throw error;
    }
  },

  /** Add a capability to this account and make it active. */
  chooseRole: async (role) => {
    const user = await authService.chooseRole(role);
    set({ user });
    return user;
  },

  /** Move between capabilities the account already holds. */
  switchRole: async (role) => {
    const user = await authService.switchRole(role);
    set({ user });
    return user;
  },

  completeCandidateOnboarding: async (draft) => {
    const user = await authService.completeCandidateOnboarding(draft);
    set({ user });
    return user;
  },

  completeEmployerOnboarding: async (draft) => {
    const { user } = await authService.completeEmployerOnboarding(draft);
    set({ user });
    return user;
  },

  signOut: async () => {
    // The local session clears whatever the server says — a failed round-trip
    // must not leave someone stuck signed in.
    await authService.logout().catch(() => {});
    set({ user: null, status: 'idle', error: null });
  },

  clearError: () => set({ error: null }),
}));

export const selectIsAuthenticated = (state) =>
  state.status === 'authenticated' && Boolean(state.user);
export const selectIsRestoring = (state) => state.status === 'restoring';
export const selectActiveRole = (state) => state.user?.activeRole ?? null;

/** Signed in but has not said whether they are hiring or looking. */
export const selectNeedsRole = (state) =>
  Boolean(state.user) && (state.user.roles?.length ?? 0) === 0;

/**
 * Has a role but has not finished setting it up. Candidate onboarding creates a
 * profile; employer onboarding creates an organization. Both are required
 * before the respective experience makes any sense.
 */
export const selectNeedsOnboarding = (state) => {
  const user = state.user;
  if (!user || (user.roles?.length ?? 0) === 0) return null;
  if (user.activeRole === 'candidate' && !user.candidateProfileId) return 'candidate';
  if (user.activeRole === 'employer' && (user.organizationMemberships?.length ?? 0) === 0) return 'employer';
  return null;
};

/** Where a fully set-up user belongs. */
export const selectHomeRoute = (state) =>
  state.user?.activeRole === 'employer' ? '/employer' : '/city';

/**
 * The capability this account is not currently using.
 *
 * Returned as two primitives rather than one object: Zustand compares snapshots
 * by reference, so a selector that builds an object every call re-renders
 * forever.
 */
export const selectOtherRole = (state) =>
  state.user?.activeRole === 'employer' ? 'candidate' : 'employer';

export const selectCanSwitchRole = (state) =>
  (state.user?.roles ?? []).includes(selectOtherRole(state));
