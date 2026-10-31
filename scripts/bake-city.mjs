/**
 * Bake Grooveli City.
 *
 * Runs the city painter once, offline, and writes the result as flat assets:
 *
 *   public/city/plate.png              the whole ground plane, one image
 *   public/city/buildings/<id>.png     one sprite per location
 *   art/city/collision.png             the walkable mask, white = blocked
 *   src/game/world/cityManifest.json   anchors, sizes and the collision grid
 *
 * The manifest goes into src rather than public so the game can import it
 * directly: anchors and collision are needed before the first frame, and a
 * static import removes a fetch, a race and a failure mode.
 *
 * The point of doing this offline is that detail stops costing load time. The
 * runtime renderer bakes too, but it bakes in the browser while the player
 * waits, on every visit, so its artwork has to stay cheap. Here the drawing
 * happens once on a build machine and the browser receives finished pixels.
 *
 * It also makes the art replaceable. Every file above is an ordinary PNG at a
 * known size and anchor, so a commissioned plate or a hand-drawn tower can be
 * dropped in over the generated one without touching a line of game code.
 *
 * Collision is derived from art/city/collision.png rather than from the building
 * rectangles, so it can describe shapes the geometry cannot — a courtyard, a
 * colonnade, an L-shaped block. If you hand-edit that file, re-run with no
 * flags and the walkable space follows your edit. Pass --regen-mask to throw
 * your edits away and rebuild it from the layout data.
 *
 * Playwright supplies the 2D context. It is a build-time dependency only —
 * nothing it touches ships to the browser — so the script resolves it from the
 * project or from NODE_PATH rather than forcing it into package.json.
 *
 * Usage:  node scripts/bake-city.mjs [--regen-mask]
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { WORLD, cityLocations } from '../src/game/world/locations.js';
import { roads, approaches, parks, crosswalks, billboards, generateTrees, generateStreetLamps } from '../src/game/world/cityLayout.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'public', 'city');
const buildingsDir = join(outDir, 'buildings');
/**
 * The mask is an authoring source, not a runtime asset — the game reads the
 * grid out of the manifest and never fetches the image. Keeping it outside
 * public/ is what stops a hundred kilobytes of editing aid being served to
 * every player.
 */
const artDir = join(root, 'art', 'city');

/** Size of one collision cell, in world pixels. */
const CELL = 20;

const regenMask = process.argv.includes('--regen-mask');

/**
 * The plate is a 2680x1820 night scene — smooth gradients, soft glows and very
 * few hard edges, which is close to the worst case for PNG and close to the
 * best case for WebP. Encoding it as PNG cost 3.7MB; lossy WebP at this quality
 * is visually indistinguishable at a tenth of that, and a browser game cannot
 * spend four megabytes on a background.
 *
 * Building sprites get the same treatment at a higher quality: they carry an
 * alpha channel and sit over the plate, so edge fringing would show. WebP
 * keeps the alpha and still beats PNG by roughly eight to one here.
 */
const PLATE_FORMAT = { mime: 'image/webp', quality: 0.9, extension: 'webp' };
const SPRITE_FORMAT = { mime: 'image/webp', quality: 0.95, extension: 'webp' };

/**
 * `require` consults NODE_PATH where a bare ESM import does not, which is what
 * lets a globally installed Playwright serve a project that does not list it.
 */
function loadChromium() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright').chromium;
  } catch {
    throw new Error(
      'Playwright is required to bake the city.\n' +
        '  npm i -D playwright && npx playwright install chromium\n' +
        '  — or point NODE_PATH at an existing install.',
    );
  }
}

/**
 * The painter is written without imports precisely so it can be injected into
 * a page as a classic script. Dropping the `export` keywords is the whole of
 * the transform — there is no bundler in this path.
 */
async function painterSource() {
  const source = await readFile(join(root, 'src/game/world/platePainter.js'), 'utf8');
  return source.replace(/^export /gm, '');
}

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function main() {
  await mkdir(buildingsDir, { recursive: true });
  await mkdir(artDir, { recursive: true });

  const model = {
    world: { width: WORLD.width, height: WORLD.height },
    roads,
    approaches,
    parks,
    billboards,
    crosswalks,
    trees: generateTrees(),
    lamps: generateStreetLamps(),
    locations: cityLocations,
  };

  const existingMask = join(artDir, 'collision.png');
  const reuseMask = !regenMask && existsSync(existingMask);
  const maskDataUrl = reuseMask
    ? `data:image/png;base64,${(await readFile(existingMask)).toString('base64')}`
    : null;

  const browser = await loadChromium().launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');
  await page.addScriptTag({ content: await painterSource() });

  console.log(`city: ${model.locations.length} locations, ${model.trees.length} trees, ${model.lamps.length} lamps`);

  /* ---------------------------------------------------------- ground plate */

  const plate = await page.evaluate(
    ({ m, format }) => {
      const canvas = document.createElement('canvas');
      canvas.width = m.world.width;
      canvas.height = m.world.height;
      const ctx = canvas.getContext('2d');
      paintGround(ctx, m);
      return canvas.toDataURL(format.mime, format.quality);
    },
    { m: model, format: PLATE_FORMAT },
  );
  const plateFile = `plate.${PLATE_FORMAT.extension}`;
  const plateBuffer = dataUrlToBuffer(plate);
  await writeFile(join(outDir, plateFile), plateBuffer);
  console.log(
    `${plateFile.padEnd(20)} ${model.world.width}x${model.world.height}, ${(plateBuffer.length / 1024).toFixed(0)}KB`,
  );

  /* ------------------------------------------------------ building sprites */

  const manifestBuildings = [];
  let spriteBytes = 0;
  for (const location of model.locations) {
    const baked = await page.evaluate(
      ({ loc, world, format }) => {
        const pad = buildingPadding(loc, world);
        const width = Math.ceil(loc.size.width + pad.left + pad.right);
        const height = Math.ceil(loc.size.height + pad.top + pad.bottom);
        const anchorX = pad.left + loc.size.width / 2;
        const anchorY = pad.top + loc.size.height / 2;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Put the origin on the centre of the footprint; the painter works in
        // footprint-relative coordinates and never needs to know the padding.
        ctx.translate(anchorX, anchorY);
        paintBuilding(ctx, loc, { world });

        return { url: canvas.toDataURL(format.mime, format.quality), width, height, anchorX, anchorY };
      },
      { loc: location, world: model.world, format: SPRITE_FORMAT },
    );

    const spriteBuffer = dataUrlToBuffer(baked.url);
    spriteBytes += spriteBuffer.length;
    await writeFile(join(buildingsDir, `${location.id}.${SPRITE_FORMAT.extension}`), spriteBuffer);
    manifestBuildings.push({
      id: location.id,
      file: `buildings/${location.id}.${SPRITE_FORMAT.extension}`,
      width: baked.width,
      height: baked.height,
      anchorX: baked.anchorX,
      anchorY: baked.anchorY,
      walkable: Boolean(location.walkable),
    });
    console.log(`  ${location.id.padEnd(22)} ${baked.width}x${baked.height}`);
  }
  console.log(`${String(manifestBuildings.length).padStart(2)} building sprites     ${(spriteBytes / 1024).toFixed(0)}KB total`);

  /* --------------------------------------------------------- collision map */

  const collision = await page.evaluate(
    async ({ m, cell, maskUrl }) => {
      const canvas = document.createElement('canvas');
      canvas.width = m.world.width;
      canvas.height = m.world.height;
      const ctx = canvas.getContext('2d');

      if (maskUrl) {
        // Honour a hand-edited mask: whatever the artist painted is the truth.
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = maskUrl;
        });
        ctx.drawImage(image, 0, 0, m.world.width, m.world.height);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, m.world.width, m.world.height);
        ctx.fillStyle = '#fff';
        m.locations.forEach((loc) => {
          if (loc.walkable) return;
          ctx.fillRect(
            loc.position.x - loc.size.width / 2,
            loc.position.y - loc.size.height / 2,
            loc.size.width,
            loc.size.height,
          );
        });
        // Hoardings are solid: you walk around a billboard, not through one.
        m.billboards.forEach((board) => {
          ctx.fillRect(board.x - board.width / 2, board.y - 12, board.width, 24);
        });
        // Keep the player off the carriageway; the ambient traffic lives there.
        ctx.fillStyle = '#fff';
        m.roads.forEach((road) => ctx.fillRect(road.x, road.y, road.width, road.height));
        // ...except at the crossings, which are how you get across the city.
        ctx.fillStyle = '#000';
        m.crosswalks.forEach((walk) => ctx.fillRect(walk.x, walk.y, walk.width, walk.height));
      }

      const cols = Math.ceil(m.world.width / cell);
      const rows = Math.ceil(m.world.height / cell);
      const pixels = ctx.getImageData(0, 0, m.world.width, m.world.height).data;

      // A cell is blocked when the middle of it is painted. Sampling the centre
      // rather than averaging keeps thin painted lines from sealing a street.
      const grid = [];
      for (let row = 0; row < rows; row += 1) {
        let line = '';
        for (let col = 0; col < cols; col += 1) {
          const px = Math.min(m.world.width - 1, col * cell + cell / 2) | 0;
          const py = Math.min(m.world.height - 1, row * cell + cell / 2) | 0;
          const i = (py * m.world.width + px) * 4;
          line += pixels[i] > 127 ? '#' : '.';
        }
        grid.push(line);
      }

      return { url: canvas.toDataURL('image/png'), grid, cols, rows };
    },
    { m: model, cell: CELL, maskUrl: maskDataUrl },
  );

  if (!reuseMask) {
    await writeFile(existingMask, dataUrlToBuffer(collision.url));
  }

  const blocked = collision.grid.join('').split('#').length - 1;
  console.log(
    `collision.png        ${collision.cols}x${collision.rows} cells @ ${CELL}px — ` +
      `${blocked} blocked (${((blocked / (collision.cols * collision.rows)) * 100).toFixed(1)}%)` +
      `${reuseMask ? ' [reused hand-edited mask]' : ''}`,
  );

  await writeFile(
    join(root, 'src', 'game', 'world', 'cityManifest.json'),
    `${JSON.stringify(
      {
        world: model.world,
        plate: plateFile,
        buildings: manifestBuildings,
        collision: { cell: CELL, cols: collision.cols, rows: collision.rows, grid: collision.grid },
      },
      null,
      2,
    )}\n`,
  );

  await browser.close();
  console.log('cityManifest.json    written to src/game/world/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
