/**
 * The painted city: what the art is, and how it is cut up.
 *
 * Route B of the redesign replaces the drawn city with an illustration. Three
 * images per view do the whole job:
 *
 *   base   everything the player walks in FRONT of — ground, roads, the far
 *          side of the street, building faces seen head on
 *   over   everything the player can pass BEHIND, on a transparent layer:
 *          the near edges of buildings, foreground trees, parked vehicles.
 *          OPTIONAL — see below
 *   mask   where the player may not stand. Opaque is solid, transparent is
 *          floor; see walkMask.js
 *
 * WHY `over` IS ONE IMAGE AND NOT ONE PER BUILDING. A single foreground layer
 * cannot sort against the player on its own — you need to be behind the
 * building at the top of the street and in front of the one at the bottom.
 * Cutting the art into one sprite per building would solve that and would also
 * mean the artist exporting, naming and positioning forty files per district.
 * Instead the engine slices `over` into horizontal bands and gives each band
 * the depth of its own bottom edge. A band above the player draws behind them,
 * a band below draws in front, and the art stays two files.
 *
 * The band height is the one tuning knob: too tall and a player standing
 * beside a building pops in front of its roof, too short and the scene costs
 * more draw calls than it needs.
 */

/**
 * How tall each slice of the foreground layer is, in world pixels.
 *
 * 64 is roughly a third of a building's visible height at the current scale,
 * which is fine enough that walking up a street reads correctly and coarse
 * enough that a full district is tens of slices rather than hundreds.
 */
export const BAND_HEIGHT = 64;

/**
 * @typedef {Object} CityBackdrop
 * @property {string} base   texture key for the ground layer
 * @property {string} [over] texture key for the foreground layer, if there is one
 * @property {string} mask   texture key for the walk mask
 * @property {number} width  the art's width in world pixels
 * @property {number} height the art's height in world pixels
 */

/**
 * The art for Grooveli City, or null while there is none.
 *
 * Null is the working state today and the city falls back to the drawn
 * renderer, so the two can live side by side while the illustrations are
 * produced. Filling this in is what switches the city over — one data change,
 * no code change, and reversible by setting it back to null if the art is not
 * ready.
 *
 * Paths are relative to `public/`, so `city/plaza-base.webp` is served at
 * `/city/plaza-base.webp`.
 *
 * @type {{ base: string, over: string, mask: string, width: number, height: number } | null}
 */
export const CITY_BACKDROP = null;

/**
 * WHY `over` IS OPTIONAL.
 *
 * Image generators produce one flat picture. They cannot export a separate
 * transparent foreground, so the only ways to get one are to cut it out by
 * hand afterwards or to not have one. For an open space — a plaza, a park,
 * a wide junction — not having one is the right answer: there is almost
 * nothing to walk behind, so the player drawing in front of everything is
 * correct nearly all of the time.
 *
 * Dense streets are the opposite, and those districts will need the cut-out.
 * Making the layer optional means a district can ship flat and gain depth
 * later without the engine changing.
 */

/**
 * Cut the foreground layer into depth-sorted bands.
 *
 * Each band is a crop of the same texture, drawn at its own position, with a
 * depth equal to the y of its bottom edge — the same number the buildings and
 * the player already sort by, so the painted city slots into the existing
 * depth system rather than introducing a second one.
 *
 * @param {number} height the art's full height in world pixels
 * @param {number} [bandHeight]
 * @returns {{ y: number, height: number, depth: number }[]} top to bottom
 */
export function sliceBands(height, bandHeight = BAND_HEIGHT) {
  if (!(height > 0) || !(bandHeight > 0)) return [];

  const bands = [];
  for (let y = 0; y < height; y += bandHeight) {
    // The last band is short when the art is not a whole number of bands.
    // Clamping keeps the crop inside the texture; a band reaching past the
    // bottom would sample empty pixels and show as a seam.
    const h = Math.min(bandHeight, height - y);
    bands.push({ y, height: h, depth: y + h });
  }
  return bands;
}
