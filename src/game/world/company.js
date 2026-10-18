/**
 * The employer headquarters — the company's career office inside Grooveli City.
 *
 * Declared exactly like the apartment: same object shape, same interaction
 * system, a different room. Desk → jobs, board → candidates and analytics,
 * door → back to the dashboard. The only difference from the apartment is
 * which behaviours the furniture points at, which is the point — adding a
 * room is data, not a new architecture.
 *
 * @typedef {import('./apartment.js').ApartmentObject} CompanyObject
 */

export const COMPANY = {
  width: 1180,
  height: 820,
  spawn: { x: 590, y: 640 },
  /** Interior wall inset — the floor the player can actually walk on. */
  padding: 70,
  /** Height of the back wall band drawn above the floor. */
  wallHeight: 72,
};

/** @type {CompanyObject[]} */
export const companyObjects = [
  {
    id: 'co-board',
    name: 'Hiring Board',
    shortName: 'HIRING BOARD',
    type: 'apartment-object',
    kind: 'wall',
    tagline: 'Pipeline and analytics.',
    description: 'Applications by stage, time in stage, and where the pipeline stands.',
    position: { x: 590, y: 120 },
    size: { width: 320, height: 62 },
    accent: '#8ef0d8',
    interactions: ['company-analytics'],
  },
  {
    id: 'co-desk',
    name: 'Hiring Desk',
    shortName: 'DESK',
    type: 'apartment-object',
    kind: 'desk',
    tagline: 'Roles you publish.',
    description: 'Create jobs and manage the ones already in the marketplace.',
    position: { x: 300, y: 250 },
    size: { width: 280, height: 100 },
    accent: '#5be3c8',
    interactions: ['company-jobs'],
  },
  {
    id: 'co-candidates',
    name: 'Candidate Wall',
    shortName: 'CANDIDATES',
    type: 'apartment-object',
    kind: 'shelf',
    tagline: 'People who applied.',
    description: 'Review applications, shortlist, and move candidates along.',
    position: { x: 830, y: 240 },
    size: { width: 210, height: 90 },
    accent: '#b98cff',
    interactions: ['company-candidates'],
  },
  {
    id: 'co-brand',
    name: 'Brand Shelf',
    shortName: 'BRAND',
    type: 'apartment-object',
    kind: 'folder',
    tagline: 'Company profile and logo.',
    description: 'What candidates see before they apply.',
    position: { x: 585, y: 258 },
    size: { width: 94, height: 72 },
    accent: '#ffc46b',
    interactions: ['company-profile'],
  },
  {
    id: 'co-door',
    name: 'Door',
    shortName: 'EXIT',
    type: 'apartment-object',
    kind: 'phone',
    tagline: 'Back to the dashboard.',
    description: 'Leave the headquarters and return to the employer space.',
    position: { x: 960, y: 520 },
    size: { width: 58, height: 82 },
    accent: '#ff9f7a',
    interactions: ['company-exit'],
    depthBias: 120,
    passable: true,
  },

  // --- Scenery. No interactions, no labels. ---
  {
    id: 'co-rug',
    name: 'Rug',
    shortName: '',
    type: 'apartment-object',
    kind: 'rug',
    tagline: '',
    description: '',
    position: { x: 560, y: 560 },
    size: { width: 400, height: 240 },
    accent: '#223052',
    interactions: [],
    decorative: true,
    passable: true,
  },
  {
    id: 'co-sofa',
    name: 'Sofa',
    shortName: '',
    type: 'apartment-object',
    kind: 'sofa',
    tagline: '',
    description: '',
    position: { x: 250, y: 560 },
    size: { width: 240, height: 100 },
    accent: '#2b3a63',
    interactions: [],
    decorative: true,
  },
  {
    id: 'co-plant',
    name: 'Plant',
    shortName: '',
    type: 'apartment-object',
    kind: 'plant',
    tagline: '',
    description: '',
    position: { x: 120, y: 300 },
    size: { width: 76, height: 76 },
    accent: '#2c9a66',
    interactions: [],
    decorative: true,
  },
];

const byId = Object.fromEntries(companyObjects.map((object) => [object.id, object]));
export function getCompanyObject(id) {
  return byId[id] ?? null;
}
