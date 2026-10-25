import { create } from 'zustand';
import * as presenceService from '../services/presenceService.js';

/**
 * Who is online, and where this player is standing.
 *
 * ONE TIMER FOR THE WHOLE APP. Every room in the product would otherwise start
 * its own heartbeat, and moving between two of them — which happens on every
 * navigation — would briefly run both. The interval lives here and is started
 * once by `<PresenceHeartbeat />` in the app shell; rooms only declare where
 * they are, with `setPosition`, and never touch the timer.
 *
 * The position is held separately from the snapshot so a room can declare
 * itself before the first reply lands, and so the next beat always sends the
 * latest position rather than the one that was current when the timer started.
 */
export const usePresenceStore = create((set, get) => ({
  /** Where this player is: `{ scene, locationId }`. */
  position: { scene: 'city', locationId: null },

  /** Everyone online, this player included. 0 until the first beat answers. */
  cityOnline: 0,
  /** How many OTHER people share this room, named or not. */
  hereCount: 0,
  /** The ones in this room this player may see by name. */
  here: [],
  /** This player's accepted connections who are online, wherever they are. */
  connectionsOnline: [],
  /** @type {'everyone' | 'connections' | 'nobody'} */
  visibility: 'connections',

  /** Has a heartbeat ever answered? The HUD stays quiet until one has. */
  started: false,

  /**
   * Where this player is now.
   *
   * Called by each room on mount and whenever the player moves between places
   * inside it. A no-op when nothing changed, because the city calls it on
   * every proximity change and re-rendering the roster for a position that is
   * the same position is work for nothing.
   */
  setPosition: (scene, locationId = null) => {
    const current = get().position;
    if (current.scene === scene && current.locationId === locationId) return;
    // The roster belongs to the old room. Clearing it here rather than waiting
    // for the next beat stops a company's lobby showing the last room's people
    // for up to fifteen seconds.
    set({ position: { scene, locationId }, here: [], hereCount: 0 });
  },

  /**
   * Send one heartbeat and take the answer.
   *
   * Failure is swallowed deliberately. A missed beat means this player is
   * invisible to others for one window and sees a slightly stale city; the
   * next beat fixes both. Surfacing it would put a network error on the HUD
   * every time a tab wakes up from sleep.
   */
  beat: async () => {
    const { scene, locationId } = get().position;
    try {
      const snapshot = await presenceService.heartbeat({ scene, locationId });
      set({
        cityOnline: snapshot.cityOnline ?? 0,
        hereCount: snapshot.hereCount ?? 0,
        here: snapshot.here ?? [],
        connectionsOnline: snapshot.connectionsOnline ?? [],
        visibility: snapshot.visibility ?? 'connections',
        started: true,
      });
    } catch {
      // Intentionally silent — see above.
    }
  },

  /** Change who may see this player by name. */
  setVisibility: async (visibility) => {
    const previous = get().visibility;
    set({ visibility });
    try {
      const saved = await presenceService.setPresenceVisibility(visibility);
      set({ visibility: saved });
      // The setting changes who is visible to this player as well as the other
      // way round, so the next beat is pulled forward rather than waited for.
      await get().beat();
    } catch {
      set({ visibility: previous });
    }
  },

  /**
   * Clear on sign-out, so the next account on this browser does not inherit a
   * stranger's roster — or keep beating as them.
   */
  reset: () =>
    set({
      position: { scene: 'city', locationId: null },
      cityOnline: 0,
      hereCount: 0,
      here: [],
      connectionsOnline: [],
      visibility: 'connections',
      started: false,
    }),
}));

/**
 * People in this room the player cannot see by name.
 *
 * Not an error state and not hidden: the room says "2 others here, 1 you can
 * see" because the alternative is a count and a list that disagree with no
 * explanation. See presenceService's note on named vs counted.
 */
export const selectUnnamedHere = (state) => Math.max(0, state.hereCount - state.here.length);
