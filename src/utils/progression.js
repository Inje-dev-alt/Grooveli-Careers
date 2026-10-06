/**
 * Career level curve.
 *
 * Levels get progressively more expensive so that early career activity feels
 * responsive while later levels represent real accumulated work. The backend
 * will eventually own this calculation; keeping it in one pure module means the
 * swap is a single import change.
 */

const BASE_XP = 120;
const GROWTH = 1.18;

/** XP required to advance *from* `level` to `level + 1`. */
export function xpForLevel(level) {
  return Math.round(BASE_XP * Math.pow(GROWTH, Math.max(0, level - 1)));
}

/**
 * Resolve a total XP figure into a level and the progress within it.
 * @param {number} totalXp
 * @returns {{ level: number, xpIntoLevel: number, xpForNextLevel: number, progress: number }}
 */
export function resolveProgression(totalXp) {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  let level = 1;
  let remaining = xp;

  // The curve is cheap to walk and bounded in practice; a closed form would
  // trade readability for microseconds.
  while (remaining >= xpForLevel(level) && level < 100) {
    remaining -= xpForLevel(level);
    level += 1;
  }

  const xpForNextLevel = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel,
    progress: xpForNextLevel > 0 ? remaining / xpForNextLevel : 1,
  };
}

/** Title shown beside the level badge. */
export function careerTitleForLevel(level) {
  if (level >= 40) return 'Career Luminary';
  if (level >= 30) return 'Principal';
  if (level >= 22) return 'Career Strategist';
  if (level >= 15) return 'Established Professional';
  if (level >= 9) return 'Practitioner';
  if (level >= 4) return 'Emerging Professional';
  return 'Newcomer';
}
