/**
 * What colour a person is.
 *
 * Every surface that shows somebody — a room roster, the leaderboard, a
 * conversation, a candidate card, an avatar in the world — used the same
 * hardcoded teal, in seven different files. So everybody looked identical, and
 * a crowd of avatars would have been a crowd of one person repeated.
 *
 * DERIVED, NOT RANDOM, AND DERIVED SERVER-SIDE. A colour picked per render
 * changes while you watch; a colour picked per client means two people in the
 * same lobby see different crowds. Hashing the account id means one person is
 * the same colour to everyone, everywhere, forever, with nothing stored.
 *
 * THE MODULUS IS THE PAINTER'S PALETTE COUNT, NOT A ROUND NUMBER. The
 * implementation plan asked for twelve. The character painter in
 * `src/game/entities/characterArt.js` has six, so a twelfth of the userbase
 * would hash to a palette with no artwork behind it and the game would have to
 * silently fall back — which is the same bug as having one colour, only harder
 * to find. Six now; add palettes to the painter and this list together and the
 * modulus follows.
 */

/**
 * The jacket colour of each character palette, in the painter's own order.
 *
 * Kept as hex strings because this is what the API returns and what the DOM
 * renders; the game reads `paletteIndex` instead and looks up its own numbers.
 * The two lists must agree — there is a check for that in the test harness.
 */
export const PERSON_PALETTE = [
  '#2b3a63',
  '#4f7fd4',
  '#e8793a',
  '#2aa9a0',
  '#7a6bbf',
  '#9fb2d8',
] as const;

/**
 * FNV-1a over the id.
 *
 * Small, dependency-free, and well spread for short strings — which matters,
 * because uuids share long runs of structure and a weaker hash puts most of an
 * account table into two or three buckets.
 */
function hashId(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    // The FNV prime, by shifts, to stay inside 32 bits.
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  // `>>> 0` makes it unsigned; without it the modulus can be negative.
  return hash >>> 0;
}

/** Which palette this account draws with. Stable for the life of the account. */
export function paletteIndexFor(userId: string): number {
  if (!userId) return 0;
  return hashId(userId) % PERSON_PALETTE.length;
}

/** The hex an interface should paint this account with. */
export function colorFor(userId: string): string {
  return PERSON_PALETTE[paletteIndexFor(userId)];
}

/**
 * Both, for a person payload.
 *
 * Returned together so the DOM has a colour and the game has an index without
 * either having to re-derive it — and so the two can never disagree about who
 * is what colour.
 */
export function appearanceOf(userId: string): { color: string; paletteIndex: number } {
  const paletteIndex = paletteIndexFor(userId);
  return { color: PERSON_PALETTE[paletteIndex], paletteIndex };
}
