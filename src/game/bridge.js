/**
 * The seam between the game world and the application interface.
 *
 * Phaser never imports a React component and React never reaches into a scene.
 * Shared state travels through the stores; one-off commands and requests travel
 * through this emitter. That keeps the renderer replaceable — a future 3D world
 * only has to speak the same small vocabulary.
 */
export const GAME_EVENTS = {
  /** Phaser → app */
  WORLD_READY: 'world:ready',
  REQUEST_INTERACTION: 'world:request-interaction',
  PLAYER_ENTERED_REGION: 'world:region-entered',

  /** App → Phaser */
  COMMAND_PAUSE: 'cmd:pause',
  COMMAND_RESUME: 'cmd:resume',
  COMMAND_SET_AXIS: 'cmd:set-axis',
  COMMAND_FOCUS_LOCATION: 'cmd:focus-location',
  COMMAND_RELEASE_KEYS: 'cmd:release-keys',
};

function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => this.off(event, handler);
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler);
    },
    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      // Copy before iterating: a handler may unsubscribe itself.
      [...handlers].forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[grooveli] listener for "${event}" threw`, error);
        }
      });
    },
    clear() {
      listeners.clear();
    },
  };
}

export const gameBridge = createEmitter();
