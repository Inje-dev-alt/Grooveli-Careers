/**
 * The city painter.
 *
 * Pure Canvas2D drawing routines, with no imports and no engine dependency, so
 * the same code runs inside the offline bake step (headless Chromium) and could
 * run anywhere else a 2D context exists.
 *
 * This is deliberately extravagant: roughly fifteen thousand canvas operations,
 * against the thousand or so CityRenderer can afford.
 *
 * That renderer is not naive — it already bakes, into a RenderTexture for the
 * ground and a generated texture per building, so its steady-state cost is low.
 * The constraint is *when* it bakes: on the player's machine, during scene
 * start, every time the city loads. Detail there is paid for in load time by
 * every player on every visit, which is what caps it.
 *
 * Moving the bake offline removes the cap. Ten times the detail costs the
 * player nothing extra, because the work already happened on a build machine.
 *
 * Nothing in here is interactive. Collision comes from the mask the same bake
 * emits, so the art and the walkable space cannot drift apart.
 */

/** Deterministic PRNG — the city must look identical on every bake. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export const nightPalette = {
  ground: '#0d1426',
  groundWarm: '#121a30',
  pavement: '#1a2238',
  pavementEdge: '#232c47',
  pavementLine: '#101729',
  road: '#161d31',
  roadWear: '#1b2339',
  roadMark: '#6d7ca6',
  curb: '#2b3553',
  park: '#13301f',
  parkLight: '#1a4029',
  parkPath: '#2a3148',
  tree: ['#175033', '#1b613e', '#20714a'],
  treeDeep: '#0d3521',
  treeLight: '#3d8f61',
  lamp: '#3d4769',
  lampGlow: '#ffd79a',
  shadow: 'rgba(3,6,14,0.55)',
  faceLight: '#2b3658',
  faceMid: '#222c4a',
  faceDark: '#1a2238',
  roofTop: '#36446c',
  roofEdge: '#4a5a8c',
  windowWarm: ['#ffd9a0', '#ffc98a', '#ffe8c4'],
  windowCool: ['#8fd4ff', '#a8e0ff', '#c6ecff'],
  windowDark: '#131a2d',
};

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/** `rgba()` string from a hex colour and an alpha, for glow work. */
export function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A radial pool of light, used for lamps, windows spill and neon. */
function glow(ctx, x, y, radius, colour, strength) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, rgba(colour, strength));
  grad.addColorStop(0.45, rgba(colour, strength * 0.35));
  grad.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/* ------------------------------------------------------------------ ground */

/**
 * Paint the whole ground plane: pavement, parks, roads, markings, planting,
 * street furniture and the night grade.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ world, roads, approaches, parks, crosswalks, trees, lamps, locations }} model
 */
export function paintGround(ctx, model) {
  const { world, roads, approaches, parks, crosswalks, trees, lamps, billboards } = model;
  const random = createRandom(20261031);

  ctx.fillStyle = nightPalette.ground;
  ctx.fillRect(0, 0, world.width, world.height);

  paintPavement(ctx, model, random);
  paintParks(ctx, parks, random);
  paintRoads(ctx, roads, crosswalks, random);
  paintApproaches(ctx, approaches ?? [], random);
  paintPlanting(ctx, trees, random);
  paintBillboards(ctx, billboards ?? []);
  paintLamps(ctx, lamps);
  paintNightGrade(ctx, world);
}

/**
 * Paving. The city is divided into superblocks by its roads; each block gets a
 * slab with its own slight tone and a tile grid, which is what stops the ground
 * reading as one flat fill when the camera moves across it.
 */
function paintPavement(ctx, model, random) {
  const { world, roads } = model;
  const xs = [0];
  const ys = [0];
  roads.forEach((road) => {
    if (road.orientation === 'v') xs.push(road.x, road.x + road.width);
    else ys.push(road.y, road.y + road.height);
  });
  xs.push(world.width);
  ys.push(world.height);
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);

  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x = xs[i];
      const y = ys[j];
      const w = xs[i + 1] - x;
      const h = ys[j + 1] - y;
      if (w < 30 || h < 30) continue;

      const tone = 0.5 + random() * 0.5;
      ctx.fillStyle = tone > 0.75 ? nightPalette.pavement : nightPalette.groundWarm;
      ctx.fillRect(x, y, w, h);

      // Tile joints. Cheap, and they carry the sense of scale.
      ctx.strokeStyle = rgba(nightPalette.pavementLine, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let tx = x + 48; tx < x + w; tx += 48) {
        ctx.moveTo(tx, y);
        ctx.lineTo(tx, y + h);
      }
      for (let ty = y + 48; ty < y + h; ty += 48) {
        ctx.moveTo(x, ty);
        ctx.lineTo(x + w, ty);
      }
      ctx.stroke();

      // Edge highlight where the block meets the carriageway.
      ctx.strokeStyle = rgba(nightPalette.pavementEdge, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
}

function paintParks(ctx, parks, random) {
  parks.forEach((park) => {
    const grad = ctx.createLinearGradient(park.x, park.y, park.x, park.y + park.height);
    grad.addColorStop(0, nightPalette.parkLight);
    grad.addColorStop(1, nightPalette.park);
    ctx.fillStyle = grad;
    roundRect(ctx, park.x, park.y, park.width, park.height, 40);
    ctx.fill();

    // Mown texture.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = rgba('#2f7a4c', 0.18);
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let y = park.y; y < park.y + park.height; y += 16) {
      ctx.moveTo(park.x, y);
      ctx.lineTo(park.x + park.width, y);
    }
    ctx.stroke();

    // A path across the longer axis.
    ctx.strokeStyle = rgba(nightPalette.parkPath, 0.85);
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (park.width >= park.height) {
      ctx.moveTo(park.x + 10, park.y + park.height * 0.6);
      ctx.quadraticCurveTo(
        park.x + park.width / 2,
        park.y + park.height * (0.2 + random() * 0.3),
        park.x + park.width - 10,
        park.y + park.height * 0.5,
      );
    } else {
      ctx.moveTo(park.x + park.width * 0.5, park.y + 10);
      ctx.quadraticCurveTo(
        park.x + park.width * (0.2 + random() * 0.5),
        park.y + park.height / 2,
        park.x + park.width * 0.55,
        park.y + park.height - 10,
      );
    }
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = rgba('#3c8f5e', 0.7);
    ctx.lineWidth = 2;
    roundRect(ctx, park.x, park.y, park.width, park.height, 40);
    ctx.stroke();
  });
}

function paintRoads(ctx, roads, crosswalks, random) {
  roads.forEach((road) => {
    const horizontal = road.orientation === 'h';
    const grad = horizontal
      ? ctx.createLinearGradient(0, road.y, 0, road.y + road.height)
      : ctx.createLinearGradient(road.x, 0, road.x + road.width, 0);
    grad.addColorStop(0, nightPalette.roadWear);
    grad.addColorStop(0.5, nightPalette.road);
    grad.addColorStop(1, nightPalette.roadWear);
    ctx.fillStyle = grad;
    ctx.fillRect(road.x, road.y, road.width, road.height);

    // Surface patches, so the asphalt is not a single flat value.
    ctx.save();
    ctx.beginPath();
    ctx.rect(road.x, road.y, road.width, road.height);
    ctx.clip();
    for (let i = 0; i < 26; i += 1) {
      ctx.fillStyle = rgba('#20294200'.slice(0, 7), 0.5);
      ctx.fillStyle = rgba('#202942', 0.35 + random() * 0.3);
      const px = road.x + random() * road.width;
      const py = road.y + random() * road.height;
      ctx.beginPath();
      ctx.ellipse(px, py, 20 + random() * 60, 10 + random() * 24, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Curbs.
    ctx.fillStyle = nightPalette.curb;
    if (horizontal) {
      ctx.fillRect(road.x, road.y - 4, road.width, 4);
      ctx.fillRect(road.x, road.y + road.height, road.width, 4);
    } else {
      ctx.fillRect(road.x - 4, road.y, 4, road.height);
      ctx.fillRect(road.x + road.width, road.y, 4, road.height);
    }

    // Lane markings: a solid edge line each side and a dashed centre.
    ctx.strokeStyle = rgba(nightPalette.roadMark, 0.3);
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(road.x, road.y + 14);
      ctx.lineTo(road.x + road.width, road.y + 14);
      ctx.moveTo(road.x, road.y + road.height - 14);
      ctx.lineTo(road.x + road.width, road.y + road.height - 14);
    } else {
      ctx.moveTo(road.x + 14, road.y);
      ctx.lineTo(road.x + 14, road.y + road.height);
      ctx.moveTo(road.x + road.width - 14, road.y);
      ctx.lineTo(road.x + road.width - 14, road.y + road.height);
    }
    ctx.stroke();

    ctx.strokeStyle = rgba(nightPalette.roadMark, 0.55);
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 26]);
    ctx.beginPath();
    if (horizontal) {
      const y = road.y + road.height / 2;
      ctx.moveTo(road.x + 20, y);
      ctx.lineTo(road.x + road.width - 20, y);
    } else {
      const x = road.x + road.width / 2;
      ctx.moveTo(x, road.y + 20);
      ctx.lineTo(x, road.y + road.height - 20);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });

  crosswalks.forEach((walk) => {
    ctx.fillStyle = rgba('#aab6d8', 0.42);
    if (walk.orientation === 'h') {
      for (let x = walk.x; x < walk.x + walk.width; x += 20) {
        ctx.fillRect(x, walk.y + 8, 12, walk.height - 16);
      }
    } else {
      for (let y = walk.y; y < walk.y + walk.height; y += 20) {
        ctx.fillRect(walk.x + 8, y, walk.width - 16, 12);
      }
    }
  });
}

/**
 * Pedestrian approaches: paved promenades, not carriageways. Banded paving and
 * a lit spine, so they read as somewhere to walk rather than as a street that
 * someone forgot to mark.
 */
function paintApproaches(ctx, approaches, random) {
  approaches.forEach((way) => {
    const vertical = way.orientation === 'v';
    const grad = vertical
      ? ctx.createLinearGradient(way.x, 0, way.x + way.width, 0)
      : ctx.createLinearGradient(0, way.y, 0, way.y + way.height);
    grad.addColorStop(0, '#1d2540');
    grad.addColorStop(0.5, '#232d4d');
    grad.addColorStop(1, '#1d2540');
    ctx.fillStyle = grad;
    ctx.fillRect(way.x, way.y, way.width, way.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(way.x, way.y, way.width, way.height);
    ctx.clip();

    // Banded paving across the direction of travel.
    ctx.strokeStyle = rgba('#38436d', 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (vertical) {
      for (let y = way.y; y < way.y + way.height; y += 34) {
        ctx.moveTo(way.x, y);
        ctx.lineTo(way.x + way.width, y);
      }
    } else {
      for (let x = way.x; x < way.x + way.width; x += 34) {
        ctx.moveTo(x, way.y);
        ctx.lineTo(x, way.y + way.height);
      }
    }
    ctx.stroke();

    // Inlaid light strip down the spine.
    ctx.strokeStyle = rgba('#6fe0ff', 0.3);
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(way.x + way.width / 2, way.y + 8);
      ctx.lineTo(way.x + way.width / 2, way.y + way.height - 8);
    } else {
      ctx.moveTo(way.x + 8, way.y + way.height / 2);
      ctx.lineTo(way.x + way.width - 8, way.y + way.height / 2);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const steps = vertical ? Math.floor(way.height / 120) : Math.floor(way.width / 120);
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0.5 : i / steps;
      const gx = vertical ? way.x + way.width / 2 : way.x + t * way.width;
      const gy = vertical ? way.y + t * way.height : way.y + way.height / 2;
      glow(ctx, gx, gy, 54, '#6fe0ff', 0.08 + random() * 0.04);
    }
    ctx.restore();

    ctx.strokeStyle = rgba(nightPalette.curb, 0.9);
    ctx.lineWidth = 3;
    ctx.strokeRect(way.x, way.y, way.width, way.height);
  });
}

function paintPlanting(ctx, trees, random) {
  trees.forEach((tree) => {
    const r = tree.radius;

    ctx.fillStyle = nightPalette.shadow;
    ctx.beginPath();
    ctx.ellipse(tree.x + 5, tree.y + r * 0.62, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk, visible under the canopy edge.
    ctx.fillStyle = '#20283c';
    ctx.fillRect(tree.x - 2, tree.y, 4, r * 0.7);

    // Three overlapping lobes read as foliage where one circle reads as a dot.
    const base = nightPalette.tree[tree.variant % nightPalette.tree.length];
    ctx.fillStyle = nightPalette.treeDeep;
    ctx.beginPath();
    ctx.arc(tree.x, tree.y + 2, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i += 1) {
      const ox = (random() - 0.5) * r * 0.7;
      const oy = (random() - 0.5) * r * 0.7 - 2;
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(tree.x + ox, tree.y + oy, r * (0.6 + random() * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    // Moonlight catching the top-left of the canopy.
    ctx.fillStyle = rgba(nightPalette.treeLight, 0.22);
    ctx.beginPath();
    ctx.arc(tree.x - r * 0.32, tree.y - r * 0.4, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Roadside hoardings.
 *
 * Built the same way as a building: a footprint on the ground, a panel lifted
 * above it, and a lean away from the middle of the world so it stands up rather
 * than lying flat. Keeping the construction identical is what makes them look
 * like they belong to the same city.
 */
function paintBillboards(ctx, billboards) {
  billboards.forEach((board) => {
    const halfW = board.width / 2;
    const lean = ((board.x - 1340) / 1340) * board.height * 0.3;
    const top = board.y - board.height;

    ctx.fillStyle = nightPalette.shadow;
    ctx.beginPath();
    ctx.ellipse(board.x + 4, board.y + 3, halfW * 0.8, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs, leaning with the panel so they meet its underside.
    ctx.strokeStyle = rgba('#3c4870', 0.95);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(board.x - halfW * 0.55, board.y);
    ctx.lineTo(board.x - halfW * 0.55 + lean, top + board.height * 0.72);
    ctx.moveTo(board.x + halfW * 0.55, board.y);
    ctx.lineTo(board.x + halfW * 0.55 + lean, top + board.height * 0.72);
    ctx.stroke();

    const bl = { x: board.x - halfW + lean, y: top + board.height };
    const br = { x: board.x + halfW + lean, y: top + board.height };
    const tr = { x: board.x + halfW + lean, y: top };
    const tl = { x: board.x - halfW + lean, y: top };

    ctx.fillStyle = rgba('#080d1a', 0.95);
    quad(ctx, bl, br, tr, tl);
    ctx.fill();
    ctx.strokeStyle = rgba(board.accent, 0.85);
    ctx.lineWidth = 2.5;
    quad(ctx, bl, br, tr, tl);
    ctx.stroke();

    const cx = board.x + lean;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(board.height * 0.3)}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = rgba(board.accent, 0.96);
    ctx.fillText(board.headline, cx, top + board.height * 0.36);
    ctx.font = `600 ${Math.round(board.height * 0.15)}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = rgba('#c3cde6', 0.85);
    ctx.fillText(board.sub, cx, top + board.height * 0.64);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, top + board.height * 0.45, board.width * 0.62, board.accent, 0.13);
    ctx.restore();
  });
}

function paintLamps(ctx, lamps) {
  // Light pools first, so every post sits inside its own glow.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  lamps.forEach((lamp) => glow(ctx, lamp.x, lamp.y - 16, 46, nightPalette.lampGlow, 0.14));
  ctx.restore();

  lamps.forEach((lamp) => {
    ctx.fillStyle = nightPalette.lamp;
    ctx.fillRect(lamp.x - 2, lamp.y - 22, 4, 22);
    ctx.fillStyle = nightPalette.lampGlow;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y - 24, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Vignette, so the eye settles on the middle of the viewport. */
function paintNightGrade(ctx, world) {
  const grad = ctx.createRadialGradient(
    world.width / 2, world.height / 2, world.height * 0.25,
    world.width / 2, world.height / 2, world.height * 0.95,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, world.width, world.height);
}

/* --------------------------------------------------------------- buildings */

/**
 * Pixels of extrusion per floor.
 *
 * The first pass used 22 and the city still read as a floor plan: against
 * footprints 260 pixels deep, the roof plate swallowed the facade and there was
 * nowhere to put lit windows. A building has to be mostly wall to look like a
 * building.
 */
export const LIFT_PER_FLOOR = 46;

/**
 * How much narrower the roof is than the footprint.
 *
 * A straight extrusion gives two parallel planes, which the eye reads as a
 * sticker. Pulling the roof in turns the facade into a frustum and the building
 * stands up.
 */
const ROOF_TAPER = 0.86;

/**
 * How far a building leans away from the middle of the world, per pixel of
 * height. Buildings left of centre show their right flank and vice versa, which
 * is how a flat top-down plan starts reading as a skyline. The lean is a
 * drawing trick only — the footprint, and therefore collision, never moves.
 */
const LEAN = 0.42;

/**
 * Height of a building, in pixels of upward extrusion.
 *
 * Capped by the headroom between the top of the footprint and the top of the
 * world. The camera cannot scroll past the world bounds, so a tower that
 * overshot them would have its roof cut off by the edge of the viewport. The
 * cap makes that structurally impossible, and reads as a height limit on the
 * northern edge of the city rather than as a clipped sprite.
 */
export function liftFor(location) {
  if (location.walkable) return 0;
  const wanted = (location.floors ?? 3) * LIFT_PER_FLOOR;
  return wanted;
}

/** The same, clamped to the headroom above the footprint. */
export function clampedLiftFor(location) {
  if (location.walkable) return 0;
  const headroom = location.position.y - location.size.height / 2 - 24;
  return Math.max(LIFT_PER_FLOOR, Math.min(liftFor(location), headroom));
}

export function leanFor(location, world) {
  if (location.walkable) return 0;
  const fromCentre = (location.position.x - world.width / 2) / (world.width / 2);
  return fromCentre * clampedLiftFor(location) * LEAN;
}

/**
 * The padding a baked building texture needs around its footprint, so the
 * extrusion, the lean, the ground shadow and the light spill all fit.
 */
export function buildingPadding(location, world) {
  const lift = clampedLiftFor(location);
  const lean = leanFor(location, world);
  return {
    left: 60 + Math.max(0, -lean),
    right: 60 + Math.max(0, lean),
    top: 58 + lift,
    bottom: 74,
  };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

/**
 * Paint one location, in coordinates centred on its footprint.
 *
 * The caller translates the context so that (0,0) is the centre of the
 * footprint; everything here is relative to that, which keeps the sprite's
 * anchor exact no matter how tall the building gets.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} location  a CityLocation
 * @param {{ world: object }} opts
 */
export function paintBuilding(ctx, location, opts) {
  const { world } = opts;
  const random = createRandom(hashString(location.id));
  const halfW = location.size.width / 2;
  const halfH = location.size.height / 2;

  if (location.walkable) {
    paintPlaza(ctx, location, halfW, halfH, random);
    return;
  }

  const lift = clampedLiftFor(location);
  const lean = leanFor(location, world);
  const accent = location.accent;

  // Footprint corners, then the roof plate: the same rectangle lifted and
  // leaned. Every face is the quad between a footprint edge and its twin.
  const FL = { x: -halfW, y: halfH };
  const FR = { x: halfW, y: halfH };
  const BL = { x: -halfW, y: -halfH };
  const BR = { x: halfW, y: -halfH };
  const tw = halfW * ROOF_TAPER;
  const th = halfH * ROOF_TAPER;
  const rFL = { x: -tw + lean, y: th - lift };
  const rFR = { x: tw + lean, y: th - lift };
  const rBL = { x: -tw + lean, y: -th - lift };
  const rBR = { x: tw + lean, y: -th - lift };

  // Ground shadow, thrown away from the centre of the world like the lean.
  ctx.fillStyle = nightPalette.shadow;
  roundRect(ctx, -halfW - lean * 0.3 + 8, -halfH + 14, halfW * 2, halfH * 2, 18);
  ctx.fill();

  // Flank. Only one is ever visible, and it is always the darker plane.
  ctx.fillStyle = nightPalette.faceDark;
  if (lean < 0) quad(ctx, FR, BR, rBR, rFR);
  else quad(ctx, FL, BL, rBL, rFL);
  ctx.fill();
  paintFlankWindows(ctx, lean < 0 ? [FR, BR, rBR, rFR] : [FL, BL, rBL, rFL], random);

  // Front facade.
  const faceGrad = ctx.createLinearGradient(0, halfH - lift, 0, halfH);
  faceGrad.addColorStop(0, nightPalette.faceLight);
  faceGrad.addColorStop(1, nightPalette.faceMid);
  ctx.fillStyle = faceGrad;
  quad(ctx, FL, FR, rFR, rFL);
  ctx.fill();

  paintFacadeWindows(ctx, { FL, FR, rFL, rFR }, location, random);
  paintFacadeSign(ctx, { FL, FR, rFL, rFR }, location, accent, lift);
  paintAccentBand(ctx, { FL, FR, rFL, rFR }, accent);
  paintEntrance(ctx, { FL, FR, rFL, rFR }, accent, location);

  // Roof plate.
  ctx.fillStyle = nightPalette.roofTop;
  roundRect(ctx, rBL.x, rBL.y, tw * 2, th * 2, 14);
  ctx.fill();
  ctx.strokeStyle = rgba(nightPalette.roofEdge, 0.9);
  ctx.lineWidth = 2;
  roundRect(ctx, rBL.x, rBL.y, tw * 2, th * 2, 14);
  ctx.stroke();

  paintRoofDetail(ctx, { rBL, rBR, rFL }, location, accent, random);
  paintRoofHoarding(ctx, { rBL, rBR, rFL }, location, accent);

  // Light the pavement at the foot of the building.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, halfH + 6, Math.max(halfW, 90), accent, 0.1);
  ctx.restore();
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Window grid on the front facade.
 *
 * The facade is a parallelogram, so each window is placed by interpolating
 * across it rather than by drawing an axis-aligned rectangle. Roughly a third
 * of the windows are dark and the lit ones split between warm interior light
 * and cool screen light, which is what makes a tower read as occupied.
 */
function paintFacadeWindows(ctx, corners, location, random) {
  const { FL, FR, rFL, rFR } = corners;
  const floors = location.floors ?? 3;
  const cols = Math.max(4, Math.round(location.size.width / 38));
  const rows = Math.max(2, floors);

  const lit = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u0 = (col + 0.26) / cols;
      const u1 = (col + 0.74) / cols;
      // v runs from the base of the facade (0) to the roofline (1).
      const v0 = (row + 0.3) / rows;
      const v1 = (row + 0.78) / rows;

      const bl = lerp(lerp(FL, FR, u0), lerp(rFL, rFR, u0), v0);
      const br = lerp(lerp(FL, FR, u1), lerp(rFL, rFR, u1), v0);
      const tr = lerp(lerp(FL, FR, u1), lerp(rFL, rFR, u1), v1);
      const tl = lerp(lerp(FL, FR, u0), lerp(rFL, rFR, u0), v1);

      const roll = random();
      if (roll < 0.34) {
        ctx.fillStyle = nightPalette.windowDark;
      } else {
        const warm = random() < 0.62;
        const set = warm ? nightPalette.windowWarm : nightPalette.windowCool;
        const colour = set[Math.floor(random() * set.length)];
        ctx.fillStyle = rgba(colour, 0.72 + random() * 0.28);
        if (random() < 0.3) lit.push({ x: (bl.x + tr.x) / 2, y: (bl.y + tr.y) / 2, colour });
      }
      quad(ctx, bl, br, tr, tl);
      ctx.fill();
    }
  }

  // A soft bloom on a few windows. Done after the grid so it reads as light
  // escaping the glass rather than as a differently coloured pane.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  lit.forEach((w) => glow(ctx, w.x, w.y, 22, w.colour, 0.22));
  ctx.restore();
}

/** The visible flank gets a sparser, dimmer grid — it is turned away from us. */
function paintFlankWindows(ctx, [a, b, rb, ra], random) {
  const rows = 5;
  const cols = 4;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u0 = (col + 0.3) / cols;
      const u1 = (col + 0.7) / cols;
      const v0 = (row + 0.32) / rows;
      const v1 = (row + 0.74) / rows;
      const p00 = lerp(lerp(a, b, u0), lerp(ra, rb, u0), v0);
      const p10 = lerp(lerp(a, b, u1), lerp(ra, rb, u1), v0);
      const p11 = lerp(lerp(a, b, u1), lerp(ra, rb, u1), v1);
      const p01 = lerp(lerp(a, b, u0), lerp(ra, rb, u0), v1);

      ctx.fillStyle = random() < 0.55
        ? rgba('#0f1627', 0.9)
        : rgba(nightPalette.windowWarm[0], 0.2 + random() * 0.25);
      quad(ctx, p00, p10, p11, p01);
      ctx.fill();
    }
  }
}

/**
 * The billboard mounted on the face of the building.
 *
 * This is the diegetic half of the interface: the district says what it is in
 * the world, rather than in a panel floating over it. It is baked into the
 * building sprite, so the text costs nothing at runtime — which is the whole
 * reason it can be this large and this detailed.
 *
 * The facade leans, so the panel is a parallelogram. Its *text* is not
 * distorted: in this projection horizontal lines on the facade stay horizontal,
 * and only the verticals shear, so type can be drawn flat at the right point.
 */
function paintFacadeSign(ctx, { FL, FR, rFL, rFR }, location, accent, lift) {
  if (!location.sign) return;

  // Mounted over the upper third, clear of the entrance and the accent band.
  const u0 = 0.14;
  const u1 = 0.86;
  const v0 = 0.56;
  const v1 = 0.79;

  const at = (u, v) => lerp(lerp(FL, FR, u), lerp(rFL, rFR, u), v);
  const bl = at(u0, v0);
  const br = at(u1, v0);
  const tr = at(u1, v1);
  const tl = at(u0, v1);

  const height = Math.abs(tl.y - bl.y);
  const width = br.x - bl.x;
  if (height < 26 || width < 90) return;

  // Housing, inset border, then the lit face.
  ctx.fillStyle = rgba('#070b16', 0.93);
  quad(ctx, bl, br, tr, tl);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.75);
  ctx.lineWidth = 2;
  quad(ctx, bl, br, tr, tl);
  ctx.stroke();

  const centreX = (bl.x + br.x) / 2;
  const headY = (bl.y + tl.y) / 2 - height * 0.1;
  const subY = headY + height * 0.3;

  const headSize = Math.min(34, Math.max(15, height * 0.4));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(headSize)}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = rgba(accent, 0.96);
  ctx.fillText(location.shortName, centreX, headY);

  const subSize = Math.round(Math.min(14, Math.max(9, height * 0.17)));
  ctx.font = `600 ${subSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = rgba('#aab6d8', 0.8);
  ctx.fillText(location.sign, centreX, subY);
  ctx.restore();

  // The sign lights the wall around it.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, centreX, headY, Math.max(width * 0.55, 80), accent, 0.11);
  ctx.restore();
  void lift;
}

/**
 * A hoarding standing on the roof of the taller towers.
 *
 * Only the tall ones: on a four-floor building it would sit at the same height
 * as its neighbours' facade signs and the skyline would turn into a wall of
 * type.
 */
function paintRoofHoarding(ctx, { rBL, rBR, rFL }, location, accent) {
  if ((location.floors ?? 3) < 5 || !location.sign) return;

  const width = (rBR.x - rBL.x) * 0.76;
  const height = 26;
  const x = rBL.x + ((rBR.x - rBL.x) - width) / 2;
  // Stands on the back edge of the roof, rising above it.
  const base = rBL.y + (rFL.y - rBL.y) * 0.18;
  const top = base - height;

  // Legs.
  ctx.strokeStyle = rgba('#49568a', 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + width * 0.16, base);
  ctx.lineTo(x + width * 0.16, base - height * 0.5);
  ctx.moveTo(x + width * 0.84, base);
  ctx.lineTo(x + width * 0.84, base - height * 0.5);
  ctx.stroke();

  ctx.fillStyle = rgba('#0a0f1e', 0.95);
  roundRect(ctx, x, top, width, height, 4);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.8);
  ctx.lineWidth = 2;
  roundRect(ctx, x, top, width, height, 4);
  ctx.stroke();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(height * 0.52)}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = rgba(accent, 0.95);
  ctx.fillText(location.shortName, x + width / 2, top + height / 2 + 1);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x + width / 2, top + height / 2, width * 0.6, accent, 0.14);
  ctx.restore();
}

/** The district's colour, carried as a lit band across the facade. */
function paintAccentBand(ctx, { FL, FR, rFL, rFR }, accent) {
  const v0 = 0.86;
  const v1 = 0.94;
  const bl = lerp(FL, rFL, v0);
  const br = lerp(FR, rFR, v0);
  const tr = lerp(FR, rFR, v1);
  const tl = lerp(FL, rFL, v1);

  ctx.fillStyle = rgba(accent, 0.85);
  quad(ctx, bl, br, tr, tl);
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mid = lerp(lerp(FL, FR, 0.5), lerp(rFL, rFR, 0.5), 0.9);
  glow(ctx, mid.x, mid.y, 90, accent, 0.16);
  ctx.restore();
}

/** Doors at the base of the facade, lit from inside, with a canopy. */
function paintEntrance(ctx, { FL, FR, rFL, rFR }, accent, location) {
  const doorWidth = Math.min(0.3, 120 / location.size.width);
  const u0 = 0.5 - doorWidth / 2;
  const u1 = 0.5 + doorWidth / 2;
  const v1 = 0.3;

  const bl = lerp(FL, FR, u0);
  const br = lerp(FL, FR, u1);
  const tr = lerp(lerp(FL, FR, u1), lerp(rFL, rFR, u1), v1);
  const tl = lerp(lerp(FL, FR, u0), lerp(rFL, rFR, u0), v1);

  ctx.fillStyle = rgba('#ffe6bb', 0.9);
  quad(ctx, bl, br, tr, tl);
  ctx.fill();

  // Mullion, so it reads as a pair of doors.
  ctx.strokeStyle = rgba('#1a2238', 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  const mb = lerp(bl, br, 0.5);
  const mt = lerp(tl, tr, 0.5);
  ctx.moveTo(mb.x, mb.y);
  ctx.lineTo(mt.x, mt.y);
  ctx.stroke();

  // Canopy.
  ctx.fillStyle = rgba(accent, 0.75);
  quad(ctx, lerp(bl, tl, 1.0), lerp(br, tr, 1.0), { x: tr.x, y: tr.y - 9 }, { x: tl.x, y: tl.y - 9 });
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, (bl.x + br.x) / 2, bl.y + 10, 70, '#ffe6bb', 0.3);
  ctx.restore();
}

/**
 * Roof furniture and the building's mark.
 *
 * The glyph goes on the roof plate rather than the facade: it stays legible
 * when the player is standing right against the building, which is exactly
 * when the facade is hidden behind their own avatar.
 */
function paintRoofDetail(ctx, { rBL, rBR, rFL }, location, accent, random) {
  const w = rBR.x - rBL.x;
  const h = rFL.y - rBL.y;

  // Plant: housings, vents and a skylight run.
  ctx.fillStyle = rgba('#2a3356', 0.95);
  for (let i = 0; i < 4; i += 1) {
    const bw = 22 + random() * 40;
    const bh = 16 + random() * 26;
    const bx = rBL.x + 18 + random() * (w - bw - 36);
    const by = rBL.y + 16 + random() * (h - bh - 32);
    roundRect(ctx, bx, by, bw, bh, 5);
    ctx.fill();
    ctx.strokeStyle = rgba('#49568a', 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Parapet.
  ctx.strokeStyle = rgba(accent, 0.3);
  ctx.lineWidth = 2;
  roundRect(ctx, rBL.x + 7, rBL.y + 7, w - 14, h - 14, 10);
  ctx.stroke();

  // Aircraft warning light.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, rBR.x - 20, rBR.y + 18, 26, '#ff6b6b', 0.5);
  ctx.restore();

  if (location.glyph) {
    ctx.save();
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.3)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(accent, 0.22);
    ctx.fillText(location.glyph, rBL.x + w / 2, rBL.y + h / 2);
    ctx.restore();
  }
}

/** Open space: an inlaid civic square, flush with the pavement. */
function paintPlaza(ctx, location, halfW, halfH, random) {
  const accent = location.accent;

  const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
  grad.addColorStop(0, '#1e2742');
  grad.addColorStop(1, '#19213a');
  ctx.fillStyle = grad;
  roundRect(ctx, -halfW, -halfH, halfW * 2, halfH * 2, 28);
  ctx.fill();

  // Radial paving, which is what makes a square read as a destination rather
  // than as a gap between buildings.
  ctx.save();
  roundRect(ctx, -halfW, -halfH, halfW * 2, halfH * 2, 28);
  ctx.clip();
  ctx.strokeStyle = rgba('#3b4875', 0.5);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 44, Math.sin(angle) * 44);
    ctx.lineTo(Math.cos(angle) * 460, Math.sin(angle) * 460);
    ctx.stroke();
  }
  for (let r = 70; r < 300; r += 42) {
    ctx.strokeStyle = rgba('#3b4875', 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = rgba(accent, 0.55);
  ctx.lineWidth = 3;
  roundRect(ctx, -halfW, -halfH, halfW * 2, halfH * 2, 28);
  ctx.stroke();

  // Benches around the edge, and planters at the corners.
  ctx.fillStyle = rgba('#2c3658', 0.95);
  for (let i = 0; i < 6; i += 1) {
    const bx = -halfW + 70 + i * ((halfW * 2 - 140) / 5);
    roundRect(ctx, bx - 22, halfH - 46, 44, 12, 5);
    ctx.fill();
    roundRect(ctx, bx - 22, -halfH + 34, 44, 12, 5);
    ctx.fill();
  }

  // The centrepiece: a lit disc, the thing the concept art was missing.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 150, accent, 0.3);
  ctx.restore();

  ctx.fillStyle = rgba(accent, 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.font = '700 34px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(accent, 0.85);
  ctx.fillText(location.glyph ?? '', 0, 2);
  ctx.restore();
  void random;
}
