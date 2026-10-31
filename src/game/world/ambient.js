import Phaser from 'phaser';
import { roads, approaches } from './cityLayout.js';
import { createRandom } from './platePainter.js';

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
const COAT_COLOURS = [0x2b3a63, 0x3c4f7d, 0x5a4a6e, 0x2f5d52, 0x6b4a3a, 0x44526f];

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
      // Phase keeps the whole crowd from bobbing in lockstep.
      phase: random() * Math.PI * 2,
      colour: COAT_COLOURS[Math.floor(random() * COAT_COLOURS.length)],
    });
  };

  roads.forEach((road) => {
    const horizontal = road.orientation === 'h';
    const length = horizontal ? road.width : road.height;
    const count = Math.max(2, Math.round(length / 330));

    [-18, (horizontal ? road.height : road.width) + 18].forEach((edge) => {
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
        addWalker(way.x + 24 + random() * (way.width - 48), way.y + t * way.height, false, way.y + 16, way.y + way.height - 16);
      } else {
        addWalker(way.x + t * way.width, way.y + 24 + random() * (way.height - 48), true, way.x + 16, way.x + way.width - 16);
      }
    }
  });

  return people;
}

/**
 * Creates the sprites and moves them.
 *
 * Textures are baked once per scene, not per actor: eighty sprites share about
 * a dozen textures, so the whole layer draws in a handful of batches.
 */
export class AmbientLayer {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.textureKeys = [];
    this.cars = [];
    this.people = [];
    this.carSprites = [];
    this.personSprites = [];
  }

  create() {
    const random = createRandom(20261101);
    this.bakeTextures();

    this.cars = generateTraffic(random);
    this.people = generateCrowd(random);

    this.carSprites = this.cars.map((car) => {
      const sprite = this.scene.add.image(car.x, car.y, car.key);
      sprite.setRotation(car.horizontal ? 0 : Math.PI / 2);
      // Vehicles sort against the player and the buildings by world Y, exactly
      // as the avatar does, so you can walk in front of a car and behind a bus.
      sprite.setDepth(car.y);
      return sprite;
    });

    this.personSprites = this.people.map((person) => {
      const sprite = this.scene.add.image(person.x, person.y, this.personKeyFor(person.colour));
      sprite.setDepth(person.y);
      return sprite;
    });
  }

  personKeyFor(colour) {
    return `amb-person-${COAT_COLOURS.indexOf(colour)}`;
  }

  /** One texture per car colour and one per coat colour. */
  bakeTextures() {
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
      this.textureKeys.push(key);
    });

    COAT_COLOURS.forEach((colour, index) => {
      const key = `amb-person-${index}`;
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      const g = this.scene.make.graphics({ add: false });

      g.fillStyle(0x05080f, 0.38);
      g.fillEllipse(9, 21, 15, 6);
      g.fillStyle(colour, 1);
      g.fillRoundedRect(3, 7, 12, 13, 4);
      g.fillStyle(0xc98a5e, 1);
      g.fillCircle(9, 5, 4.4);
      g.fillStyle(0x201a18, 1);
      g.fillCircle(9, 3.4, 4.4);

      g.generateTexture(key, 20, 26);
      g.destroy();
      this.textureKeys.push(key);
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

      // A shallow bob sells walking without an animation frame budget.
      person.phase += step * 7;
      sprite.y += Math.sin(person.phase) * 0.6;
    }
  }

  destroy() {
    this.carSprites.forEach((sprite) => sprite.destroy());
    this.personSprites.forEach((sprite) => sprite.destroy());
    this.textureKeys.forEach((key) => {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    });
    this.carSprites = [];
    this.personSprites = [];
    this.textureKeys = [];
  }
}
