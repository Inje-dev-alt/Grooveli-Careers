/**
 * The player apartment — the personal career headquarters.
 *
 * A thin subclass of the shared interior renderer: the room data lives in
 * game/world/apartment.js, the drawing lives in InteriorScene.js, and
 * this file is only the binding between them.
 */
import { InteriorScene } from './InteriorScene.js';
import { APARTMENT, apartmentObjects } from '../world/apartment.js';

export class ApartmentScene extends InteriorScene {
  constructor() {
    super({
      key: 'ApartmentScene',
      room: APARTMENT,
      objects: apartmentObjects,
      locationId: 'player-apartment',
    });
  }
}
