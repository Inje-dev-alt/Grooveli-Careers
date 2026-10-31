import Phaser from 'phaser';
import { GAME_SETTINGS } from '../config.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { CHARACTER_PALETTES, drawCharacter } from './characterArt.js';

/**
 * The player avatar.
 *
 * Drawn procedurally rather than from a sprite sheet: the city has its own
 * visual identity and no borrowed assets, and a vector avatar stays crisp at
 * any zoom.
 *
 * The drawing itself lives in `characterArt.js`, which also draws the crowd.
 * That is deliberate — when the two had their own painters the avatar ended up
 * twice the height of the pedestrians it walked past. Sharing the painter means
 * the player is visibly one of the people in the city rather than a different
 * species.
 *
 * Rendering lives here; the authoritative player state lives in `playerStore`.
 * This class writes to the store (throttled) and never reads UI state.
 */

/** The player wears the navy suit; the crowd gets the rest of the wardrobe. */
const PLAYER_PALETTE = CHARACTER_PALETTES[0];

export class Player {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    this.scene = scene;
    this.direction = 'down';
    this.animationState = 'idle';
    this.walkPhase = 0;
    this.lastSync = 0;

    this.container = scene.add.container(x, y);
    this.container.setDepth(0); // depth is sorted per-frame against buildings

    // One Graphics object for the whole figure. The walk cycle moves the legs,
    // the arms and the body's bob together, so splitting them across objects
    // only made it harder to keep them in step.
    this.art = scene.add.graphics();
    this.container.add([this.art]);

    scene.physics.add.existing(this.container);
    /** @type {Phaser.Physics.Arcade.Body} */
    this.physicsBody = this.container.body;
    this.physicsBody.setCircle(GAME_SETTINGS.playerRadius, -GAME_SETTINGS.playerRadius, -GAME_SETTINGS.playerRadius + 6);
    this.physicsBody.setCollideWorldBounds(true);
    // Velocity is set explicitly every frame, so the body needs no drag or
    // damping — adding either only fights the controller.

    this.redraw();
  }

  get x() {
    return this.container.x;
  }

  get y() {
    return this.container.y;
  }

  /**
   * Redraw the figure in its current pose.
   *
   * About thirty fill commands, which is cheap enough to run every frame while
   * walking — the previous implementation already redrew the legs that often.
   */
  redraw() {
    drawCharacter(this.art, {
      palette: PLAYER_PALETTE,
      direction: this.direction,
      phase: this.walkPhase,
      moving: this.animationState === 'walking',
    });
  }

  /**
   * @param {{ x: number, y: number }} axis normalised input, -1..1 on each axis
   * @param {number} delta ms since last frame
   */
  update(axis, delta) {
    const speed = GAME_SETTINGS.playerSpeed;
    const vector = new Phaser.Math.Vector2(axis.x, axis.y);
    if (vector.lengthSq() > 1) vector.normalize();

    this.physicsBody.setVelocity(vector.x * speed, vector.y * speed);

    const moving = vector.lengthSq() > 0.02;
    const nextState = moving ? 'walking' : 'idle';

    let nextDirection = this.direction;
    if (moving) {
      // Favour the dominant axis so diagonal movement picks a stable facing.
      nextDirection =
        Math.abs(vector.x) > Math.abs(vector.y)
          ? vector.x > 0 ? 'right' : 'left'
          : vector.y > 0 ? 'down' : 'up';
    }

    const directionChanged = nextDirection !== this.direction;
    const stateChanged = nextState !== this.animationState;
    this.direction = nextDirection;
    this.animationState = nextState;

    if (moving) this.walkPhase += delta * 0.011;
    else if (stateChanged) this.walkPhase = 0;

    // Idle costs one redraw when something changes; walking costs one a frame.
    if (moving || directionChanged || stateChanged) this.redraw();

    this.syncStore(directionChanged || stateChanged);
  }

  /** Push transform into the store, throttled — the HUD does not need 60fps. */
  syncStore(force) {
    const now = this.scene.time.now;
    if (!force && now - this.lastSync < GAME_SETTINGS.transformSyncMs) return;
    this.lastSync = now;
    usePlayerStore.getState().setTransform({
      x: Math.round(this.container.x),
      y: Math.round(this.container.y),
      direction: this.direction,
      animationState: this.animationState,
    });
  }

  setPosition(x, y) {
    this.container.setPosition(x, y);
    this.physicsBody.reset(x, y);
    this.syncStore(true);
  }

  destroy() {
    this.container.destroy(true);
  }
}
