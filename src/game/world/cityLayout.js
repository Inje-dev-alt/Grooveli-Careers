import { WORLD, cityLocations } from './locations.js';

/**
 * The parts of the city that are scenery rather than destinations: roads,
 * parks, planting and street furniture.
 *
 * None of it is interactive and none of it collides — it exists so the eleven
 * landmarks read as a city rather than eleven boxes on a field. Everything is
 * placed deterministically, so the city looks identical on every load.
 */

/** Road corridors, laid out in the gaps between the building rows and columns. */
export const roads = [
  // Ring and cross streets
  { x: 40, y: 580, width: WORLD.width - 80, height: 118, orientation: 'h' },
  { x: 40, y: 1148, width: WORLD.width - 80, height: 118, orientation: 'h' },
  { x: 690, y: 110, width: 118, height: WORLD.height - 220, orientation: 'v' },
  { x: 2010, y: 110, width: 118, height: WORLD.height - 220, orientation: 'v' },
  // Short connectors into the central landmarks
  { x: 1372, y: 110, width: 104, height: 490, orientation: 'v' },
  { x: 1248, y: 1028, width: 104, height: 300, orientation: 'v' },
];

/** Green space. Soft shapes that break up the grid. */
export const parks = [
  { x: 900, y: 760, width: 300, height: 320, shape: 'rounded' },
  { x: 1560, y: 760, width: 300, height: 320, shape: 'rounded' },
  { x: 1000, y: 1330, width: 180, height: 260, shape: 'rounded' },
  { x: 1430, y: 1330, width: 180, height: 260, shape: 'rounded' },
  { x: 220, y: 640, width: 380, height: 180, shape: 'rounded' },
  { x: 2150, y: 1180, width: 420, height: 160, shape: 'rounded' },
];

/** Pedestrian crossings where a road meets a landmark approach. */
export const crosswalks = [
  { x: 440, y: 580, width: 120, height: 118, orientation: 'h' },
  { x: 1090, y: 580, width: 120, height: 118, orientation: 'h' },
  { x: 2300, y: 580, width: 120, height: 118, orientation: 'h' },
  { x: 440, y: 1148, width: 120, height: 118, orientation: 'h' },
  { x: 1800, y: 1148, width: 120, height: 118, orientation: 'h' },
  { x: 2300, y: 1148, width: 120, height: 118, orientation: 'h' },
  { x: 690, y: 330, width: 118, height: 120, orientation: 'v' },
  { x: 690, y: 900, width: 118, height: 120, orientation: 'v' },
  { x: 2010, y: 900, width: 118, height: 120, orientation: 'v' },
];

/**
 * Small deterministic generator. Props must land in the same place every load,
 * so the city does not shuffle itself between sessions.
 */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function overlapsAnything(x, y, radius) {
  const hitsLocation = cityLocations.some((location) => {
    const halfW = location.size.width / 2 + radius + 26;
    const halfH = location.size.height / 2 + radius + 26;
    return (
      Math.abs(x - location.position.x) < halfW && Math.abs(y - location.position.y) < halfH
    );
  });
  if (hitsLocation) return true;

  return roads.some(
    (road) =>
      x > road.x - radius && x < road.x + road.width + radius &&
      y > road.y - radius && y < road.y + road.height + radius,
  );
}

/** Planting, scattered across the open ground and the parks. */
export function generateTrees() {
  const random = createRandom(20260601);
  const trees = [];

  parks.forEach((park, parkIndex) => {
    const count = Math.round((park.width * park.height) / 9000);
    for (let i = 0; i < count; i += 1) {
      trees.push({
        x: park.x + 26 + random() * (park.width - 52),
        y: park.y + 26 + random() * (park.height - 52),
        radius: 13 + random() * 9,
        variant: (parkIndex + i) % 3,
      });
    }
  });

  // A thinner scatter across the rest of the city, skipping roads and buildings.
  let attempts = 0;
  while (trees.length < 170 && attempts < 1400) {
    attempts += 1;
    const x = 80 + random() * (WORLD.width - 160);
    const y = 80 + random() * (WORLD.height - 160);
    if (overlapsAnything(x, y, 22)) continue;
    trees.push({ x, y, radius: 11 + random() * 8, variant: attempts % 3 });
  }

  return trees;
}

/** Street lamps along both edges of every road. */
export function generateStreetLamps() {
  const lamps = [];
  const spacing = 260;

  roads.forEach((road) => {
    if (road.orientation === 'h') {
      for (let x = road.x + 90; x < road.x + road.width - 60; x += spacing) {
        lamps.push({ x, y: road.y - 14 });
        lamps.push({ x: x + spacing / 2, y: road.y + road.height + 14 });
      }
    } else {
      for (let y = road.y + 90; y < road.y + road.height - 60; y += spacing) {
        lamps.push({ x: road.x - 14, y });
        lamps.push({ x: road.x + road.width + 14, y: y + spacing / 2 });
      }
    }
  });

  return lamps;
}

/** Palette for the world renderer. Mirrors the interface tokens. */
export const worldPalette = {
  ground: 0x0c1324,
  groundAlt: 0x111a30,
  grid: 0x1a2440,
  road: 0x1b2440,
  roadEdge: 0x3a4870,
  roadMark: 0x8294c4,
  park: 0x16452c,
  parkEdge: 0x2f7a4c,
  tree: [0x35996a, 0x3fb078, 0x4ecb8c],
  treeShade: 0x1f5c3c,
  lamp: 0x55638a,
  lampGlow: 0xffe9b8,
  buildingShadow: 0x04070f,
  buildingSide: 0x27325a,
  buildingFace: 0x3b4a7d,
  buildingTop: 0x4e5e98,
  buildingEdge: 0x6f82c4,
  windowDark: 0x151d33,
  /*
   * Lit windows are WARM, not the district's accent.
   *
   * Accent-coloured windows read as signage; warm ones read as somebody
   * working late, which is the whole subject of this product. The accent
   * stays, used on a minority of windows, so a district still has a colour
   * signature without the city looking lit by LEDs.
   */
  windowLit: 0xffd9a0,
  windowLitAlt: 0xffc46b,
  windowGlow: 0xffb45c,
  /* Pooled light on the pavement under a lamp. */
  lampPool: 0xffd9a0,

  /*
   * Second tones.
   *
   * A gradient needs two colours; a flat fill is the single clearest signal
   * that something was drawn rather than rendered. Each of these is the same
   * hue as its partner, darker, so a surface falls away from its lit edge
   * instead of changing colour.
   */
  groundDeep: 0x070c18,
  roadDeep: 0x121a30,
  buildingFaceDeep: 0x29345c,
  buildingTopDeep: 0x3a4876,
  parkDeep: 0x0f3020,
  plazaDeep: 0x18213c,
  plaza: 0x222e52,
  plazaInlay: 0x46589a,
};
