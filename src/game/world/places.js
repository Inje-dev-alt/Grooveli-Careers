/**
 * Resolving a place, whichever room you are standing in.
 *
 * Three scenes now declare places the same way — the city's districts, the
 * apartment's furniture and the company HQ's — but each lives in its own
 * module with its own lookup. The HUD and the interaction prompt both need
 * "what am I near", and both had grown a `scene === 'apartment' ? … : …`
 * ternary that a third room would have turned into a chain.
 *
 * A map keeps that a data change: a new room registers its lookup here and
 * every surface that reads a place works in it, which is the same bargain the
 * interaction registry makes.
 */
import { getLocation } from './locations.js';
import { getApartmentObject } from './apartment.js';
import { getCompanyObject } from './company.js';
import { getOfficeObject } from './office.js';

/** scene id -> how that scene looks a place up by id. */
const LOOKUPS = {
  city: getLocation,
  apartment: getApartmentObject,
  company: getCompanyObject,
  office: getOfficeObject,
};

/**
 * What the HUD shows when the player is not standing near anything.
 *
 * The city's own name is the honest answer outdoors; indoors it is the room,
 * because "Grooveli City" on a HUD inside a building reads as a bug.
 */
const FALLBACKS = {
  city: { name: 'Grooveli City', accent: 'var(--g-accent)' },
  apartment: { name: 'Your Apartment', accent: '#ffd9a0' },
  company: { name: 'Company HQ', accent: '#5be3c8' },
  office: { name: 'Company Office', accent: '#6fe0ff' },
};

/**
 * The place with this id in this scene, or null.
 *
 * @param {string} scene 'city' | 'apartment' | 'company'
 * @param {string | null} placeId
 */
export function resolvePlace(scene, placeId) {
  if (!placeId) return null;
  const lookup = LOOKUPS[scene] ?? getLocation;
  return lookup(placeId) ?? null;
}

/**
 * The place with this id in ANY room.
 *
 * For the callers that hold an id and no scene — the interaction request
 * arrives as a bare `locationId`, because the world is what knows where the
 * player is standing. Object ids are prefixed per room (`apt-`, `co-`, `off-`,
 * and the city's own readable names), so trying each lookup cannot answer with
 * somebody else's furniture.
 *
 * This exists because `ModalRoot` had grown its own copy of the chain —
 * `getLocation ?? getApartmentObject ?? getCompanyObject` — and when the
 * office was added it was registered in LOOKUPS above and not in that copy.
 * The result was a room where the prompt appeared, named the right object, and
 * opened nothing at all. One registry, read by everyone, is the only version
 * of this that cannot drift.
 *
 * @param {string | null} placeId
 */
export function resolveAnyPlace(placeId) {
  if (!placeId) return null;
  for (const lookup of Object.values(LOOKUPS)) {
    const found = lookup(placeId);
    if (found) return found;
  }
  return null;
}

/**
 * The name and accent to show when nothing is nearby.
 *
 * @param {string} scene
 * @returns {{ name: string, accent: string }}
 */
export function placeFallback(scene) {
  return FALLBACKS[scene] ?? FALLBACKS.city;
}
