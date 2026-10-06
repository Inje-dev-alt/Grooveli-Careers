import Phaser from 'phaser';
import { WORLD } from './world/locations.js';

/**
 * Phaser configuration.
 *
 * Arcade physics only — the world is top-down with rectangular footprints, and
 * anything heavier would cost frames for no gain. The canvas scales to its
 * container rather than the window so the world can sit inside the app shell.
 */
export const GAME_SETTINGS = {
  playerSpeed: 260,
  playerRadius: 17,
  /** How close the player must be to a building before the [E] prompt appears. */
  interactionPadding: 58,
  cameraLerp: 0.1,
  cameraZoom: { desktop: 1, compact: 0.74 },
  /** Store writes are throttled to this interval; the HUD does not need 60fps. */
  transformSyncMs: 90,
};

/**
 * @param {{ parent: HTMLElement, scenes: Phaser.Scene[], compact: boolean }} options
 * @returns {Phaser.Types.Core.GameConfig}
 */
export function createGameConfig({ parent, scenes }) {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#070a14',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
        // Step with the real frame delta rather than a fixed 1/60 budget.
        // Fixed stepping drops movement on any frame the browser renders
        // slower than 60fps, which makes the avatar crawl on modest hardware.
        fixedStep: false,
      },
    },
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    // Phaser's own keyboard capture would swallow keys the interface needs.
    input: { keyboard: true, gamepad: false },
    scene: scenes,
    bounds: WORLD,
  };
}
