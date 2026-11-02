/**
 * Everyone in Grooveli City is drawn by this one function.
 *
 * The player and the crowd used to be drawn by separate code at separate
 * sizes — a 50-pixel avatar walking past 26-pixel pedestrians, which read as
 * the player being a giant. Sharing the painter makes a mismatch structurally
 * impossible: the same geometry, the same proportions, the same bounds.
 *
 * The figure is a full standing person seen from the game's shallow top-down
 * angle: hair, face, jacket over a visible shirt, trousers as two separate
 * legs, light soles, and a soft shadow. It is drawn from the waist outward so
 * the parts that carry recognition at this size — the silhouette, the hair
 * shape and the jacket colour — survive being thirty pixels wide.
 *
 * Drawn into a Phaser Graphics object rather than a canvas, because the player
 * redraws every frame while walking and the crowd bakes the same output into
 * textures once. Both paths run this code, so both get the same person.
 */

/**
 * The figure's extent around its container origin.
 *
 * The origin sits at the middle of the body, not at the feet: the physics body
 * and the depth sort are both anchored there, and moving it would change how
 * the avatar collides. `feet` and `crown` are measured from it.
 */
export const CHARACTER = {
  feet: 23,
  crown: 34,
  left: -16,
  right: 16,
  top: -35,
  bottom: 29,
};

CHARACTER.width = CHARACTER.right - CHARACTER.left;
CHARACTER.height = CHARACTER.bottom - CHARACTER.top;
/** Where the origin sits inside a baked texture, as a 0..1 fraction. */
CHARACTER.originX = -CHARACTER.left / CHARACTER.width;
CHARACTER.originY = -CHARACTER.top / CHARACTER.height;

const SHADOW = 0x05080f;
const EYE = 0x2a2320;

/**
 * A dark rim around the figure.
 *
 * Without it a navy-trousered person standing on navy paving loses their legs
 * entirely — the first version used 0x1e2742 for trousers, which is the exact
 * fill of the plaza they stand on. Lightening the cloth alone would have made
 * everyone look like they were wearing jeans in a night scene; the outline is
 * what lets the trousers stay dark and still read.
 */
const RIM = 0x0a0e1a;

/**
 * Wardrobe.
 *
 * Deliberately a small set of strong, separable jacket colours: at this size
 * the jacket is most of what distinguishes one person from another, so two
 * similar blues would read as the same character twice.
 */
export const CHARACTER_PALETTES = [
  { jacket: 0x2b3a63, jacketDark: 0x22304f, shirt: 0xe7eefc, accent: 0x5be3c8, trousers: 0x2c3760, shoe: 0xe9eef8, skin: 0xc98a5e, hair: 0x201a18 },
  { jacket: 0x4f7fd4, jacketDark: 0x3d66b0, shirt: 0xeaf2ff, accent: 0xffffff, trousers: 0x303c66, shoe: 0xf2f5fb, skin: 0xe0ad84, hair: 0x2b211c },
  { jacket: 0xe8793a, jacketDark: 0xc6612b, shirt: 0xfff0e4, accent: 0xffd9a0, trousers: 0x323b61, shoe: 0xf0f3fa, skin: 0x8d5524, hair: 0x15100e },
  { jacket: 0x2aa9a0, jacketDark: 0x1f8880, shirt: 0xe6fbf8, accent: 0xffffff, trousers: 0x2d385c, shoe: 0xeef3fb, skin: 0xa96a3c, hair: 0x241a16 },
  { jacket: 0x7a6bbf, jacketDark: 0x62559c, shirt: 0xf0ecff, accent: 0xd9cfff, trousers: 0x313a62, shoe: 0xeceff8, skin: 0xd79b6e, hair: 0x3a2a20 },
  { jacket: 0x9fb2d8, jacketDark: 0x8396bd, shirt: 0xffffff, accent: 0x5be3c8, trousers: 0x38426e, shoe: 0xe4e9f4, skin: 0x6f4420, hair: 0x120d0b },
];

/**
 * Draw one person.
 *
 * @param {Phaser.GameObjects.Graphics} g
 * @param {object} options
 * @param {object} options.palette     one of CHARACTER_PALETTES
 * @param {'down'|'up'|'left'|'right'} [options.direction]
 * @param {number} [options.phase]     walk cycle, radians
 * @param {boolean} [options.moving]
 * @param {boolean} [options.shadow]   false when something else casts it
 * @param {{x:number,y:number}} [options.offset]  shifts the whole figure
 */
export function drawCharacter(g, { palette, direction = 'down', phase = 0, moving = false, shadow = true, offset }) {
  g.clear();
  // `clear()` empties the command buffer, and a translation pushed before it is
  // part of that buffer — so the offset has to be applied here, after the
  // clear, not by the caller beforehand. Setting it beforehand silently loses
  // it, and the figure is drawn around a (0,0) origin: baked into a texture
  // that means everything above the waist lands at negative coordinates and is
  // clipped, leaving a shoe and a scrap of jacket.
  if (offset) g.translateCanvas(offset.x, offset.y);

  const side = direction === 'left' || direction === 'right';
  const facing = direction === 'left' ? -1 : 1;
  const swing = moving ? Math.sin(phase) : 0;
  // The body lifts on each step; the shadow stays on the ground, which is what
  // stops a walk cycle reading as the whole figure sliding up and down.
  const bob = moving ? Math.abs(Math.sin(phase)) * 1.3 : 0;

  if (shadow) {
    g.fillStyle(SHADOW, 0.42);
    g.fillEllipse(0, CHARACTER.feet + 2, 27 - bob, 9 - bob * 0.5);
  }

  const y = -bob;

  drawLegs(g, palette, { side, facing, swing, y });
  drawTorso(g, palette, { side, facing, direction, swing, y });
  drawHead(g, palette, { side, facing, direction, y });
}

function drawLegs(g, palette, { side, facing, swing, y }) {
  const hip = y + 5;
  const sole = y + CHARACTER.feet;
  const length = sole - hip - 4;

  const leg = (x, width, shadeAlpha, extra = 0) => {
    g.fillStyle(palette.trousers, shadeAlpha);
    g.fillRoundedRect(x, hip, width, length + extra, 3);
    g.lineStyle(1, RIM, 0.55 * shadeAlpha);
    g.strokeRoundedRect(x, hip, width, length + extra, 3);

    g.fillStyle(palette.shoe, shadeAlpha);
    g.fillRoundedRect(x - 0.5, sole - 4 + extra, width + 1.5, 5, 2.5);
    g.lineStyle(1, RIM, 0.4 * shadeAlpha);
    g.strokeRoundedRect(x - 0.5, sole - 4 + extra, width + 1.5, 5, 2.5);
  };

  if (side) {
    // One leg forward, one back, and never exactly on top of each other: with
    // a pure swing offset they coincide at mid-stride and the figure appears
    // to stand on a single thick leg with one shoe.
    leg(facing * (-swing * 3.4 - 1.8) - 3.5, 7, 0.68);
    leg(facing * (swing * 3.4 + 1.8) - 3.5, 7, 1);
    return;
  }

  // Facing the camera or away: the step reads as one foot reaching further
  // down the screen than the other.
  leg(-8.5, 7, 1, swing * 2.6);
  leg(1.5, 7, 1, -swing * 2.6);
}

function drawTorso(g, palette, { side, facing, direction, swing, y }) {
  const width = side ? 16 : 22;
  const top = y - 12;
  const height = 18;

  // Arms. In profile the near arm is drawn over the jacket rather than under
  // it — tucked behind the torso in its own shade it was invisible, and a
  // figure in profile with no arm reads as a bollard.
  const arm = (x, yTop) => {
    g.fillStyle(palette.jacketDark, 1);
    g.fillRoundedRect(x, yTop, 4.5, 14, 2.2);
    g.lineStyle(1, RIM, 0.45);
    g.strokeRoundedRect(x, yTop, 4.5, 14, 2.2);
  };

  if (!side) {
    arm(-width / 2 - 3.5, top + 1 + swing * 1.4);
    arm(width / 2 - 1, top + 1 - swing * 1.4);
  }

  g.fillStyle(palette.jacket, 1);
  g.fillRoundedRect(-width / 2, top, width, height, 6);
  // A shaded flank gives the torso volume without a gradient.
  g.fillStyle(palette.jacketDark, 1);
  g.fillRoundedRect(width / 2 - 4.5, top, 4.5, height, { tl: 0, tr: 6, bl: 0, br: 6 });
  g.lineStyle(1, RIM, 0.5);
  g.strokeRoundedRect(-width / 2, top, width, height, 6);

  if (side) arm(facing * 2.5 - 2.25 + facing * swing * 2.2, top + 2.5);

  if (direction === 'down') {
    // Open jacket: the shirt wedge and a collar, which is most of what makes
    // the figure read as a person in a jacket rather than a coloured block.
    g.fillStyle(palette.shirt, 1);
    g.fillTriangle(-5, top, 5, top, 0, top + 11);
    g.fillStyle(palette.jacket, 1);
    g.fillTriangle(-5, top, -1.5, top, -4.5, top + 4.5);
    g.fillTriangle(5, top, 1.5, top, 4.5, top + 4.5);
    g.fillStyle(palette.accent, 1);
    g.fillRect(-1.4, top + 2, 2.8, 8);
  }
}

function drawHead(g, palette, { side, facing, direction, y }) {
  const hx = side ? facing * 1.5 : 0;
  const hy = y - 22.5;

  g.fillStyle(palette.skin, 1);
  g.fillRect(-3, y - 16, 6, 5);
  g.fillCircle(hx, hy, 9);
  g.lineStyle(1, RIM, 0.35);
  g.strokeCircle(hx, hy, 9);

  g.fillStyle(palette.hair, 1);
  if (direction === 'up') {
    // Seen from behind, the hair is the whole head.
    g.fillCircle(hx, hy - 0.5, 9.1);
  } else if (side) {
    // In profile the hair sits back off the face and sweeps forward only at
    // the brow. Centring it on the head — as the first version did — buried
    // the eye under the fringe and left the figure looking like it was facing
    // away whichever way it walked.
    g.fillEllipse(hx - facing * 4.2, hy - 3.4, 14.5, 12.5);
    g.fillCircle(hx - facing * 5.4, hy + 0.8, 5);
    g.fillEllipse(hx + facing * 2.2, hy - 6.2, 11, 6);
  } else {
    // A dome and a fringe, plus the sides of the head showing past the face.
    g.fillEllipse(hx, hy - 3.2, 18.4, 13.5);
    g.fillCircle(hx - 7.4, hy - 0.4, 3.1);
    g.fillCircle(hx + 7.4, hy - 0.4, 3.1);
  }

  g.fillStyle(EYE, 1);
  if (direction === 'down') {
    g.fillCircle(hx - 3.3, hy + 1.8, 1.35);
    g.fillCircle(hx + 3.3, hy + 1.8, 1.35);
  } else if (side) {
    g.fillCircle(hx + facing * 4, hy + 0.6, 1.35);
  }
}
