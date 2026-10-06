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

  reset: () =>
    set({
      position: { x: 0, y: 0 },
      direction: 'down',
      animationState: 'idle',
      currentLocationId: null,
      nearbyLocationId: null,
      activeLocationId: null,
      interactionState: 'free',
    }),
}));
