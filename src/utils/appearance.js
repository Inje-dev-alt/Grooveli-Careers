import { CHARACTER_PALETTES } from '../game/entities/characterArt.js';

/**
 * What colour a person is, on the client.
 *
 * A mirror of `supabase/functions/api/_shared/palette.ts`, and the only reason
 * it exists twice is that Deno and the browser cannot share a module here.
 * The live API derives appearance server-side and sends it; this is for the
 * mock layer, which has to answer the same question without a backend, and for
 * anywhere the interface holds a user id and no person payload.
 *
 * THE TWO MUST AGREE. If the server sends palette 3 and the mock picks 5, the
 * same person changes colour the day a surface goes live — a difference nobody
 * would attribute to the right cause. The harness checks both the palette list
 * and the hash against the server's.
 *
 * The palette comes from the character painter rather than being retyped, so
 * a roster avatar, a leaderboard row and the figure walking around a room are
 * all the same colour by construction.
 */

/** Jacket colour per palette, as hex strings for the DOM. */
export const PERSON_PALETTE = CHARACTER_PALETTES.map(
  (palette) => `#${palette.jacket.toString(16).padStart(6, '0')}`,
);

/** FNV-1a, matching the server's implementation exactly. */
function hashId(userId) {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/** Which palette this account draws with. */
export function paletteIndexFor(userId) {
  if (!userId) return 0;
  return hashId(String(userId)) % PERSON_PALETTE.length;
}

/** The hex to paint this account with. */
export function colorFor(userId) {
  return PERSON_PALETTE[paletteIndexFor(userId)];
}

/** Colour and palette index together, as the API returns them. */
export function appearanceOf(userId) {
  const paletteIndex = paletteIndexFor(userId);
  return { color: PERSON_PALETTE[paletteIndex], paletteIndex };
}
