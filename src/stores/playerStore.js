import { create } from 'zustand';

/**
 * The player as data, kept separate from how the player is drawn.
 *
 * Phaser writes position and facing here each frame-ish (throttled by the
 * entity, not every tick), and React reads whatever it needs for the HUD. The
 * renderer could be replaced wholesale without touching this file.
 */
export const usePlayerStore = create((set, get) => ({
  position: { x: 0, y: 0 },
  /** @type {'up' | 'down' | 'left' | 'right'} */
  direction: 'down',
  /** @type {'idle' | 'walking'} */
  animationState: 'idle',

  /** Where the player currently is — the district they are standing in. */
  currentLocationId: null,
  /** The interactable in range, if any. Drives the [E] prompt. */
  nearbyLocationId: null,
  /** The location the player has entered. Null while walking around. */
  activeLocationId: null,
  /** @type {'free' | 'prompt' | 'engaged'} */
  interactionState: 'free',

  /** @type {string[]} every district the player has entered this session */
  visitedLocationIds: [],

  /**
   * Where the player should appear the next time the city loads.
   *
   * Leaving a building is a route change, so the scene is destroyed and built
   * again — an event emitted at the moment of leaving has nothing listening
   * for it yet. A slot survives the gap: the interior sets it on the way out,
   * `CityScene.create()` reads it, and clears it.
   *
   * Null means the ordinary entrance, the plaza.
   *
   * @type {{ districtId: string } | null}
   */
  arriveAt: null,

  /**
   * Come back to this district's doorway rather than to the plaza.
   *
   * Takes a district id and nothing else. The plan called for a `spawnKey`
   * alongside it, but a district has one position and one size — there are no
   * named doors to key on yet. The field is left out rather than left empty,
   * because an unused field is an invitation to fill it with something
   * arbitrary; it can be added when buildings have more than one way in.
   */
  setArrival: (districtId) => set({ arriveAt: districtId ? { districtId } : null }),

  /**
   * Read the pending arrival and clear it in one step.
   *
   * Read-and-clear together so a second city load cannot reuse a stale
   * arrival — walk out of an office, then later open the city from a menu,
   * and you should start where the city starts.
   */
  takeArrival: () => {
    const { arriveAt } = get();
    if (arriveAt) set({ arriveAt: null });
    return arriveAt;
  },

  setTransform: ({ x, y, direction, animationState }) =>
    set((state) => {
      const next = {};
      if (x !== undefined && y !== undefined) {
        // Avoid re-rendering the HUD for sub-pixel movement.
        if (Math.abs(x - state.position.x) > 0.5 || Math.abs(y - state.position.y) > 0.5) {
          next.position = { x, y };
        }
      }
      if (direction && direction !== state.direction) next.direction = direction;
      if (animationState && animationState !== state.animationState) next.animationState = animationState;
      return next;
    }),

  setCurrentLocation: (currentLocationId) =>
    set((state) => (state.currentLocationId === currentLocationId ? {} : { currentLocationId })),

  setNearbyLocation: (nearbyLocationId) =>
    set((state) => {
      if (state.nearbyLocationId === nearbyLocationId) return {};
      return {
        nearbyLocationId,
        interactionState: state.activeLocationId ? 'engaged' : nearbyLocationId ? 'prompt' : 'free',
      };
    }),

  enterLocation: (locationId) =>
    set((state) => ({
      activeLocationId: locationId,
      interactionState: 'engaged',
      visitedLocationIds: state.visitedLocationIds.includes(locationId)
        ? state.visitedLocationIds
        : [...state.visitedLocationIds, locationId],
    })),

  exitLocation: () =>
    set((state) => ({
      activeLocationId: null,
      interactionState: state.nearbyLocationId ? 'prompt' : 'free',
    })),

  hasVisited: (locationId) => get().visitedLocationIds.includes(locationId),

  /**
   * Clear on sign-out.
   *
   * `visitedLocationIds` is the one that matters: `hasVisited` decides
   * whether entering a district counts as a discovery worth XP, so carrying
   * it across accounts would deny a new player the discovery events for every
   * district the last person on this browser had already walked into.
   * `arriveAt` matters too, in a smaller way — nobody should spawn at a door
   * a stranger walked out of.
   */
  reset: () =>
    set({
      position: { x: 0, y: 0 },
      direction: 'down',
      animationState: 'idle',
      currentLocationId: null,
      nearbyLocationId: null,
      activeLocationId: null,
      interactionState: 'free',
      visitedLocationIds: [],
      arriveAt: null,
    }),
}));
