# Grooveli City — art specification

Drop the district art here. The engine is already built and switched off; filling in
`CITY_BACKDROP` in `src/game/world/backdrop.js` turns it on.

## Canvas

**2680 × 1820 pixels**, exactly. This is not negotiable without re-deriving every
district coordinate in `locations.js` and retuning the doorway offsets, so the
generator's output gets cropped or padded to it rather than the world being
resized to the generator.

That ratio is **1.4725 : 1**. The nearest common generator ratio is **3:2**, so
generate at 3:2 and crop 2% off one axis. Generating larger than 2680 × 1820 and
scaling down is fine and usually better; generating smaller is not.

## Files per district

| File | What it is | How it is made |
| --- | --- | --- |
| `<district>-base.webp` | The whole scene, flat | Generated |
| `<district>-mask.png` | Where the player may not walk | Hand-painted over the base |
| `<district>-over.webp` | Foreground to pass behind — **optional** | Cut out of the base by hand |
| `<district>-night.webp` | Same scene after dark | Generated from the base |

Start with **base + mask only**. The plaza is an open square with almost nothing to
walk behind, so the foreground layer earns nothing there — the player drawing in
front of everything is correct nearly all of the time. Dense streets will need it.

---

## Prompt — plaza, day

> A vibrant top-down isometric view of a futuristic city plaza, seen from directly
> above at a fixed 45-degree bird's-eye angle. A large open paved public square sits
> in the centre, surrounded on all four sides by dense mid-rise and high-rise
> buildings with glass facades, balconies, rooftop gardens and glowing digital
> billboards. Wide roads with marked crossings run between the blocks. Street trees,
> planters, benches, bus shelters and street lamps line the pavements. Parked cars
> and buses sit at the kerbs. Bright midday sunlight, clear blue sky, crisp shadows
> falling consistently in one direction. Saturated colour, high contrast, clean
> stylised 3D render, sharp detail, game-ready environment art. Teal, deep blue and
> warm amber accent lighting. Even illumination across the entire frame.
>
> **No people. No moving vehicles. No user interface, no HUD, no text, no labels,
> no logos, no watermark, no border, no vignette, no frame.** Aspect ratio 3:2.

## Prompt — plaza, night

Generate this **from the day image** (image-to-image, or "same scene at night" with
the day render attached). Two separately generated images will not share a layout,
and day/night would become a teleport to a different city.

> The same city plaza at night, from the identical camera angle and with the
> identical building layout. Windows lit warm gold, neon and holographic signage
> glowing, street lamps casting pools of warm light on wet-looking pavement, car
> headlights on parked vehicles, deep blue-black sky. Saturated colour, high
> contrast, clean stylised 3D render. Even illumination across the entire frame —
> no area left unreadably dark.
>
> **No people. No user interface, no HUD, no text, no watermark, no vignette.**
> Aspect ratio 3:2.

---

## What will ruin the asset

These are cheap to avoid now and expensive after the art is approved.

**People.** Real players and ambient pedestrians are drawn by the engine. A painted
person never moves, never has a nameplate, and cannot be told apart from a player
standing still — so the picture must be empty of them.

**Moving traffic.** Vehicles in motion are engine-drawn too (suggestion 3). Parked
at the kerb is right; mid-junction is not.

**A vignette or dramatic lighting falloff.** The player sprite is drawn at one
brightness everywhere. If the art is bright in the middle and dark at the edges, the
player will look pasted on wherever the art is dark.

**An inconsistent camera angle.** The player has four facing directions drawn for one
fixed viewing angle. If one side of the image is seen more from the side than the
other, the sprite will only sit correctly in half the scene.

**Baked-in UI.** Every panel, bar, chip and billboard in the reference screenshots is
HTML drawn over the top. Painting them into the art means they cannot update, cannot
be clicked, and will be covered by the real ones.

**Generated text.** Image generators produce garbled lettering. Ask for abstract
signage — shapes, glyphs, colour — and let real text live in the HTML layer.

---

## The mask

The only file that cannot be generated. Fifteen minutes per district in any editor.

1. Open the base image.
2. Add a layer above it.
3. Paint **solid** over everything the player must not walk through: buildings,
   planters, parked cars, water, the outer edge of the map.
4. Leave **fully transparent** everywhere they may walk: roads, pavements, the
   square, crossings.
5. Hide the base layer and export that layer alone as **PNG with transparency**.

Half resolution — 1340 × 910 — is plenty and a quarter of the memory. The engine
scales it up and samples on a 16-pixel grid, so a soft brush edge is not a wall;
anything under 50% alpha counts as floor.

Doorways matter most: leave a clear transparent gap where each building's entrance
is, or the player cannot reach the thing they came for.

## Switching it on

In `src/game/world/backdrop.js`:

```js
export const CITY_BACKDROP = {
  base: 'city/plaza-base.webp',
  mask: 'city/plaza-mask.png',
  width: 2680,
  height: 1820,
};
```

Set it back to `null` to return to the drawn city. Both run side by side, so this is
reversible at any point and does not need a revert.

## Checking it

- Walk the whole square. Nothing invisible should stop you on open ground.
- Walk into each building. You should be stopped at its wall, not inside it.
- Walk to each doorway. The `[E]` prompt should appear with the right name.
- Leave an office. You should arrive at that district's door, facing down.
