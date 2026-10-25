/**
 * A company office — the room a candidate walks into.
 *
 * Deliberately a different room from `company.js`, which is the employer's own
 * headquarters. The HQ has a hiring desk and a candidate wall, because it is
 * where hiring is done; this is the lobby, where a company is *seen*. Same
 * building, opposite sides of the counter, so the furniture points at
 * different behaviours and keeping them apart is what stops a visitor's panel
 * ever rendering someone's pipeline.
 *
 * The geometry is fixed and the contents are not: every company's office is
 * laid out the same way, and which company you are standing in comes from the
 * route. That is the same bargain the apartment makes — the furniture is
 * static, the panels are live.
 *
 * @typedef {import('./apartment.js').ApartmentObject} OfficeObject
 */

export const OFFICE = {
  width: 1180,
  height: 820,
  spawn: { x: 590, y: 660 },
  /** Interior wall inset — the floor the player can actually walk on. */
  padding: 70,
  /** Height of the back wall band drawn above the floor. */
  wallHeight: 72,
};

/** @type {OfficeObject[]} */
export const officeObjects = [
  {
    id: 'off-sign',
    name: 'Reception',
    shortName: 'RECEPTION',
    type: 'apartment-object',
    kind: 'wall',
    tagline: 'Who this company is.',
    description:
      'The profile a candidate reads before applying — what they do, where they are, how many people, and whether you follow them.',
    position: { x: 590, y: 120 },
    size: { width: 340, height: 62 },
    accent: '#6fe0ff',
    interactions: ['office-profile'],
  },
  {
    id: 'off-board',
    name: 'Open Roles',
    shortName: 'ROLES',
    type: 'apartment-object',
    kind: 'shelf',
    tagline: 'What they are hiring for.',
    description: 'Every role this company has published, with your match against each one.',
    position: { x: 250, y: 260 },
    size: { width: 230, height: 96 },
    accent: '#5be3c8',
    interactions: ['office-jobs'],
  },
  {
    id: 'off-noticeboard',
    name: 'Notice Board',
    shortName: 'NOTICES',
    type: 'apartment-object',
    kind: 'bookshelf',
    tagline: 'What they have been saying.',
    description: 'Posts this company has shared with the network.',
    position: { x: 930, y: 260 },
    size: { width: 200, height: 110 },
    accent: '#ffc46b',
    interactions: ['office-posts'],
  },
  {
    id: 'off-table',
    name: 'Meeting Table',
    shortName: 'TABLE',
    type: 'apartment-object',
    kind: 'table',
    tagline: 'Where people talk.',
    description:
      'Who else is standing in this lobby right now, and who can see you.',
    position: { x: 590, y: 430 },
    size: { width: 260, height: 140 },
    accent: '#9fb2d8',
    interactions: ['office-presence'],
    /*
     * Straight to the roster. Walking up to a table to be told there is a
     * table, with one button that says so again, is a click that carries no
     * information — and the point of standing here is to see who is standing
     * here too. `direct` is only honoured for an object with exactly one
     * interaction, so it can never hide a choice.
     */
    direct: true,
  },
  {
    id: 'off-door',
    name: 'Exit',
    shortName: 'EXIT',
    type: 'apartment-object',
    kind: 'wall',
    tagline: 'Back to the city.',
    description: 'Leave the office.',
    position: { x: 590, y: 700 },
    size: { width: 180, height: 54 },
    accent: '#ff9f7a',
    interactions: ['office-exit'],
  },
  {
    id: 'off-plant-left',
    name: 'Plant',
    shortName: '',
    type: 'apartment-object',
    kind: 'plant',
    tagline: '',
    description: '',
    position: { x: 150, y: 620 },
    size: { width: 60, height: 60 },
    accent: '#76e8a8',
    interactions: [],
    decorative: true,
  },
  {
    id: 'off-plant-right',
    name: 'Plant',
    shortName: '',
    type: 'apartment-object',
    kind: 'plant',
    tagline: '',
    description: '',
    position: { x: 1030, y: 620 },
    size: { width: 60, height: 60 },
    accent: '#76e8a8',
    interactions: [],
    decorative: true,
  },
  {
    id: 'off-rug',
    name: 'Rug',
    shortName: '',
    type: 'apartment-object',
    kind: 'rug',
    tagline: '',
    description: '',
    position: { x: 590, y: 540 },
    size: { width: 420, height: 180 },
    accent: '#2a3454',
    interactions: [],
    decorative: true,
    passable: true,
  },
];

/** One office object by id, or null. */
export function getOfficeObject(id) {
  return officeObjects.find((object) => object.id === id) ?? null;
}
