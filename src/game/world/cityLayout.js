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
  ground: 0x151d33,
  groundAlt: 0x1a2340,
  grid: 0x222d4c,
  road: 0x242e49,
  roadEdge: 0x323e60,
  roadMark: 0x5d6c92,
  park: 0x1b3d2a,
  parkEdge: 0x2a6240,
  tree: [0x2f8458, 0x379a66, 0x44b377],
  treeShade: 0x1f5c3c,
  lamp: 0x55638a,
  lampGlow: 0xffe9b8,
  buildingShadow: 0x070b16,
  buildingSide: 0x2a3454,
  buildingFace: 0x36426a,
  buildingTop: 0x44527e,
  buildingEdge: 0x5a6a9c,
  windowDark: 0x1d2742,
  plaza: 0x26314f,
  plazaInlay: 0x3a4871,
};
