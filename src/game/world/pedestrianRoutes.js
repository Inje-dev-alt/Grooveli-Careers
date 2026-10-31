import { roads } from './cityLayout.js';
import { WORLD } from './locations.js';

/**
 * Where ambient pedestrians walk, and the maths for walking it.
 *
 * Routes are closed loops of waypoints laid along the pavements beside the
 * roads in `cityLayout.js`. Loops rather than paths so nobody has to decide
 * what happens at the end, and waypoints rather than curves because a city
 * block turns square corners anyway.
 *
 * The geometry here is pure — points in, position out — so it can be tested
 * without a canvas. The entity that draws a walker is in
 * `entities/Pedestrian.js` and knows nothing about where the pavements are.
 */

/** How far from a road's edge the pavement centre sits. */
const PAVEMENT = 16;

/** Pavement lines either side of each road, derived rather than retyped. */
const edges = (() => {
  const h = roads.filter((r) => r.orientation === 'h');
  const v = roads.filter((r) => r.orientation === 'v');
  return {
    /** y of the pavement above and below each horizontal road. */
    above: h.map((r) => r.y - PAVEMENT),
    below: h.map((r) => r.y + r.height + PAVEMENT),
    /** x of the pavement left and right of each vertical road. */
    left: v.map((r) => r.x - PAVEMENT),
    right: v.map((r) => r.x + r.width + PAVEMENT),
  };
})();

const rect = (x1, y1, x2, y2) => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/**
 * The loops.
 *
 * Derived from the road layout rather than hand-typed, so moving a street
 * moves the people on it instead of leaving them walking through traffic.
 *
 * @type {{ x: number, y: number }[][]}
 */
export const pedestrianRoutes = [
  // The central block, between both cross streets and both avenues.
  rect(edges.right[0], edges.below[0], edges.left[1], edges.above[1]),
  // The outer ring, hugging the far pavements.
  rect(edges.left[0], edges.above[0], edges.right[1], edges.below[1]),
  // A band along the upper cross street, crossing between its two pavements.
  [
    { x: edges.right[0] + 120, y: edges.above[0] },
    { x: edges.left[1] - 180, y: edges.above[0] },
    { x: edges.left[1] - 180, y: edges.below[0] },
    { x: edges.right[0] + 120, y: edges.below[0] },
  ],
  // A shorter stroll on the lower cross street.
  [
    { x: edges.right[0] + 260, y: edges.above[1] },
    { x: edges.left[1] - 420, y: edges.above[1] },
    { x: edges.left[1] - 420, y: edges.below[1] },
    { x: edges.right[0] + 260, y: edges.below[1] },
  ],
  // Up and down the western avenue.
  [
    { x: edges.left[0], y: edges.below[0] + 60 },
    { x: edges.left[0], y: edges.above[1] - 60 },
    { x: edges.right[0], y: edges.above[1] - 60 },
    { x: edges.right[0], y: edges.below[0] + 60 },
  ],
];

/** Segment lengths and the total, precomputed once per route. */
export function measureRoute(points) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, length });
    total += length;
  }
  return { segments, total };
}

/** 'up' | 'down' | 'left' | 'right' for a segment, by its dominant axis. */
export function headingOf(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

/**
 * Where a walker is after travelling `distance` around a loop.
 *
 * Wraps, so a walker never reaches an end and never needs restarting.
 *
 * @returns {{ x: number, y: number, direction: string }}
 */
export function pointAtDistance(measured, distance) {
  const { segments, total } = measured;
  if (!total) {
    const a = segments[0]?.a ?? { x: 0, y: 0 };
    return { x: a.x, y: a.y, direction: 'down' };
  }

  // Modulo twice: a negative offset is a legitimate way to stagger walkers,
  // and JavaScript's % keeps the sign of the dividend.
  let remaining = ((distance % total) + total) % total;

  for (const segment of segments) {
    if (remaining <= segment.length) {
      const t = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: segment.a.y + (segment.b.y - segment.a.y) * t,
        direction: headingOf(segment.a, segment.b),
      };
    }
    remaining -= segment.length;
  }

  // Floating point can leave a sliver after the last segment.
  const last = segments[segments.length - 1];
  return { x: last.b.x, y: last.b.y, direction: headingOf(last.a, last.b) };
}

/** Every route point must be inside the world, or walkers stroll into the void. */
export function routesAreInBounds() {
  return pedestrianRoutes.every((route) =>
    route.every((p) => p.x >= 0 && p.x <= WORLD.width && p.y >= 0 && p.y <= WORLD.height),
  );
}
