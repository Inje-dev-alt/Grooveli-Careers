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
import { useOfficeStore } from '../../stores/officeStore.js';

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

  'career-discovery': {
    label: 'Career Discovery',
    description: 'Career paths your skills already point at',
    icon: IconTrendUp,
    open: ({ replaceModal }) => replaceModal('career-discovery', {}),
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

  'company-jobs': {
    label: 'Manage Roles',
    description: 'Create jobs and manage published roles',
    icon: IconBriefcase,
    open: ({ closeAllModals, navigate }) => {
      closeAllModals();
      navigate('/employer/jobs');
    },
  },

  'company-candidates': {
    label: 'Review Candidates',
    description: 'Applications waiting on your decision',
    icon: IconUser,
    open: ({ closeAllModals, navigate }) => {
      closeAllModals();
      navigate('/employer/candidates');
    },
  },

  'company-analytics': {
    label: 'Hiring Analytics',
    description: 'Pipeline, time in stage and applicant mix',
    icon: IconTrendUp,
    open: ({ replaceModal }) => replaceModal('company-analytics', {}),
  },

  'company-profile': {
    label: 'Company Profile',
    description: 'What candidates see before they apply',
    icon: IconGrid,
    open: ({ closeAllModals, navigate }) => {
      closeAllModals();
      navigate('/employer/company');
    },
  },

  /* --------------------------------------------- a company's own office --- */

  /*
   * Which company you are standing in comes from the route, not from the world
   * data — every office is the same room. The office store holds it, so these
   * read it rather than taking it as context the registry cannot supply.
   */

  'office-profile': {
    label: 'Reception',
    description: 'Who this company is',
    icon: IconGrid,
    open: ({ replaceModal }) => replaceModal('office-profile', {}),
  },

  'office-jobs': {
    label: 'Open Roles',
    description: 'Every role this company has published',
    icon: IconBriefcase,
    // Reuses the marketplace browser scoped to one company, so an office
    // inherits search, facets, match scores and the apply flow for free.
    open: ({ replaceModal }) => {
      const organization = useOfficeStore.getState().organization;
      replaceModal('jobs', {
        organizationId: organization?.id,
        title: organization?.name ?? 'Open roles',
      });
    },
  },

  'office-presence': {
    label: 'Meeting Table',
    description: 'Who else is in this lobby',
    icon: IconUser,
    // Reads the presence store, which the app-wide heartbeat is already
    // filling — so the panel opens on data it did not have to fetch.
    open: ({ replaceModal }) => replaceModal('room-roster', { eyebrow: 'Meeting table' }),
  },

  'office-posts': {
    label: 'Notice Board',
    description: 'What this company has shared',
    icon: IconDoc,
    open: ({ replaceModal }) => replaceModal('office-posts', {}),
  },

  'office-exit': {
    label: 'Leave the office',
    description: 'Back to the city',
    icon: IconHome,
    open: ({ closeAllModals, navigate }) => {
      closeAllModals();
      navigate('/city');
    },
  },

  'company-exit': {
    label: 'Leave HQ',
    description: 'Back to the employer dashboard',
    icon: IconHome,
    open: ({ closeAllModals, navigate }) => {
      closeAllModals();
      navigate('/employer');
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

  leaderboard: {
    label: 'City Standings',
    description: 'The most credible careers in Grooveli, ranked by reputation',
    icon: IconTrendUp,
    open: ({ replaceModal }) => replaceModal('leaderboard', {}),
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

/**
 * The interview action shown at the player's own home district, branded with
 * their path. Built rather than listed: whether a district offers it depends
 * on who is standing there, so the panel asks for it explicitly.
 */
export function homePathInterviewAction(path) {
  return {
    id: 'path-interview',
    label: `${path.title} Interview`,
    description: 'Practise with your home path question bank, then get scored',
    icon: IconKey,
    open: ({ replaceModal }) => replaceModal('ai', { initialIntent: AI_INTENTS.INTERVIEW_SIM }),
  };
}

/** @returns {{ id: string } & typeof INTERACTIONS[string] | null} */
export function getInteraction(id) {
  const entry = INTERACTIONS[id];
  return entry ? { id, ...entry } : null;
}

export function resolveInteractions(ids = []) {
  return ids.map(getInteraction).filter(Boolean);
}
