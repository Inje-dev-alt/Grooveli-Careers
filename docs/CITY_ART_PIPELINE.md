# The city art pipeline

Grooveli City can be drawn two ways. This document covers the baked pipeline,
which is the default, and how to replace its placeholder art with real art.

```
npm run bake:city      # draw the city, write the assets
npm run dev            # play it
```

## Why bake at all

The original renderer (`src/game/world/CityRenderer.js`) draws the city from
shapes when the scene starts, then caches the result into textures. It is not
naive, and its steady-state cost is low — measured at **3 GPU draw calls per
frame**.

The problem is *when* it draws. It draws in the player's browser, during scene
start, on every visit. Artwork there is paid for in load time by everyone, every
time, which caps how much of it there can be. That cap is what made the city
read as a floor plan: flat blocks, no facades, no traffic, nobody about.

Baking moves that work to a build machine. The painter currently spends about
**15,000 canvas operations** against the roughly 1,000 the runtime renderer can
justify, and could spend ten times more without a player noticing, because the
player never runs any of it.

### What it does not buy

It is **not** a frame-rate win, and nothing here should be sold as one. Measured
side by side on the same machine:

| | vector | baked |
|---|---|---|
| draw calls / frame | 3.0 | 7.0 |
| texture uploads / frame | 0 | 0 |
| shipped art | none | 528 KB |

The baked city costs *more* per frame, and the extra four calls are the eighty
ambient cars and pedestrians — not the scenery. That is the trade: four draw
calls for a city with people in it.

## What the bake writes

| Path | What it is | Ships? |
|---|---|---|
| `public/city/plate.webp` | The whole ground plane, one image (104 KB) | yes |
| `public/city/buildings/<id>.webp` | One sprite per location (392 KB total) | yes |
| `src/game/world/cityManifest.json` | Anchors, sizes, collision grid | yes |
| `art/city/collision.png` | The walkable mask — an editing aid | **no** |

The manifest lives in `src/` rather than `public/` because anchors and collision
are needed before the first frame; a static import removes a fetch, a race and a
failure mode. The mask lives outside `public/` because the game reads the grid
from the manifest and never fetches the image — serving it would be 100 KB spent
on nothing.

WebP rather than PNG: the plate is a night scene of smooth gradients and soft
glows, which is close to PNG's worst case. The same image is **3.7 MB as PNG and
104 KB as WebP**, and a browser game cannot spend four megabytes on a
background.

## Replacing the art

This is the part that matters. Every asset is a plain image at a size and anchor
the manifest records, so you can swap any of them for commissioned or generated
art without touching game code.

**One building.** Open `src/game/world/cityManifest.json`, find the entry, and
draw a replacement at exactly that `width` × `height`. The `anchorX`/`anchorY`
pair is where the centre of the footprint sits inside the image — keep the
building's base on that point and it will register against its collision and
depth-sort correctly however tall you make it. Save over
`public/city/buildings/<id>.webp`.

**The whole ground plane.** Draw at `world.width` × `world.height`
(2680 × 1820) and save over `public/city/plate.webp`.

**Do not re-run the bake after hand-replacing a sprite** — it will overwrite
your file. Either keep replacements in a separate folder and copy them in after
baking, or port the change into `platePainter.js` so the bake reproduces it.

## Collision

Collision does not come from the building rectangles. It comes from
`art/city/collision.png`, a black-and-white mask where **white is blocked**,
sampled into a 20 px grid and stored in the manifest.

That indirection is the point: a mask can describe a courtyard, an archway, a
colonnade or an L-shaped block, none of which a footprint rectangle can. It also
means the walkable space and the artwork come out of the same bake and cannot
drift apart.

To hand-author it, edit `art/city/collision.png` and re-run `npm run bake:city`.
The bake reads your edit and derives the grid from it. `--regen-mask` throws your
edits away and rebuilds the mask from the layout data.

At runtime `collisionMap.js` decomposes the grid into rectangles — merging runs
along each row, then merging identical runs downward. The current city becomes
**30 static bodies covering 4,341 blocked cells exactly**, with no over- or
under-coverage.

### Roads are blocked

Carriageways are not walkable; crossings are. This is what makes the grid read
as a city rather than a field, and it is why `cityLayout.js` distinguishes
`roads` from `approaches` — the two stubs that dead-end into landmarks were
never streets, and while they were classed as roads the AI Career Center's front
door opened onto a carriageway with no crossing, so it could not be reached at
all.

If you change the layout, check the city is still navigable:

```
node scripts/check-reachable.mjs
```

It flood-fills from the spawn point and asserts every location's approach is
connected.

## Ambient life

`src/game/world/ambient.js` puts traffic on the roads and people on the
pavements. None of it collides and none of it is interactive — it exists because
an empty city reads as a diagram.

Actors share about a dozen baked textures and are moved by arithmetic: no
physics bodies, no pathfinding, no per-frame allocation. Cars wrap around their
lane rather than turning, which needs no junction logic. Pedestrians walk a
segment and turn around, which is enough motion at the distance the camera sits.

## Switching back

```
VITE_CITY_RENDERER=vector npm run dev
```

The vector renderer needs no assets at all, which makes it a useful control when
something looks wrong: if a bug reproduces there too, it is not the art pipeline.
