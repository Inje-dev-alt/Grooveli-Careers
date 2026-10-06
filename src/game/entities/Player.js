import Phaser from 'phaser';
import { GAME_SETTINGS } from '../config.js';
import { usePlayerStore } from '../../stores/playerStore.js';

/**
 * The player avatar.
 *
 * Drawn procedurally rather than from a sprite sheet: the city has its own
 * visual identity and no borrowed assets, and a vector avatar stays crisp at
 * any zoom. The shapes are deliberately simple — a professional silhouette, not
 * a character creator.
 *
 * Rendering lives here; the authoritative player state lives in `playerStore`.
 * This class writes to the store (throttled) and never reads UI state.
 */
const COLORS = {
  shadow: 0x05080f,
  suit: 0x2b3a63,
  suitDark: 0x22304f,
  shirt: 0xe7eefc,
  accent: 0x5be3c8,
  skin: 0xc98a5e,
  hair: 0x201a18,
  shoe: 0x161c2c,
};

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

    this.shadow = scene.add.ellipse(0, 14, 34, 14, COLORS.shadow, 0.42);
    this.legs = scene.add.graphics();
    this.body = scene.add.graphics();
    this.head = scene.add.graphics();

    this.container.add([this.shadow, this.legs, this.body, this.head]);

    scene.physics.add.existing(this.container);
    /** @type {Phaser.Physics.Arcade.Body} */
    this.physicsBody = this.container.body;
    this.physicsBody.setCircle(GAME_SETTINGS.playerRadius, -GAME_SETTINGS.playerRadius, -GAME_SETTINGS.playerRadius + 6);
    this.physicsBody.setCollideWorldBounds(true);
    // Velocity is set explicitly every frame, so the body needs no drag or
    // damping — adding either only fights the controller.

    this.drawBody();
    this.drawHead();
  }

  get x() {
    return this.container.x;
  }

  get y() {
    return this.container.y;
  }

  drawBody() {
    const g = this.body;
    g.clear();

    const facingSide = this.direction === 'left' || this.direction === 'right';
    const width = facingSide ? 20 : 26;

    // Jacket
    g.fillStyle(COLORS.suit, 1);
    g.fillRoundedRect(-width / 2, -10, width, 24, 6);
    // Shaded side for a hint of volume
    g.fillStyle(COLORS.suitDark, 1);
    g.fillRoundedRect(width / 2 - 5, -10, 5, 24, { tl: 0, tr: 6, bl: 0, br: 6 });

    if (this.direction === 'down') {
      // Shirt and collar
      g.fillStyle(COLORS.shirt, 1);
      g.fillTriangle(-4, -10, 4, -10, 0, 2);
      g.fillStyle(COLORS.accent, 1);
      g.fillRect(-1.5, -8, 3, 9);
    }

    // Shoulder line
    g.lineStyle(1, 0x3c4f80, 0.8);
    g.strokeRoundedRect(-width / 2, -10, width, 24, 6);
  }

  drawHead() {
    const g = this.head;
    g.clear();

    const offsetX = this.direction === 'left' ? -2 : this.direction === 'right' ? 2 : 0;

    // Neck
    g.fillStyle(COLORS.skin, 1);
    g.fillRect(-3 + offsetX, -14, 6, 5);

    // Head
    g.fillStyle(COLORS.skin, 1);
    g.fillCircle(offsetX, -20, 9);

    // Hair — shaped by facing so the avatar reads as turned around
    g.fillStyle(COLORS.hair, 1);
    if (this.direction === 'up') {
      g.fillCircle(offsetX, -21, 9);
    } else {
      g.slice(offsetX, -20, 9, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
      g.fillPath();
    }

    if (this.direction === 'down') {
      g.fillStyle(0x2a2320, 1);
      g.fillCircle(-3.2, -20.5, 1.2);
      g.fillCircle(3.2, -20.5, 1.2);
    } else if (this.direction === 'left' || this.direction === 'right') {
      g.fillStyle(0x2a2320, 1);
      g.fillCircle(offsetX + (this.direction === 'right' ? 3 : -3), -20.5, 1.2);
    }
  }

  drawLegs() {
    const g = this.legs;
    g.clear();

    const swing = this.animationState === 'walking' ? Math.sin(this.walkPhase) * 4.5 : 0;
    g.fillStyle(COLORS.shoe, 1);

    if (this.direction === 'left' || this.direction === 'right') {
      g.fillRoundedRect(-4 + swing, 12, 8, 9, 3);
      g.fillRoundedRect(-4 - swing, 12, 8, 9, 3);
    } else {
      g.fillRoundedRect(-9, 12 + swing * 0.5, 8, 9, 3);
      g.fillRoundedRect(1, 12 - swing * 0.5, 8, 9, 3);
    }
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

    if (directionChanged) {
      this.drawBody();
      this.drawHead();
    }

    if (moving) {
      this.walkPhase += delta * 0.014;
      this.container.y += 0; // position is driven by physics
      this.head.y = Math.sin(this.walkPhase * 2) * 0.8;
      this.body.y = Math.sin(this.walkPhase * 2) * 0.6;
    } else if (stateChanged) {
      this.walkPhase = 0;
      this.head.y = 0;
      this.body.y = 0;
    }

    this.drawLegs();
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
