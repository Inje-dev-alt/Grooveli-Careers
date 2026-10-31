import { measureRoute, pointAtDistance } from '../world/pedestrianRoutes.js';
import { speedFactorAt } from '../world/trafficRoutes.js';

/**
 * Traffic.
 *
 * Baked for the same reason the pedestrians are: a redrawn Graphics per
 * vehicle per frame is the one thing that would make this expensive, and
 * every pose a vehicle holds is known in advance. Three types, four facings,
 * twelve textures, drawn once.
 *
 * Scenery, like the walkers — no physics body, no collision with the player.
 * A car that could run somebody over would need right of way, a horn, and a
 * conversation about what happens next; a car that drives past does the job
 * the city needs doing.
 */

const DIRECTIONS = ['down', 'up', 'left', 'right'];

/**
 * The fleet. Length and colour only — the drawing is shared, because at this
 * scale a bus is a longer car with a different roof.
 */
const TYPES = [
  { id: 'cab', body: 0xf2c14e, roof: 0xd9a92f, length: 34, width: 18 },
  { id: 'car', body: 0x3f5296, roof: 0x30407a, length: 32, width: 17 },
  { id: 'bus', body: 0xe8863f, roof: 0xc96d2c, length: 52, width: 20 },
];

const PAD = 8;
const keyFor = (type, direction) => `veh-${type}-${direction}`;

/**
 * Draw every vehicle pose into textures. Once per scene.
 *
 * @param {Phaser.Scene} scene
 * @returns {string[]} keys created, for teardown
 */
export function bakeVehicleTextures(scene) {
  const created = [];

  TYPES.forEach((type) => {
    DIRECTIONS.forEach((direction) => {
      const key = keyFor(type.id, direction);
      if (scene.textures.exists(key)) scene.textures.remove(key);

      const along = direction === 'left' || direction === 'right';
      const w = (along ? type.length : type.width) + PAD * 2;
      const h = (along ? type.width : type.length) + PAD * 2;

      const g = scene.make.graphics({ add: false });
      drawVehicle(g, type, direction, w, h);
      g.generateTexture(key, Math.ceil(w), Math.ceil(h));
      g.destroy();

      created.push(key);
    });
  });

  return created;
}

function drawVehicle(g, type, direction, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const along = direction === 'left' || direction === 'right';
  const bw = along ? type.length : type.width;
  const bh = along ? type.width : type.length;

  // Shadow first, offset down-right to match the city's single light source.
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(cx - bw / 2 + 2, cy - bh / 2 + 3, bw, bh, 5);

  g.fillStyle(type.body, 1);
  g.fillRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 5);

  // Roof panel, inset along the direction of travel so the vehicle reads as
  // pointing somewhere even when it is standing still.
  g.fillStyle(type.roof, 1);
  if (along) g.fillRoundedRect(cx - bw / 2 + 7, cy - bh / 2 + 3, bw - 16, bh - 6, 3);
  else g.fillRoundedRect(cx - bw / 2 + 3, cy - bh / 2 + 7, bw - 6, bh - 16, 3);

  // Headlights at the leading edge, tail lights behind.
  const lamp = (x, y, colour, alpha) => {
    g.fillStyle(colour, alpha);
    g.fillCircle(x, y, 2.2);
  };
  const HEAD = 0xffe9b8;
  const TAIL = 0xff6b5c;

  if (direction === 'right') {
    lamp(cx + bw / 2 - 3, cy - bh / 4, HEAD, 0.95);
    lamp(cx + bw / 2 - 3, cy + bh / 4, HEAD, 0.95);
    lamp(cx - bw / 2 + 3, cy, TAIL, 0.8);
  } else if (direction === 'left') {
    lamp(cx - bw / 2 + 3, cy - bh / 4, HEAD, 0.95);
    lamp(cx - bw / 2 + 3, cy + bh / 4, HEAD, 0.95);
    lamp(cx + bw / 2 - 3, cy, TAIL, 0.8);
  } else if (direction === 'down') {
    lamp(cx - bw / 4, cy + bh / 2 - 3, HEAD, 0.95);
    lamp(cx + bw / 4, cy + bh / 2 - 3, HEAD, 0.95);
    lamp(cx, cy - bh / 2 + 3, TAIL, 0.8);
  } else {
    lamp(cx - bw / 4, cy - bh / 2 + 3, HEAD, 0.95);
    lamp(cx + bw / 4, cy - bh / 2 + 3, HEAD, 0.95);
    lamp(cx, cy + bh / 2 - 3, TAIL, 0.8);
  }
}

/** One vehicle on one circuit. */
export class Vehicle {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x: number, y: number }[]} route
   * @param {{ type?: number, speed?: number, offset?: number, reverse?: boolean }} options
   */
  constructor(scene, route, { type = 0, speed = 110, offset = 0, reverse = false } = {}) {
    this.measured = measureRoute(route);
    this.type = TYPES[type % TYPES.length].id;
    this.cruise = speed;
    this.reverse = reverse;
    this.distance = offset;
    this.direction = 'right';

    const at = pointAtDistance(this.measured, this.distance);
    this.sprite = scene.add.image(at.x, at.y, keyFor(this.type, at.direction));
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(at.y);
  }

  /** @param {number} delta milliseconds */
  update(delta) {
    const at = pointAtDistance(this.measured, this.distance);

    // Easing off near a crossing is measured where the vehicle IS, before it
    // moves, so it slows on approach rather than after it has already passed.
    const factor = speedFactorAt(at.x, at.y);
    this.distance += this.cruise * factor * (delta / 1000) * (this.reverse ? -1 : 1);

    const next = pointAtDistance(this.measured, this.distance);
    const direction = this.reverse ? opposite(next.direction) : next.direction;

    if (direction !== this.direction) {
      this.direction = direction;
      this.sprite.setTexture(keyFor(this.type, direction));
    }

    this.sprite.setPosition(next.x, next.y);
    this.sprite.setDepth(next.y);
  }

  destroy() {
    this.sprite.destroy();
  }
}

const opposite = (direction) =>
  ({ up: 'down', down: 'up', left: 'right', right: 'left' })[direction] ?? direction;

export const VEHICLE_TYPES = TYPES.length;
