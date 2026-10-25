/**
 * The employer headquarters — the company's career office inside Grooveli City.
 *
 * Same renderer as the apartment, different room: the HQ data lives in
 * `game/world/company.js` and this file binds it to `InteriorScene.js`.
 */
import { InteriorScene } from './InteriorScene.js';
import { COMPANY, companyObjects } from '../world/company.js';

export class CompanyScene extends InteriorScene {
  constructor() {
    super({
      key: 'CompanyScene',
      room: COMPANY,
      objects: companyObjects,
      locationId: 'company-hq',
    });
  }
}
