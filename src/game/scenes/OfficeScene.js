/**
 * A company office — the lobby a candidate walks into.
 *
 * Same renderer as the apartment and the HQ, different room: the data lives in
 * `game/world/office.js` and this file binds it to `InteriorScene.js`. Which
 * company you are standing in is not the scene's business — the geometry is
 * identical for every office and the route decides whose it is.
 */
import { InteriorScene } from './InteriorScene.js';
import { OFFICE, officeObjects } from '../world/office.js';

export class OfficeScene extends InteriorScene {
  constructor() {
    super({
      key: 'OfficeScene',
      room: OFFICE,
      objects: officeObjects,
      locationId: 'company-office',
    });
  }
}
