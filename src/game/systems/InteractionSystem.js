import { gameBridge, GAME_EVENTS } from '../bridge.js';
import { GAME_SETTINGS } from '../config.js';
import { usePlayerStore } from '../../stores/playerStore.js';

/**
 * One interaction system for every interactable in the game.
 *
 * Buildings, apartment objects and anything added later register a zone and an
 * id. The system works out what the player is standing next to and raises a
 * single request when they act on it. It has no idea what a Tech Hub is — that
 * is the interaction registry's job, on the interface side.
 */
export class InteractionSystem {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {{ id: string, x: number, y: number, halfWidth: number, halfHeight: number }[]} */
    this.zones = [];
    this.nearbyId = null;
  }

  /**
   * @param {{ id: string, x: number, y: number, width: number, height: number, padding?: number }} zone
   */
  register(zone) {
    const padding = zone.padding ?? GAME_SETTINGS.interactionPadding;
    this.zones.push({
      id: zone.id,
      x: zone.x,
      y: zone.y,
      halfWidth: zone.width / 2 + padding,
      halfHeight: zone.height / 2 + padding,
    });
  }

  clear() {
    this.zones = [];
    this.nearbyId = null;
    usePlayerStore.getState().setNearbyLocation(null);
  }

  /**
   * @param {{ x: number, y: number }} player
   * @returns {string | null} the id of the closest zone in range
   */
  findNearest(player) {
    let best = null;
    let bestDistance = Infinity;

    for (const zone of this.zones) {
      const dx = Math.abs(player.x - zone.x);
      const dy = Math.abs(player.y - zone.y);
      if (dx > zone.halfWidth || dy > zone.halfHeight) continue;

      // Closest by centre distance, so overlapping zones resolve predictably.
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = zone.id;
      }
    }

    return best;
  }

  /** @param {{ x: number, y: number }} player */
  update(player) {
    const nearbyId = this.findNearest(player);
    if (nearbyId === this.nearbyId) return;
    this.nearbyId = nearbyId;
    usePlayerStore.getState().setNearbyLocation(nearbyId);
  }

  /** Raise the interaction the player is standing next to, if any. */
  trigger() {
    if (!this.nearbyId) return false;
    gameBridge.emit(GAME_EVENTS.REQUEST_INTERACTION, { locationId: this.nearbyId });
    return true;
  }
}
