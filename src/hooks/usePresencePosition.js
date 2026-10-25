import { useEffect } from 'react';
import { usePresenceStore } from '../stores/presenceStore.js';

/**
 * Tell presence where this room is.
 *
 * A room declares itself and nothing else — it does not send the heartbeat,
 * which runs once for the whole app in `AppEffects`. That split is the point:
 * a room that owned its own timer would run alongside the next room's for as
 * long as a navigation takes.
 *
 * `locationId` is what makes a room shared. Pass the district in the city or
 * the organization in an office; pass nothing in the apartment, which is one
 * person's flat and so has no occupants to list. A null here is the only thing
 * that decides a room is private, on both sides of the API.
 *
 * @param {string} scene 'city' | 'apartment' | 'office' | 'company'
 * @param {string | null} [locationId]
 */
export function usePresencePosition(scene, locationId = null) {
  const setPosition = usePresenceStore((s) => s.setPosition);

  useEffect(() => {
    setPosition(scene, locationId ?? null);
  }, [scene, locationId, setPosition]);
}
