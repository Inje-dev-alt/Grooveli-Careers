import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameBridge, GAME_EVENTS } from '../game/bridge.js';
import { useUiStore } from '../stores/uiStore.js';
import { resolveAnyPlace } from '../game/world/places.js';
import { resolveInteractions } from '../components/locations/interactionRegistry.jsx';

/**
 * Connects the world's interaction requests to the interface.
 *
 * The scene says "the player acted on X"; this decides that X opens a location
 * panel. Keeping the decision here is what lets the same scene code drive a
 * different interface later.
 */
export function useWorldInteractions() {
  const navigate = useNavigate();

  useEffect(() => {
    const off = gameBridge.on(GAME_EVENTS.REQUEST_INTERACTION, ({ locationId }) => {
      const ui = useUiStore.getState();
      // Ignore a second request while a panel is already open — pressing E
      // through an open panel should do nothing.
      if (ui.modalStack.length > 0) return;

      /*
       * An object that declares `direct` and offers exactly one thing goes
       * straight to it. A panel whose only content is one button repeating the
       * object's own name is a step that tells the player nothing, and the
       * meeting table is the clearest case: the reason to walk up to it is to
       * see who else is in the room.
       *
       * The `length === 1` guard is the safety. If such an object ever grows a
       * second interaction, it quietly goes back to showing the panel rather
       * than silently picking one of them.
       */
      const place = resolveAnyPlace(locationId);
      const actions = place?.direct ? resolveInteractions(place.interactions) : [];
      if (actions.length === 1) {
        actions[0].open({
          location: place,
          openModal: ui.openModal,
          // Nothing is open to replace, so a hand-off becomes an open.
          replaceModal: ui.openModal,
          closeAllModals: ui.closeAllModals,
          navigate,
        });
        return;
      }

      ui.openModal('location', { locationId });
    });
    return off;
  }, [navigate]);
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
