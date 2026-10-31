import { measureRoute, pointAtDistance } from '../world/pedestrianRoutes.js';

/**
 * Ambient people, walking the pavements.
 *
 * WHY THESE ARE BAKED AND THE PLAYER IS NOT. `Player.update()` clears and
 * redraws a Graphics object every frame for its walk cycle. That is fine for
 * one of them and ruinous for twenty, because Phaser re-tessellates a Graphics
 * on every change. So every pose a pedestrian can hold is drawn once into a
 * texture at scene start — six palettes, four facings, two steps — and after
 * that a walker is a Sprite that swaps frames. Twenty of them cost roughly
 * what the single player costs today.
 *
 * `CityRenderer` already bakes building facades the same way, so this is the
 * established pattern here rather than a new one.
 *
 * These are SCENERY. No physics body, no collision, no store writes, nothing
 * on the network, and deliberately no nameplate — a label is what marks a real
 * person, and the moment ambient walkers carry one the crowd becomes a lie.
 */

const DIRECTIONS = ['down', 'up', 'left', 'right'];
const STEPS = 2;

/** Coat, trousers, skin and hair, varied enough that a crowd is not a uniform. */
const PALETTES = [
  { coat: 0x3f5296, trouser: 0x232c4a, skin: 0xf0c9a4, hair: 0x2a2320 },
  { coat: 0x5c4a8f, trouser: 0x272142, skin: 0x8d5a3b, hair: 0x191310 },
  { coat: 0x2f6f63, trouser: 0x1d3a36, skin: 0x6b4027, hair: 0x120d0a },
  { coat: 0x8f4a63, trouser: 0x3a2231, skin: 0xe8b98f, hair: 0x3a2a1c },
  { coat: 0x8a5f2e, trouser: 0x3b2a16, skin: 0x4a2d1c, hair: 0x0f0b08 },
  { coat: 0x4d6f3f, trouser: 0x24341d, skin: 0xc98a5e, hair: 0x241a12 },
];

/** Texture box. Generous enough that no pose clips its own edge. */
const TEX_W = 26;
const TEX_H = 40;
const FOOT_Y = 36;

const keyFor = (palette, direction, step) => `ped-${palette}-${direction}-${step}`;

/**
 * Draw every pose into textures. Called once per scene.
 *
 * Cheap enough not to need measuring — 48 small canvases — and the result is
 * reused for the life of the scene.
 *
 * @param {Phaser.Scene} scene
 * @returns {string[]} the keys created, for teardown
 */
export function bakePedestrianTextures(scene) {
  const created = [];

  PALETTES.forEach((palette, index) => {
    DIRECTIONS.forEach((direction) => {
      for (let step = 0; step < STEPS; step += 1) {
        const key = keyFor(index, direction, step);
        if (scene.textures.exists(key)) scene.textures.remove(key);

        const g = scene.make.graphics({ add: false });
        drawPerson(g, palette, direction, step);
        g.generateTexture(key, TEX_W, TEX_H);
        g.destroy();

        created.push(key);
      }
    });
  });

  return created;
}

/** One pose, in texture coordinates with the feet at FOOT_Y. */
function drawPerson(g, palette, direction, step) {
  const cx = TEX_W / 2;
  const side = direction === 'left' || direction === 'right';
  const bodyW = side ? 9 : 12;

  // Legs. The two steps are mirrored, which is a walk cycle at this size.
  const swing = step === 0 ? 2 : -2;
  g.fillStyle(palette.trouser, 1);
  g.fillRoundedRect(cx - bodyW / 2 + 1, FOOT_Y - 11, 4, 11 + swing, 2);
  g.fillRoundedRect(cx + bodyW / 2 - 5, FOOT_Y - 11, 4, 11 - swing, 2);

  // Coat.
  g.fillStyle(palette.coat, 1);
  g.fillRoundedRect(cx - bodyW / 2, FOOT_Y - 22, bodyW, 13, 3);

  // Head, with the hair shaped by facing so a turned walker reads as turned.
  const headY = FOOT_Y - 27;
  g.fillStyle(palette.skin, 1);
  g.fillCircle(cx, headY, 5);
  g.fillStyle(palette.hair, 1);
  if (direction === 'up') {
    g.fillCircle(cx, headY - 0.5, 5);
  } else {
    g.fillRect(cx - 5, headY - 5, 10, 4);
  }

  // A shadow, so the figure stands on the pavement rather than floating.
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(cx, FOOT_Y + 1, 11, 3.5);
}

/**
 * One walker on one loop.
 *
 * Holds a distance travelled rather than a waypoint index, so wrapping is
 * arithmetic and a walker can be started anywhere on its route by handing it
 * an offset.
 */
export class Pedestrian {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x: number, y: number }[]} route
   * @param {{ palette?: number, speed?: number, offset?: number, reverse?: boolean }} options
   */
  constructor(scene, route, { palette = 0, speed = 46, offset = 0, reverse = false } = {}) {
    this.measured = measureRoute(route);
    this.palette = palette % PALETTES.length;
    this.speed = speed;
    this.reverse = reverse;
    this.distance = offset;
    this.phase = Math.random() * 1000;
    this.direction = 'down';
    this.step = 0;

    const at = pointAtDistance(this.measured, this.distance);
    this.sprite = scene.add.image(at.x, at.y, keyFor(this.palette, at.direction, 0));
    // Feet on the ground: the origin sits where the shadow is, so depth
    // sorting against buildings uses the point the walker is standing on.
    this.sprite.setOrigin(0.5, FOOT_Y / TEX_H);
    this.sprite.setDepth(at.y);
  }

  /** @param {number} delta milliseconds since the last frame */
  update(delta) {
    const seconds = delta / 1000;
    this.distance += this.speed * seconds * (this.reverse ? -1 : 1);
    this.phase += this.speed * seconds;

    const at = pointAtDistance(this.measured, this.distance);
    // Reversing means walking the loop backwards, so the facing is too.
    const direction = this.reverse ? opposite(at.direction) : at.direction;
    // One step per 18 pixels travelled: tied to distance rather than time, so
    // a slow walker does not moonwalk.
    const step = Math.floor(this.phase / 18) % STEPS;

    if (direction !== this.direction || step !== this.step) {
      this.direction = direction;
      this.step = step;
      this.sprite.setTexture(keyFor(this.palette, direction, step));
    }

    this.sprite.setPosition(at.x, at.y);
    this.sprite.setDepth(at.y);
  }

  destroy() {
    this.sprite.destroy();
  }
}

const opposite = (direction) =>
  ({ up: 'down', down: 'up', left: 'right', right: 'left' })[direction] ?? direction;

export const PEDESTRIAN_PALETTES = PALETTES.length;
