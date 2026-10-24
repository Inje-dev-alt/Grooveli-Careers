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

/** scene id -> how that scene looks a place up by id. */
const LOOKUPS = {
  city: getLocation,
  apartment: getApartmentObject,
  company: getCompanyObject,
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
 * The name and accent to show when nothing is nearby.
 *
 * @param {string} scene
 * @returns {{ name: string, accent: string }}
 */
export function placeFallback(scene) {
  return FALLBACKS[scene] ?? FALLBACKS.city;
}
