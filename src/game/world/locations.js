/**
 * Grooveli City as data.
 *
 * Every location is declared here — its place in the world, what it represents
 * in the employment market, and which interactions it offers. The city scene
 * reads this list and builds itself; it contains no knowledge of any particular
 * building. Adding a district means adding an entry, not editing a scene.
 *
 * Coordinates are world pixels. The origin is the top-left of the world; the
 * camera handles everything else.
 *
 * @typedef {Object} CityLocation
 * @property {string} id
 * @property {string} name
 * @property {string} shortName        label drawn in the world
 * @property {string} type             'career-district' | 'service' | 'home' | 'plaza'
 * @property {string} category         maps to the job/mission taxonomy
 * @property {string} tagline          one line shown on the location panel
 * @property {string} description
 * @property {{ x: number, y: number }} position   centre of the footprint
 * @property {{ width: number, height: number }} size
 * @property {string} accent           hex, shared by the world and the interface
 * @property {string[]} interactions   interaction ids, resolved by the interaction registry
 * @property {boolean} [walkable]      true for open spaces that should not block movement
 * @property {number} [floors]         visual height of the extrusion
 * @property {string} [glyph]          two-to-three character mark drawn on the facade
 */

/** @type {CityLocation[]} */
export const cityLocations = [
  {
    id: 'spawn-plaza',
    name: 'Grooveli Plaza',
    shortName: 'PLAZA',
    type: 'plaza',
    category: 'general',
    tagline: 'The centre of Grooveli City.',
    description:
      'Where everyone arrives. The districts around the plaza each represent a part of the employment market — walk up to any of them and press E.',
    position: { x: 1300, y: 1480 },
    size: { width: 520, height: 320 },
    accent: '#5be3c8',
    interactions: ['city-guide', 'missions'],
    walkable: true,
    glyph: 'GC',
  },
  {
    id: 'player-apartment',
    name: 'Your Apartment',
    shortName: 'HOME',
    type: 'home',
    category: 'general',
    tagline: 'Your personal career headquarters.',
    description:
      'Desk, laptop, CV folder, trophy shelf, wall and phone. Everything about your own career lives here.',
    position: { x: 430, y: 1470 },
    size: { width: 300, height: 240 },
    accent: '#ffd9a0',
    interactions: ['enter-apartment', 'career-dashboard', 'notifications'],
    floors: 3,
    glyph: 'HM',
  },
  {
    id: 'ai-career-center',
    name: 'AI Career Center',
    shortName: 'AI CENTER',
    type: 'service',
    category: 'general',
    tagline: 'Grooveli AI — your career agent.',
    description:
      'The AI knows your profile, your applications and every role open in the city. Ask it for matches, gaps, CV work or interview practice.',
    position: { x: 1300, y: 880 },
    size: { width: 420, height: 300 },
    accent: '#8ef0d8',
    interactions: ['career-ai', 'career-discovery', 'assessment', 'interview-sim'],
    floors: 5,
    glyph: 'AI',
  },
  {
    id: 'recruitment-agency',
    name: 'Recruitment Agency',
    shortName: 'RECRUITMENT',
    type: 'service',
    category: 'recruitment',
    tagline: 'Matching, shortlisting and talent discovery.',
    description:
      'Grooveli’s recruitment marketplace. Job matching, candidate matching and the agency roles that run them.',
    position: { x: 440, y: 900 },
    size: { width: 340, height: 260 },
    accent: '#5be3c8',
    interactions: ['jobs', 'missions', 'career-ai', 'companies'],
    floors: 4,
    glyph: 'RA',
  },
  {
    id: 'university-campus',
    name: 'University & Training Center',
    shortName: 'TRAINING',
    type: 'career-district',
    category: 'education',
    tagline: 'Courses, certifications and skill missions.',
    description:
      'Learning and career development. Accredited short courses, skill challenges and the certifications employers actually check.',
    position: { x: 440, y: 340 },
    size: { width: 360, height: 260 },
    accent: '#ffc46b',
    interactions: ['courses', 'missions', 'jobs'],
    floors: 3,
    glyph: 'UT',
  },
  {
    id: 'technology-hub',
    name: 'Technology Hub',
    shortName: 'TECH HUB',
    type: 'career-district',
    category: 'technology',
    tagline: 'Technology careers and skill opportunities.',
    description:
      'Software engineering, AI, data, cybersecurity, product, DevOps and IT. The fastest-moving salary band in the city.',
    position: { x: 1090, y: 330 },
    size: { width: 350, height: 250 },
    accent: '#6fe0ff',
    interactions: ['jobs', 'missions', 'career-discovery', 'companies'],
    floors: 6,
    glyph: 'TH',
  },
  {
    id: 'creative-district',
    name: 'Creative District',
    shortName: 'CREATIVE',
    type: 'career-district',
    category: 'creative',
    tagline: 'Design, media, content and marketing.',
    description:
      'Design, music, content, photography, film, media, marketing and creative technology. Portfolio counts for more than a CV here.',
    position: { x: 1760, y: 330 },
    size: { width: 350, height: 250 },
    accent: '#d98cff',
    interactions: ['jobs', 'companies', 'career-ai'],
    floors: 4,
    glyph: 'CD',
  },
  {
    id: 'healthcare-district',
    name: 'Healthcare District',
    shortName: 'HEALTHCARE',
    type: 'career-district',
    category: 'healthcare',
    tagline: 'Clinical, nursing and health technology roles.',
    description:
      'Healthcare, nursing, pharmacy, medical administration and health technology. Credentials are checked before introduction.',
    position: { x: 2300, y: 340 },
    size: { width: 340, height: 260 },
    accent: '#76e8a8',
    interactions: ['jobs', 'companies', 'missions'],
    floors: 5,
    glyph: 'HC',
  },
  {
    id: 'finance-district',
    name: 'Finance District',
    shortName: 'FINANCE',
    type: 'career-district',
    category: 'finance',
    tagline: 'Banking, accounting, investment and fintech.',
    description:
      'Banking, accounting, investment, fintech, insurance and financial analysis. Structured graduate paths and long ladders.',
    position: { x: 2300, y: 900 },
    size: { width: 340, height: 260 },
    accent: '#9fb2d8',
    interactions: ['jobs', 'companies', 'career-ai'],
    floors: 7,
    glyph: 'FD',
  },
  {
    id: 'corporate-district',
    name: 'Corporate District',
    shortName: 'CORPORATE',
    type: 'career-district',
    category: 'corporate',
    tagline: 'Employers, company profiles and open positions.',
    description:
      'Where the employers are. Browse company profiles, see who is hiring, and walk into an employer portal.',
    position: { x: 2290, y: 1470 },
    size: { width: 360, height: 270 },
    accent: '#7f9cff',
    interactions: ['companies', 'jobs', 'missions'],
    floors: 6,
    glyph: 'CO',
  },
  {
    id: 'hospitality-district',
    name: 'Hospitality District',
    shortName: 'HOSPITALITY',
    type: 'career-district',
    category: 'hospitality',
    tagline: 'Hotels, restaurants, tourism and events.',
    description:
      'Hotels, restaurants, tourism, events, customer service and hospitality management. Promotes from within more than any other district.',
    position: { x: 1800, y: 1470 },
    size: { width: 340, height: 260 },
    accent: '#ff9f7a',
    interactions: ['jobs', 'companies', 'missions'],
    floors: 4,
    glyph: 'HD',
  },
];

/** World bounds, sized to hold the layout with a comfortable margin. */
export const WORLD = {
  width: 2680,
  height: 1820,
  spawn: { x: 1300, y: 1560 },
};

const byId = Object.fromEntries(cityLocations.map((location) => [location.id, location]));

/** @returns {CityLocation | null} */
export function getLocation(locationId) {
  return byId[locationId] ?? null;
}

