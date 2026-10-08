import './hud.css';
import { gameBridge, GAME_EVENTS } from '../../game/bridge.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { getLocation } from '../../game/world/locations.js';
import { getApartmentObject } from '../../game/world/apartment.js';

/**
 * The [E] ENTER prompt.
 *
 * Appears whenever the player is in range of anything interactable, in the city
 * or the apartment. Clicking it does the same thing as pressing E, so the
 * prompt works on touch without a separate code path.
 */
export function InteractionPrompt({ scene = 'city' }) {
  const nearbyLocationId = usePlayerStore((s) => s.nearbyLocationId);
  const modalOpen = useUiStore((s) => s.modalStack.length > 0);
  const menuOpen = useUiStore((s) => s.menuOpen);

  if (!nearbyLocationId || modalOpen || menuOpen) return null;

  const target =
    scene === 'apartment' ? getApartmentObject(nearbyLocationId) : getLocation(nearbyLocationId);
  if (!target) return null;

  const trigger = () =>
    gameBridge.emit(GAME_EVENTS.REQUEST_INTERACTION, { locationId: nearbyLocationId });

  return (
    <button type="button" className="hud-prompt" onClick={trigger}>
      <span className="hud-prompt__name">{target.name}</span>
      <span className="hud-prompt__key">E</span>
    </button>
  );
}
