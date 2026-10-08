import { useEffect } from 'react';
import { gameBridge, GAME_EVENTS } from '../game/bridge.js';
import { useUiStore } from '../stores/uiStore.js';

/**
 * Connects the world's interaction requests to the interface.
 *
 * The scene says "the player acted on X"; this decides that X opens a location
 * panel. Keeping the decision here is what lets the same scene code drive a
 * different interface later.
 */
export function useWorldInteractions() {
  useEffect(() => {
    const off = gameBridge.on(GAME_EVENTS.REQUEST_INTERACTION, ({ locationId }) => {
      const ui = useUiStore.getState();
      // Ignore a second request while a panel is already open — pressing E
      // through an open panel should do nothing.
      if (ui.modalStack.length > 0) return;
      ui.openModal('location', { locationId });
    });
    return off;
  }, []);
}

/**
 * While a world route is mounted the page must not scroll and the body must not
 * rubber-band on touch. Reverted on unmount so the ordinary routes behave
 * normally.
 */
export function useWorldViewport(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    document.body.dataset.worldActive = 'true';
    return () => {
      delete document.body.dataset.worldActive;
    };
  }, [active]);
}
