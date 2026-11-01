import { create } from 'zustand';
import { countOpenRolesByDistrict } from '../services/jobService.js';

/**
 * What the city's notice boards are showing.
 *
 * The world never calls a service — Phaser reads stores, React fills them —
 * so the boards work the same whether the numbers came from the mock layer or
 * from the database, and the scene has no opinion about which.
 *
 * A failed load leaves `openRoles` empty and the status at 'error' rather than
 * throwing. The boards then show a dash, which is what a notice board nobody
 * has updated looks like; an exception here would take the whole city down for
 * the sake of eleven integers.
 */

/**
 * How long a loaded count stays trustworthy.
 *
 * Only `refresh()` honours it. Thirty seconds is long enough that tabbing
 * between windows a few times costs one request rather than six, and short
 * enough that coming back to a city you left open shows current numbers.
 */
const FRESH_MS = 30_000;

async function fetchCounts(set) {
  set({ status: 'loading' });
  try {
    set({ openRoles: await countOpenRolesByDistrict(), status: 'ready', loadedAt: Date.now() });
  } catch {
    set({ openRoles: {}, status: 'error', loadedAt: 0 });
  }
}

export const useCityBoardStore = create((set, get) => ({
  /** @type {Record<string, number>} */
  openRoles: {},
  status: 'idle',
  loadedAt: 0,
  /** How many live views are showing these numbers. See `watch`. */
  watchers: 0,

  /**
   * Register a live view of the counts, and get back the way to drop it.
   *
   * The scene's notice boards call this while they exist. It is what lets
   * `invalidate` tell the difference between "correct the boards someone is
   * looking at" and "a number changed in a part of the product that has no
   * boards in it", which is most of the time.
   */
  watch: () => {
    set((state) => ({ watchers: state.watchers + 1 }));
    return () => set((state) => ({ watchers: Math.max(0, state.watchers - 1) }));
  },

  /** Fetch regardless of how recently we last did. For entering the city. */
  load: () => fetchCounts(set),

  /**
   * Fetch unless the numbers are already fresh, or a fetch is in flight.
   *
   * This is what the focus and visibility handlers call. Both fire when you
   * come back to the window from another application, so without the guard a
   * single return would cost two identical requests.
   */
  refresh: () => {
    const { status, loadedAt } = get();
    if (status === 'loading') return Promise.resolve();
    if (Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
    return fetchCounts(set);
  },

  /**
   * The counts are no longer true — something changed which roles are
   * published.
   *
   * Dropping the freshness stamp is the part that always matters: it is what
   * stops the next `refresh()` being throttled into a no-op, so whenever the
   * city is next opened or focused it asks again.
   *
   * The immediate refetch is only worth spending when boards are actually on
   * screen. Today they cannot be — `/city` is candidate-only and publishing
   * happens in the employer workspace, so this branch does not fire in the
   * current routing. It is here so that the day an employer action becomes
   * reachable from inside the city, the board behind them corrects itself
   * instead of waiting for them to tab away and back.
   */
  invalidate: () => {
    set({ loadedAt: 0 });
    if (get().watchers > 0) return fetchCounts(set);
    return Promise.resolve();
  },
}));
