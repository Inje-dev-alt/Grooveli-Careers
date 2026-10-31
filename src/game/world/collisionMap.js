/**
 * Turn the baked collision mask into physics bodies.
 *
 * The old scene gave every building a single rectangle the size of its
 * footprint, which meant the walkable space could only ever be the inverse of
 * eleven rectangles. The mask is a grid, so it can describe a courtyard, an
 * archway, a colonnade or an L-shaped block — and because the same bake writes
 * both the mask and the artwork, what you can walk into always matches what you
 * can see.
 *
 * A body per blocked cell would be twelve thousand bodies. Instead the grid is
 * decomposed into a small number of rectangles: runs are merged along each row,
 * then rows with identical runs are merged downward. For the current city that
 * is roughly two hundred bodies, which Arcade physics handles without noticing.
 */

/**
 * @param {{ cell: number, cols: number, rows: number, grid: string[] }} collision
 * @returns {{ x: number, y: number, width: number, height: number }[]} world-space rectangles
 */
export function buildCollisionRects(collision) {
  const { cell, cols, rows, grid } = collision;

  // Horizontal runs, row by row.
  /** @type {{ start: number, end: number }[][]} */
  const runsByRow = [];
  for (let row = 0; row < rows; row += 1) {
    const line = grid[row];
    const runs = [];
    let start = -1;
    for (let col = 0; col <= cols; col += 1) {
      const blocked = col < cols && line[col] === '#';
      if (blocked && start === -1) start = col;
      if (!blocked && start !== -1) {
        runs.push({ start, end: col });
        start = -1;
      }
    }
    runsByRow.push(runs);
  }

  // Merge a run downward for as long as the row below carries the same span.
  const consumed = runsByRow.map((runs) => runs.map(() => false));
  const rects = [];

  for (let row = 0; row < rows; row += 1) {
    runsByRow[row].forEach((run, index) => {
      if (consumed[row][index]) return;

      let height = 1;
      for (let next = row + 1; next < rows; next += 1) {
        const match = runsByRow[next].findIndex(
          (candidate, i) => !consumed[next][i] && candidate.start === run.start && candidate.end === run.end,
        );
        if (match === -1) break;
        consumed[next][match] = true;
        height += 1;
      }

      rects.push({
        x: run.start * cell,
        y: row * cell,
        width: (run.end - run.start) * cell,
        height: height * cell,
      });
    });
  }

  return rects;
}

/** Is this world point inside blocked space? Used by the ambient spawners. */
export function isBlocked(collision, x, y) {
  const col = Math.floor(x / collision.cell);
  const row = Math.floor(y / collision.cell);
  if (row < 0 || row >= collision.rows || col < 0 || col >= collision.cols) return true;
  return collision.grid[row][col] === '#';
}
