import { CAREER_EVENTS } from '../utils/careerEvents.js';

/**
 * Mocked mission definitions.
 * Replaced by `GET /missions`; completion is reported with
 * `POST /missions/:id/complete`.
 *
 * Objectives are data, not UI. Each one names the career event that advances it
 * and how many times that event must fire, so the mission system never needs to
 * know what a particular mission is about.
 *
 * @type {import('../models/index.js').Mission[]}
 */
export const missions = [
  {
    id: 'msn-first-job',
    title: 'Get Your First Job',
    description:
      'The core career loop, start to finish: make yourself legible to employers, find out where you actually stand, then put that in front of three roles that suit you.',
    type: 'career',
    category: 'onboarding',
    difficulty: 'medium',
    xpReward: 250,
    locationId: 'recruitment-agency',
    unlocksLevel: 'Level 2',
    reward: 'Unlocks verified candidate status',
    objectives: [
      {
        id: 'obj-profile',
        label: 'Complete your career profile',
        hint: 'Headline, summary, skills and salary expectation.',
        event: CAREER_EVENTS.PROFILE_COMPLETED,
        target: 1,
        actionLabel: 'Open profile',
        actionRoute: '/profile',
      },
      {
        id: 'obj-cv',
        label: 'Upload your CV',
        hint: 'Employers still ask for it, and the AI reads it to find skill gaps.',
        event: CAREER_EVENTS.CV_UPLOADED,
        target: 1,
        actionLabel: 'Upload CV',
        actionRoute: '/profile',
      },
      {
        id: 'obj-assessment',
        label: 'Complete the AI career assessment',
        hint: 'Twelve questions. It calibrates your match scores.',
        event: CAREER_EVENTS.ASSESSMENT_COMPLETED,
        target: 1,
        actionLabel: 'Start assessment',
        actionRoute: '/ai',
      },
      {
        id: 'obj-apply',
        label: 'Apply to three suitable jobs',
        hint: 'Only roles matching 60% or better count — volume is not progress.',
        event: CAREER_EVENTS.SUITABLE_JOB_APPLIED,
        target: 3,
        actionLabel: 'Browse jobs',
        actionRoute: '/jobs',
      },
      {
        id: 'obj-interview',
        label: 'Complete an interview simulation',
        hint: 'Practise with the AI before the real thing.',
        event: CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED,
        target: 1,
        actionLabel: 'Practise interview',
        actionRoute: '/ai',
      },
    ],
  },
  {
    id: 'msn-city-tour',
    title: 'Know the City',
    description:
      'Every district in Grooveli City maps to a part of the employment market. Walk them once and you will know where to go when you need something.',
    type: 'discovery',
    category: 'exploration',
    difficulty: 'easy',
    xpReward: 75,
    locationId: 'spawn-plaza',
    objectives: [
      {
        id: 'obj-visit',
        label: 'Visit five districts',
        hint: 'Walk up to a building and press E.',
        event: CAREER_EVENTS.LOCATION_VISITED,
        target: 5,
        actionLabel: 'Enter the city',
        actionRoute: '/city',
      },
      {
        id: 'obj-ai-intro',
        label: 'Introduce yourself to Grooveli AI',
        event: CAREER_EVENTS.AI_CONSULTED,
        target: 1,
        actionLabel: 'Open AI Career Center',
        actionRoute: '/ai',
      },
    ],
  },
  {
    id: 'msn-excel',
    title: 'Excel Mission',
    description:
      'Prove you can model, not just format. Pivot a messy export, build the lookup, and explain what the numbers say.',
    type: 'skill',
    category: 'excel',
    difficulty: 'medium',
    xpReward: 100,
    locationId: 'university-campus',
    reward: 'Verifies Excel on your profile',
    objectives: [
      {
        id: 'obj-excel-challenge',
        label: 'Complete the Excel challenge',
        hint: 'Three tasks, roughly fifteen minutes.',
        event: CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
        target: 1,
        actionLabel: 'Start challenge',
      },
    ],
  },
  {
    id: 'msn-communication',
    title: 'Communication Mission',
    description:
      'Write the difficult message: a delay, a decline, a correction. The AI scores clarity, tone and whether the reader knows what happens next.',
    type: 'skill',
    category: 'communication',
    difficulty: 'easy',
    xpReward: 100,
    locationId: 'university-campus',
    reward: 'Verifies Communication on your profile',
    objectives: [
      {
        id: 'obj-comms-exercise',
        label: 'Complete the AI communication exercise',
        event: CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
        target: 1,
        actionLabel: 'Start exercise',
      },
    ],
  },
  {
    id: 'msn-interview',
    title: 'Interview Mission',
    description:
      'A full simulated interview for a role in your match range, with structured feedback on each answer afterwards.',
    type: 'skill',
    category: 'interview',
    difficulty: 'hard',
    xpReward: 100,
    locationId: 'ai-career-center',
    reward: 'Interview readiness score on your profile',
    objectives: [
      {
        id: 'obj-interview-sim',
        label: 'Complete an AI interview',
        hint: 'Six questions, no retries mid-run.',
        event: CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED,
        target: 1,
        actionLabel: 'Start interview',
        actionRoute: '/ai',
      },
    ],
  },
  {
    id: 'msn-recruitment',
    title: 'Recruitment Mission',
    description:
      'Four hypothetical candidates, one brief. Shortlist two and justify the cut — the AI checks your reasoning against the brief, not against its own taste.',
    type: 'skill',
    category: 'recruitment',
    difficulty: 'medium',
    xpReward: 100,
    locationId: 'recruitment-agency',
    reward: 'Verifies Recruitment on your profile',
    objectives: [
      {
        id: 'obj-recruitment-eval',
        label: 'Evaluate the candidate shortlist',
        event: CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
        target: 1,
        actionLabel: 'Start evaluation',
      },
    ],
  },
  {
    id: 'msn-sales',
    title: 'Sales Mission',
    description:
      'Handle a simulated customer conversation from first objection to agreed next step. Scored on discovery, not on charm.',
    type: 'skill',
    category: 'sales',
    difficulty: 'medium',
    xpReward: 100,
    locationId: 'corporate-district',
    reward: 'Verifies Sales on your profile',
    objectives: [
      {
        id: 'obj-sales-sim',
        label: 'Handle the simulated customer conversation',
        event: CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
        target: 1,
        actionLabel: 'Start simulation',
      },
    ],
  },
  {
    id: 'msn-certification',
    title: 'Earn a Certification',
    description:
      'Finish an accredited short course at the Training Center. Certifications are the part of your profile employers trust most.',
    type: 'career',
    category: 'learning',
    difficulty: 'hard',
    xpReward: 200,
    locationId: 'university-campus',
    reward: 'Adds a verified certification to your profile',
    objectives: [
      {
        id: 'obj-course',
        label: 'Complete a course',
        hint: 'Data Essentials and People Analytics are both open.',
        event: CAREER_EVENTS.COURSE_COMPLETED,
        target: 1,
        actionLabel: 'Browse courses',
      },
    ],
  },
  {
    id: 'msn-bounce-back',
    title: 'Bounce Back',
    description:
      'Every career has a no in it. Read the feedback, take it seriously, sharpen the gap it named, and put yourself back in front of employers who are still hiring.',
    type: 'career',
    category: 'resilience',
    difficulty: 'medium',
    xpReward: 150,
    locationId: 'recruitment-agency',
    reward: 'Proves you can take a no and keep moving',
    objectives: [
      {
        id: 'obj-rejection',
        label: 'Read the feedback on a rejection',
        hint: 'Open your applications. The note is there for a reason.',
        event: CAREER_EVENTS.APPLICATION_REJECTED,
        target: 1,
        actionLabel: 'Open applications',
        actionRoute: '/profile',
      },
      {
        id: 'obj-sharpen',
        label: 'Pass a skill mission',
        hint: 'Close the gap the feedback named.',
        event: CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
        target: 1,
        actionLabel: 'Find a skill mission',
        actionRoute: '/missions',
      },
      {
        id: 'obj-retry',
        label: 'Apply to two suitable roles',
        hint: 'Match 60% or better still counts, rejection or not.',
        event: CAREER_EVENTS.SUITABLE_JOB_APPLIED,
        target: 2,
        actionLabel: 'Browse jobs',
        actionRoute: '/jobs',
      },
    ],
  },
  {
    id: 'msn-network',
    title: 'Network Mission',
    description:
      'Careers move through people. Make one real connection, then use it the honest way - ask someone who could know your work to say so to an employer.',
    type: 'career',
    category: 'networking',
    difficulty: 'easy',
    xpReward: 60,
    locationId: 'spawn-plaza',
    reward: 'Referrals unlocked on your active applications',
    objectives: [
      {
        id: 'obj-connect',
        label: 'Connect with one professional',
        hint: 'The Network shows people working in your part of the market.',
        event: CAREER_EVENTS.CONNECTION_MADE,
        target: 1,
        actionLabel: 'Open the Network',
        actionRoute: '/network',
      },
      {
        id: 'obj-referral',
        label: 'Ask a connection for a referral',
        hint: 'Open an active application and use "Ask for a referral".',
        event: CAREER_EVENTS.REFERRAL_REQUESTED,
        target: 1,
        actionLabel: 'Open applications',
        actionRoute: '/profile',
      },
    ],
  },
];
