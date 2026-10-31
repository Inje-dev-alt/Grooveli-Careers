import Phaser from 'phaser';
import { roads, approaches } from './cityLayout.js';
import { cityLocations } from './locations.js';
import { createRandom } from './platePainter.js';
import { CHARACTER, CHARACTER_PALETTES, drawCharacter } from '../entities/characterArt.js';

/**
 * Ambient life: traffic on the roads, people on the pavements.
 *
 * None of it is interactive and none of it collides. It exists because an empty
 * city reads as a diagram — the single biggest gap between the static plate and
 * the concept art was that nothing in the concept art was standing still.
 *
 * Everything here is a sprite drawn from one of a handful of baked textures and
 * moved by arithmetic. There is no physics body, no pathfinding and no
 * per-frame allocation, so the whole layer costs a few hundred microseconds a
 * tick. Actors outside the camera are culled by Phaser automatically.
 */

/** Lane offsets as a fraction of road width, and the direction each runs. */
const LANES = [
  { offset: 0.29, direction: 1 },
  { offset: 0.71, direction: -1 },
];

const CAR_COLOURS = [0xf0f4ff, 0x4b6ef5, 0xffd166, 0xef5f5f, 0x2bd4a8, 0x8d6bff, 0x9fb2d8];

/**
 * The player wears palette 0, so the crowd draws from the rest. Someone
 * wearing the player's exact suit standing still is read as the avatar, and
 * the player then spends a moment working out which figure they are driving.
 */
const CROWD_PALETTES = CHARACTER_PALETTES.map((_, index) => index).slice(1);

/** Frames in the walk cycle. Two are enough at the distance the camera sits. */
const WALK_PHASES = { a: Math.PI / 2, b: (Math.PI * 3) / 2 };

/**
 * Cars, spaced along every carriageway.
 *
 * Approaches are deliberately excluded — they are promenades, and the whole
 * reason they stopped being roads is that people walk on them.
 */
export function generateTraffic(random) {
  const cars = [];

  roads.forEach((road, roadIndex) => {
    const horizontal = road.orientation === 'h';
    const length = horizontal ? road.width : road.height;
    const count = Math.max(2, Math.round(length / 420));

    LANES.forEach((lane, laneIndex) => {
      for (let i = 0; i < count; i += 1) {
        // Spread along the lane with a little jitter, so the traffic does not
        // move as one rigidly spaced convoy.
        const t = (i + random() * 0.7) / count;
        const along = (horizontal ? road.x : road.y) + t * length;
        const across = (horizontal ? road.y : road.x) + lane.offset * (horizontal ? road.height : road.width);

        cars.push({
          horizontal,
          direction: lane.direction,
          x: horizontal ? along : across,
          y: horizontal ? across : along,
          min: horizontal ? road.x : road.y,
          max: horizontal ? road.x + road.width : road.y + road.height,
          speed: 52 + random() * 46,
          colour: CAR_COLOURS[Math.floor(random() * CAR_COLOURS.length)],
          key: `amb-car-${(roadIndex * 2 + laneIndex + i) % CAR_COLOURS.length}`,
        });
      }
    });
  });

  return cars;
}

/**
 * Pedestrians on the pavements beside each road, and on the approaches.
 *
 * Each walks a straight segment and turns around at the end, which is enough
 * motion to carry the illusion at the distance the camera sits. Giving them
 * routes would cost pathfinding and buy nothing the player can see.
 */
export function generateCrowd(random) {
  const people = [];

  const addWalker = (x, y, horizontal, min, max) => {
    people.push({
      horizontal,
      x,
      y,
      min,
      max,
      direction: random() < 0.5 ? 1 : -1,
      speed: 17 + random() * 16,
      // Phase keeps the whole crowd from stepping in lockstep.
      phase: random() * Math.PI * 2,
      palette: CROWD_PALETTES[Math.floor(random() * CROWD_PALETTES.length)],
      facing: null,
      frame: null,
    });
  };

  roads.forEach((road) => {
    const horizontal = road.orientation === 'h';
    const length = horizontal ? road.width : road.height;
    const count = Math.max(2, Math.round(length / 330));

    [-20, (horizontal ? road.height : road.width) + 20].forEach((edge) => {
      for (let i = 0; i < count; i += 1) {
        const t = (i + random() * 0.8) / count;
        const along = (horizontal ? road.x : road.y) + t * length;
        const across = (horizontal ? road.y : road.x) + edge;
        if (horizontal) addWalker(along, across, true, road.x + 20, road.x + road.width - 20);
        else addWalker(across, along, false, road.y + 20, road.y + road.height - 20);
      }
    });
  });

  approaches.forEach((way) => {
    const vertical = way.orientation === 'v';
    const count = 4;
    for (let i = 0; i < count; i += 1) {
      const t = (i + random() * 0.8) / count;
      if (vertical) {
        addWalker(way.x + 26 + random() * (way.width - 52), way.y + t * way.height, false, way.y + 16, way.y + way.height - 16);
      } else {
        addWalker(way.x + t * way.width, way.y + 26 + random() * (way.height - 52), true, way.x + 16, way.x + way.width - 16);
      }
    }
  });

  return people;
}

/**
 * People standing still: pairs in conversation on the plaza, and a few
 * loitering beside each district entrance.
 *
 * A crowd that is entirely in transit reads as a conveyor belt. Pairs facing
 * each other are what make a square look like somewhere people choose to be,
 * and they cost nothing — a standing figure is one sprite that never updates.
 */
export function generateGatherings(random) {
  const standing = [];
  const pick = () => CROWD_PALETTES[Math.floor(random() * CROWD_PALETTES.length)];

  const addPair = (x, y) => {
    // Turned toward each other, and offset slightly in Y so the depth sort
    // puts one in front rather than leaving them to z-fight.
    standing.push({ x: x - 11, y: y + 2, facing: 'right', palette: pick() });
    standing.push({ x: x + 11, y: y - 2, facing: 'left', palette: pick() });
  };

  cityLocations
    .filter((location) => location.walkable)
    .forEach((plaza) => {
      const insetX = plaza.size.width * 0.33;
      const insetY = plaza.size.height * 0.29;
      addPair(plaza.position.x - insetX, plaza.position.y - insetY);
      addPair(plaza.position.x - insetX, plaza.position.y + insetY);
      standing.push({ x: plaza.position.x + insetX, y: plaza.position.y - insetY, facing: 'down', palette: pick() });
      standing.push({ x: plaza.position.x + insetX, y: plaza.position.y + insetY, facing: 'down', palette: pick() });
    });

  cityLocations
    .filter((location) => !location.walkable && location.id !== 'player-apartment')
    .forEach((location) => {
      // Beside the doors rather than across them, so nobody appears to be
      // blocking the entrance the player is being invited to walk into.
      const y = location.position.y + location.size.height / 2 + 26;
      const offset = location.size.width * 0.3;
      standing.push({ x: location.position.x - offset, y, facing: 'down', palette: pick() });
      if (random() < 0.6) {
        standing.push({ x: location.position.x + offset, y: y + 6, facing: 'left', palette: pick() });
      }
    });

  return standing;
}

/**
 * Creates the sprites and moves them.
 *
 * Car and person textures are baked once per scene and shared: a hundred
 * actors draw from a few dozen textures, so the whole layer batches into a
 * handful of draw calls. Person textures are baked on demand — only the
 * combinations of outfit, facing and step that actually appear get made.
 */
export class AmbientLayer {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.textureKeys = new Set();
    this.cars = [];
    this.people = [];
    this.standing = [];
    this.carSprites = [];
    this.personSprites = [];
    this.standingSprites = [];
  }

  create() {
    const random = createRandom(20261101);
    this.bakeCarTextures();

    this.cars = generateTraffic(random);
    this.people = generateCrowd(random);
    this.standing = generateGatherings(random);

    this.carSprites = this.cars.map((car) => {
      const sprite = this.scene.add.image(car.x, car.y, car.key);
      sprite.setRotation(car.horizontal ? 0 : Math.PI / 2);
      // Vehicles sort against the player and the buildings by world Y, exactly
      // as the avatar does, so you can walk in front of a car and behind a bus.
      sprite.setDepth(car.y);
      return sprite;
    });

    this.personSprites = this.people.map((person) => {
      person.facing = this.facingFor(person);
      person.frame = 'a';
      const sprite = this.scene.add.image(person.x, person.y, this.personTexture(person.palette, person.facing, 'a'));
      sprite.setOrigin(CHARACTER.originX, CHARACTER.originY);
      sprite.setDepth(person.y);
      return sprite;
    });

    // Standing figures never update, so they need no bookkeeping beyond this.
    this.standing.forEach((person) => {
      const sprite = this.scene.add.image(person.x, person.y, this.personTexture(person.palette, person.facing, 'idle'));
      sprite.setOrigin(CHARACTER.originX, CHARACTER.originY);
      sprite.setDepth(person.y);
      this.standingSprites.push(sprite);
    });
  }

  facingFor(person) {
    if (person.horizontal) return person.direction > 0 ? 'right' : 'left';
    return person.direction > 0 ? 'down' : 'up';
  }

  /**
   * Bake one person, if that exact outfit, facing and step has not been drawn
   * before. The figure comes from the same painter as the player's avatar, so
   * the crowd is the player's size by construction rather than by agreement.
   */
  personTexture(paletteIndex, facing, frame) {
    const key = `npc-${paletteIndex}-${facing}-${frame}`;
    if (this.textureKeys.has(key)) return key;

    const g = this.scene.make.graphics({ add: false });
    drawCharacter(g, {
      palette: CHARACTER_PALETTES[paletteIndex],
      direction: facing,
      moving: frame !== 'idle',
      phase: WALK_PHASES[frame] ?? 0,
      // The painter works around an origin at the middle of the body, which
      // runs negative; a texture starts at (0,0), so the figure is shifted
      // onto it. The painter applies this itself — see drawCharacter.
      offset: { x: -CHARACTER.left, y: -CHARACTER.top },
    });
    g.generateTexture(key, CHARACTER.width, CHARACTER.height);
    g.destroy();

    this.textureKeys.add(key);
    return key;
  }

  bakeCarTextures() {
    CAR_COLOURS.forEach((colour, index) => {
      const key = `amb-car-${index}`;
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      const g = this.scene.make.graphics({ add: false });

      g.fillStyle(0x05080f, 0.4);
      g.fillRoundedRect(3, 9, 44, 20, 7);
      g.fillStyle(colour, 1);
      g.fillRoundedRect(0, 6, 44, 20, 7);
      // Glasshouse, inset so the roofline reads.
      g.fillStyle(0x121a2e, 0.85);
      g.fillRoundedRect(11, 9, 20, 14, 4);
      // Headlights at the leading edge, tail lights behind.
      g.fillStyle(0xffe9b8, 1);
      g.fillCircle(42, 11, 2.6);
      g.fillCircle(42, 21, 2.6);
      g.fillStyle(0xff5a5a, 1);
      g.fillCircle(2, 11, 2);
      g.fillCircle(2, 21, 2);

      g.generateTexture(key, 50, 32);
      g.destroy();
      this.textureKeys.add(key);
    });
  }

  /** @param {number} delta milliseconds since the last frame */
  update(delta) {
    const step = delta / 1000;

    for (let i = 0; i < this.cars.length; i += 1) {
      const car = this.cars[i];
      const sprite = this.carSprites[i];
      const travel = car.speed * car.direction * step;

      if (car.horizontal) {
        car.x += travel;
        // Wrap rather than turn: a loop of traffic needs no junction logic.
        if (car.x > car.max) car.x = car.min;
        if (car.x < car.min) car.x = car.max;
        sprite.x = car.x;
        sprite.setFlipX(car.direction < 0);
      } else {
        car.y += travel;
        if (car.y > car.max) car.y = car.min;
        if (car.y < car.min) car.y = car.max;
        sprite.y = car.y;
        sprite.setFlipX(car.direction < 0);
        sprite.setDepth(car.y);
      }
    }

    for (let i = 0; i < this.people.length; i += 1) {
      const person = this.people[i];
      const sprite = this.personSprites[i];
      const travel = person.speed * person.direction * step;

      if (person.horizontal) {
        person.x += travel;
        if (person.x > person.max || person.x < person.min) person.direction *= -1;
        sprite.x = person.x;
      } else {
        person.y += travel;
        if (person.y > person.max || person.y < person.min) person.direction *= -1;
        sprite.y = person.y;
        sprite.setDepth(person.y);
      }

      // Step rate follows walking speed, so nobody moonwalks.
      person.phase += step * person.speed * 0.34;
      const facing = this.facingFor(person);
      const frame = Math.floor(person.phase) % 2 === 0 ? 'a' : 'b';
      if (facing !== person.facing || frame !== person.frame) {
        person.facing = facing;
        person.frame = frame;
        sprite.setTexture(this.personTexture(person.palette, facing, frame));
      }
    }
  }

  destroy() {
    this.carSprites.forEach((sprite) => sprite.destroy());
    this.personSprites.forEach((sprite) => sprite.destroy());
    this.standingSprites.forEach((sprite) => sprite.destroy());
    this.textureKeys.forEach((key) => {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    });
    this.carSprites = [];
    this.personSprites = [];
    this.standingSprites = [];
    this.textureKeys.clear();
  }
}
