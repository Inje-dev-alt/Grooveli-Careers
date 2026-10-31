import { roads, crosswalks } from './cityLayout.js';

/**
 * Where traffic drives, and where it has to slow down.
 *
 * Two loops around the central blocks: an inner one running clockwise and an
 * outer one the other way, each sitting in its own lane of the same roads.
 * Loops rather than straight runs with a wrap, because a vehicle that
 * teleports from one edge of the view to the other is the single most obvious
 * thing a player can catch scenery doing.
 *
 * Both are derived from the road rectangles, so moving a street moves the
 * traffic on it. Pure data and pure maths — the entity that draws a vehicle
 * knows none of this.
 */

/** Where in a road's width a lane sits, as a fraction. */
const NEAR_LANE = 0.28;
const FAR_LANE = 0.72;

const horizontal = roads.filter((r) => r.orientation === 'h');
const vertical = roads.filter((r) => r.orientation === 'v');

const laneY = (road, fraction) => road.y + road.height * fraction;
const laneX = (road, fraction) => road.x + road.width * fraction;

const rect = (x1, y1, x2, y2) => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/**
 * The two circuits.
 *
 * The inner loop takes the far lane of the top road and the near lane of the
 * bottom one, so the two circuits never share tarmac and never drive through
 * each other.
 *
 * @type {{ x: number, y: number }[][]}
 */
export const trafficRoutes = [
  // Inner circuit.
  rect(
    laneX(vertical[0], FAR_LANE),
    laneY(horizontal[0], FAR_LANE),
    laneX(vertical[1], NEAR_LANE),
    laneY(horizontal[1], NEAR_LANE),
  ),
  // Outer circuit, in the other lanes.
  rect(
    laneX(vertical[0], NEAR_LANE),
    laneY(horizontal[0], NEAR_LANE),
    laneX(vertical[1], FAR_LANE),
    laneY(horizontal[1], FAR_LANE),
  ),
];

/** Centre of each crossing, which is what a vehicle measures itself against. */
export const crossingPoints = crosswalks.map((c) => ({
  x: c.x + c.width / 2,
  y: c.y + c.height / 2,
}));

/** How far out a vehicle starts easing off. */
export const SLOW_RADIUS = 150;
/** The slowest it gets, as a fraction of its cruising speed. */
export const SLOW_FACTOR = 0.35;

/**
 * Speed multiplier for a vehicle at this point.
 *
 * Vehicles ease off near a crossing and pick up again after it. They are not
 * reacting to anybody — ambient pedestrians have no physics and no claim on
 * the road — but traffic that slows at the painted lines and nowhere else
 * reads as traffic that is paying attention, which is the whole illusion.
 *
 * Returns 1 away from crossings, falling to SLOW_FACTOR at one.
 */
export function speedFactorAt(x, y) {
  let nearest = Infinity;
  for (const point of crossingPoints) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < nearest) nearest = distance;
  }

  if (nearest >= SLOW_RADIUS) return 1;
  const closeness = 1 - nearest / SLOW_RADIUS;
  return 1 - closeness * (1 - SLOW_FACTOR);
}
