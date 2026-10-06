import { create } from 'zustand';
import * as authService from '../services/authService.js';

/**
 * Session state only. The account itself belongs to the backend; this store
 * records who is signed in and whether the sign-in attempt is in flight, so
 * every screen can render an authentication state rather than guessing.
 *
 * @typedef {'idle' | 'restoring' | 'authenticating' | 'authenticated' | 'error'} AuthStatus
 */
export const useAuthStore = create((set, get) => ({
  /** @type {import('../models/index.js').User | null} */
  user: null,
  /**
   * Starts as `restoring` when a token is already on the device, so protected
   * routes wait for the session check instead of bouncing the user to the entry
   * screen on every reload or deep link.
   * @type {AuthStatus}
   */
  status: authService.hasSession() ? 'restoring' : 'idle',
  error: null,

  /**
   * Re-establish a session from a stored token. Called once on boot. A failure
   * here is not an error the user needs to see — it just means signing in again.
   */
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

  /** Prototype entry: signs the demo candidate in without a credential form. */
  enterAsDemoCandidate: async () => {
    set({ status: 'authenticating', error: null });
    try {
      const { user } = await authService.startDemoSession();
      set({ user, status: 'authenticated', error: null });
      return user;
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not start the session.' });
      throw error;
    }
  },

  signOut: async () => {
    // The local session is cleared whatever the server says — a failed
    // round-trip must not leave the user stuck signed in.
    await authService.logout().catch(() => {});
    set({ user: null, status: 'idle', error: null });
  },

  clearError: () => set({ error: null }),
}));

export const selectIsAuthenticated = (state) => state.status === 'authenticated' && Boolean(state.user);
export const selectIsRestoring = (state) => state.status === 'restoring';
