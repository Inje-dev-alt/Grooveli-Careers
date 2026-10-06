import {
  IconBriefcase,
  IconTarget,
  IconSparkle,
  IconGrid,
  IconDoc,
  IconUser,
  IconBell,
  IconAward,
  IconTrendUp,
  IconHome,
  IconMap,
  IconKey,
} from '../ui/index.js';
import { AI_INTENTS } from '../../services/aiService.js';

/**
 * The interaction registry.
 *
 * Every interactable in the game — a district, the AI centre, the desk in the
 * apartment — lists interaction ids. This file is the only place that knows what
 * those ids mean. Adding a behaviour is an entry here; giving a building that
 * behaviour is one string in its data.
 *
 * `open` receives a context object rather than importing stores directly, so
 * interactions stay testable and free of component knowledge.
 *
 * @typedef {Object} InteractionContext
 * @property {import('../../game/world/locations.js').CityLocation} location
 * @property {(type: string, props?: object) => void} openModal
 * @property {(type: string, props?: object) => void} replaceModal
 * @property {() => void} closeAllModals
 * @property {(route: string) => void} navigate
 */

/** @type {Record<string, { label: string, description: string, icon: Function, open: (ctx: InteractionContext) => void }>} */
export const INTERACTIONS = {
  jobs: {
    label: 'Explore Jobs',
    description: 'Open roles in this part of the city',
    icon: IconBriefcase,
    open: ({ location, replaceModal }) =>
      replaceModal('jobs', { districtId: districtScope(location), title: location.name }),
  },

  missions: {
    label: 'Skill Missions',
    description: 'Career activities that build and verify skills',
    icon: IconTarget,
    open: ({ location, replaceModal }) =>
      replaceModal('missions', { locationId: location.id, title: location.name }),
  },

  'career-ai': {
    label: 'Talk to Career AI',
    description: 'Ask Grooveli AI about this district',
    icon: IconSparkle,
    open: ({ replaceModal }) => replaceModal('ai', { initialIntent: AI_INTENTS.FIND_JOBS }),
  },

  companies: {
    label: 'Browse Companies',
    description: 'Employer profiles and who is hiring',
    icon: IconGrid,
    open: ({ location, replaceModal }) =>
      replaceModal('companies', { districtId: districtScope(location), title: location.name }),
  },

  courses: {
    label: 'Courses & Certifications',
    description: 'Accredited short courses worth 200 XP each',
    icon: IconDoc,
    open: ({ replaceModal }) => replaceModal('courses', {}),
  },

  assessment: {
    label: 'Career Assessment',
    description: 'A calibrated read on where you stand',
    icon: IconTrendUp,
    open: ({ replaceModal }) => replaceModal('ai', { initialIntent: AI_INTENTS.ASSESSMENT }),
  },

  'interview-sim': {
    label: 'Interview Simulation',
    description: 'Practise, then get scored on the answers',
    icon: IconKey,
    open: ({ replaceModal }) => replaceModal('ai', { initialIntent: 'interview-simulation' }),
  },

  'city-guide': {
    label: 'City Guide',
    description: 'What every district in Grooveli City represents',
    icon: IconMap,
    open: ({ replaceModal }) => replaceModal('city-guide', {}),
  },

  'enter-apartment': {
    label: 'Go Inside',
    description: 'Enter your apartment',
    icon: IconHome,
    open: ({ closeAllModals, navigate }) => {
      closeAllModals();
      navigate('/apartment');
    },
  },

  'career-dashboard': {
    label: 'Career Dashboard',
    description: 'Level, XP, reputation and what is in flight',
    icon: IconTrendUp,
    open: ({ replaceModal }) => replaceModal('career-dashboard', {}),
  },

  'career-stats': {
    label: 'Career Statistics',
    description: 'Everything you have accumulated so far',
    icon: IconTrendUp,
    open: ({ replaceModal }) => replaceModal('career-stats', {}),
  },

  profile: {
    label: 'Career Profile',
    description: 'Your professional identity and CV',
    icon: IconUser,
    open: ({ replaceModal }) => replaceModal('profile', {}),
  },

  'upload-cv': {
    label: 'CV',
    description: 'Upload or replace your CV',
    icon: IconDoc,
    open: ({ replaceModal }) => replaceModal('profile', {}),
  },

  achievements: {
    label: 'Achievements',
    description: 'What you have proved',
    icon: IconAward,
    open: ({ replaceModal }) => replaceModal('achievements', {}),
  },

  notifications: {
    label: 'Notifications',
    description: 'Matches, updates and reminders',
    icon: IconBell,
    open: ({ replaceModal }) => replaceModal('notifications', {}),
  },
};

/**
 * Districts scope their jobs and companies to themselves; service locations
 * (the agency, the AI centre) show the whole city.
 */
function districtScope(location) {
  return location.type === 'career-district' ? location.id : '';
}

/** @returns {{ id: string } & typeof INTERACTIONS[string] | null} */
export function getInteraction(id) {
  const entry = INTERACTIONS[id];
  return entry ? { id, ...entry } : null;
}

export function resolveInteractions(ids = []) {
  return ids.map(getInteraction).filter(Boolean);
}
