/**
 * Turning a painted walk mask into collision rectangles.
 *
 * Route B of the city redesign puts an illustration where the drawn city used
 * to be. The illustration says nothing about where a player may stand, so the
 * artist supplies a second image the same size: anything opaque is solid,
 * anything transparent is floor. Painting over a building is the whole
 * authoring step, which is why the mask is an image and not a list of
 * coordinates nobody would enjoy maintaining.
 *
 * This module is deliberately pure — pixels in, rectangles out, no Phaser.
 * It is the part most likely to be subtly wrong (an off-by-one here is a wall
 * the player can walk through, or an invisible one in the middle of a road),
 * and pure functions can be tested properly without a browser.
 */

/** Pixels at or above this alpha count as solid. */
export const SOLID_ALPHA = 128;

/**
 * How big a collision cell is, in pixels of the mask.
 *
 * The mask is sampled on a grid rather than per pixel. 16 is fine enough that
 * a doorway reads correctly and coarse enough that a full district produces
 * hundreds of bodies rather than hundreds of thousands — the physics engine
 * walks every static body it owns, so the count is the thing that matters.
 */
export const CELL = 16;

/**
 * Is this cell solid?
 *
 * A cell counts as solid when ENOUGH of it is painted, not when any of it is.
 * Sampling one pixel would make the result depend on exactly where the grid
 * happened to fall across an edge, so a wall could gain or lose a cell of
 * thickness for no reason the artist could see.
 */
function cellIsSolid(pixels, imageWidth, cellX, cellY, cell, coverage) {
  let painted = 0;
  let counted = 0;

  for (let y = 0; y < cell; y += 1) {
    const py = cellY + y;
    for (let x = 0; x < cell; x += 1) {
      const px = cellX + x;
      // Cells on the right and bottom edges hang off the image; the part that
      // hangs off is not evidence either way, so it is not counted.
      const index = (py * imageWidth + px) * 4;
      if (index + 3 >= pixels.length) continue;
      counted += 1;
      if (pixels[index + 3] >= SOLID_ALPHA) painted += 1;
    }
  }

  if (counted === 0) return false;
  return painted / counted >= coverage;
}

/**
 * Decode a walk mask into a grid of solid cells.
 *
 * @param {Uint8ClampedArray | number[]} pixels RGBA, four entries per pixel
 * @param {number} width image width in pixels
 * @param {number} height image height in pixels
 * @param {{ cell?: number, coverage?: number }} [options]
 * @returns {{ cols: number, rows: number, cell: number, solid: boolean[] }}
 */
export function decodeMaskGrid(pixels, width, height, { cell = CELL, coverage = 0.5 } = {}) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const solid = new Array(cols * rows).fill(false);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      solid[row * cols + col] = cellIsSolid(pixels, width, col * cell, row * cell, cell, coverage);
    }
  }

  return { cols, rows, cell, solid };
}

/**
 * Merge a grid of solid cells into as few rectangles as possible.
 *
 * Greedy: take the first unclaimed solid cell, run right as far as the solid
 * cells continue, then run down as far as every row below matches that full
 * width, claim the block, repeat. It does not produce the theoretical minimum
 * covering — that problem is far more expensive — but it turns a wall into
 * one long rectangle instead of forty small ones, which is the whole point.
 *
 * Fewer bodies is not cosmetic here. Arcade physics tests the player against
 * every static body each frame, so a district left as raw cells would cost
 * thousands of tests per frame where this costs dozens.
 *
 * @returns {{ x: number, y: number, width: number, height: number }[]} rects in
 *   image pixels, positioned by their top-left corner
 */
export function mergeSolidCells({ cols, rows, cell, solid }) {
  const claimed = new Array(cols * rows).fill(false);
  const rects = [];

  const at = (col, row) => solid[row * cols + col] && !claimed[row * cols + col];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!at(col, row)) continue;

      let width = 0;
      while (col + width < cols && at(col + width, row)) width += 1;

      let height = 1;
      while (row + height < rows) {
        let full = true;
        for (let x = 0; x < width; x += 1) {
          if (!at(col + x, row + height)) {
            full = false;
            break;
          }
        }
        if (!full) break;
        height += 1;
      }

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          claimed[(row + y) * cols + col + x] = true;
        }
      }

      rects.push({
        x: col * cell,
        y: row * cell,
        width: width * cell,
        height: height * cell,
      });
    }
  }

  return rects;
}

/**
 * Pixels to collision rectangles, in one call.
 *
 * @param {Uint8ClampedArray | number[]} pixels RGBA
 * @param {number} width
 * @param {number} height
 * @param {{ cell?: number, coverage?: number }} [options]
 */
export function walkMaskToRects(pixels, width, height, options) {
  return mergeSolidCells(decodeMaskGrid(pixels, width, height, options));
}
