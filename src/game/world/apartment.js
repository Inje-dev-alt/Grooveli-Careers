/**
 * The player apartment — the personal career headquarters.
 *
 * Objects here are declared exactly like city locations and consumed by the
 * same interaction system, so "walk up, press E, a panel opens" behaves
 * identically indoors and out. The only difference is scale.
 *
 * @typedef {Object} ApartmentObject
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {string} type           always 'apartment-object'; the location panel reads it
 * @property {string} tagline
 * @property {string} description
 * @property {{ x: number, y: number }} position
 * @property {{ width: number, height: number }} size
 * @property {string} accent
 * @property {string[]} interactions
 * @property {'desk'|'laptop'|'folder'|'shelf'|'wall'|'phone'|'plant'|'rug'|'sofa'|'table'|'bookshelf'|'lamp'} kind
 * @property {boolean} [decorative]   scenery: no interaction, no label
 * @property {boolean} [passable]     scenery the player can walk over, such as a rug
 * @property {number} [depthBias]     nudges sort order for objects that sit on another
 */

export const APARTMENT = {
  width: 1180,
  height: 820,
  spawn: { x: 590, y: 640 },
  /** Interior wall inset — the floor the player can actually walk on. */
  padding: 70,
  /** Height of the back wall band drawn above the floor. */
  wallHeight: 72,
};

/** @type {ApartmentObject[]} */
export const apartmentObjects = [
  {
    id: 'apt-wall',
    name: 'Career Wall',
    shortName: 'CAREER WALL',
    type: 'apartment-object',
    kind: 'wall',
    tagline: 'Career statistics.',
    description: 'Level, skills, certifications, reputation and completed missions.',
    position: { x: 590, y: 120 },
    size: { width: 300, height: 62 },
    accent: '#8ef0d8',
    interactions: ['career-stats'],
  },
  {
    id: 'apt-desk',
    name: 'Desk',
    shortName: 'DESK',
    type: 'apartment-object',
    kind: 'desk',
    tagline: 'Your career dashboard.',
    description: 'Level, XP, reputation and everything in flight, in one place.',
    position: { x: 300, y: 250 },
    size: { width: 280, height: 100 },
    accent: '#5be3c8',
    interactions: ['career-dashboard', 'missions'],
  },
  {
    id: 'apt-laptop',
    name: 'Laptop',
    shortName: 'LAPTOP',
    type: 'apartment-object',
    kind: 'laptop',
    tagline: 'The job marketplace.',
    description: 'Search, filter and apply without leaving the apartment.',
    // Sits at the right-hand end of the desk, far enough from its centre that
    // the interaction system can tell the two apart when the player walks up.
    position: { x: 390, y: 234 },
    size: { width: 78, height: 52 },
    accent: '#6fe0ff',
    interactions: ['jobs'],
    // Sits on the desk, so it has to sort above it despite a smaller base Y.
    depthBias: 120,
    passable: true,
  },
  {
    id: 'apt-cv',
    name: 'CV Folder',
    shortName: 'CV',
    type: 'apartment-object',
    kind: 'folder',
    tagline: 'Your CV and career profile.',
    description: 'Upload your CV, edit your profile, and see what is still missing.',
    position: { x: 585, y: 258 },
    size: { width: 94, height: 72 },
    accent: '#ffc46b',
    interactions: ['profile', 'upload-cv'],
  },
  {
    id: 'apt-trophies',
    name: 'Trophy Shelf',
    shortName: 'TROPHIES',
    type: 'apartment-object',
    kind: 'shelf',
    tagline: 'Achievements and certifications.',
    description: 'What you have proved, rather than what you have claimed.',
    position: { x: 830, y: 240 },
    size: { width: 210, height: 90 },
    accent: '#b98cff',
    interactions: ['achievements'],
  },
  {
    id: 'apt-phone',
    name: 'Phone',
    shortName: 'PHONE',
    type: 'apartment-object',
    kind: 'phone',
    tagline: 'Notifications.',
    description: 'Matches, application updates and interview reminders.',
    position: { x: 960, y: 520 },
    size: { width: 58, height: 82 },
    accent: '#ff9f7a',
    interactions: ['notifications'],
    depthBias: 120,
    passable: true,
  },

  // --- Scenery. No interactions, no labels. ---
  {
    id: 'apt-rug',
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
    id: 'apt-sofa',
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
    id: 'apt-side-table',
    name: 'Side table',
    shortName: '',
    type: 'apartment-object',
    kind: 'table',
    tagline: '',
    description: '',
    position: { x: 960, y: 545 },
    size: { width: 110, height: 86 },
    accent: '#3a2f27',
    interactions: [],
    decorative: true,
  },
  {
    id: 'apt-bookshelf',
    name: 'Bookshelf',
    shortName: '',
    type: 'apartment-object',
    kind: 'bookshelf',
    tagline: '',
    description: '',
    position: { x: 1020, y: 260 },
    size: { width: 110, height: 130 },
    accent: '#6c8cff',
    interactions: [],
    decorative: true,
  },
  {
    id: 'apt-plant',
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
  {
    id: 'apt-floor-lamp',
    name: 'Floor lamp',
    shortName: '',
    type: 'apartment-object',
    kind: 'lamp',
    tagline: '',
    description: '',
    position: { x: 130, y: 690 },
    size: { width: 64, height: 110 },
    accent: '#ffd9a0',
    interactions: [],
    decorative: true,
  },
];

const byId = Object.fromEntries(apartmentObjects.map((object) => [object.id, object]));
export function getApartmentObject(id) {
  return byId[id] ?? null;
}
