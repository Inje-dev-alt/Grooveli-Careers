/**
 * Mocked accounts.
 *
 * One account type holds both capabilities. `roles` is an array and
 * `activeRole` selects the experience, so a recruiter who is also job-hunting
 * is one user rather than two logins.
 *
 * Replaced by `POST /auth/login`, `POST /auth/register` and `GET /users/me`.
 */

/**
 * Accounts that can sign in. Any password is accepted by the mock — this is a
 * prototype credential check, not authentication.
 *
 * @type {(import('../models/index.js').User & { password: string })[]}
 */
export const accounts = [
  {
    id: 'usr-001',
    email: 'candidate@grooveli.test',
    password: 'grooveli',
    displayName: 'John Doe',
    roles: ['candidate'],
    activeRole: 'candidate',
    createdAt: '2025-11-04T09:12:00.000Z',
    candidateProfileId: 'cp-001',
    organizationMemberships: [],
  },
  {
    id: 'usr-002',
    email: 'employer@grooveli.test',
    password: 'grooveli',
    displayName: 'Amara Eze',
    roles: ['employer'],
    activeRole: 'employer',
    createdAt: '2025-09-18T10:40:00.000Z',
    candidateProfileId: null,
    organizationMemberships: [
      {
        organizationId: 'org-northwind',
        organizationName: 'Northwind Systems',
        role: 'admin',
        title: 'Head of Talent',
        joinedAt: '2025-09-18T10:40:00.000Z',
      },
    ],
  },
];

/**
 * The demo candidate's profile — a worked example with real history, used by
 * the seeded account. A newly registered candidate starts from
 * `emptyCandidateProfile` instead.
 *
 * @type {import('../models/index.js').CandidateProfile}
 */
export const candidateProfile = {
  id: 'cp-001',
  userId: 'usr-001',
  headline: 'People Operations Specialist moving into HR technology',
  summary:
    'Five years across recruitment and HR operations for mid-sized employers. Currently building automation skills so that hiring admin stops eating the week.',
  location: 'Lagos, Nigeria',
  yearsExperience: 5,
  careerGoal: 'Move into a people systems role where process ownership and automation sit together.',
  careerInterests: ['People Operations', 'HR Technology', 'Talent Acquisition'],
  workTypes: ['hybrid', 'remote'],
  openTo: ['full-time', 'contract'],
  salaryExpectation: { min: 450000, max: 750000, currency: 'NGN' },
  industries: ['Recruitment', 'Technology', 'Financial Services'],
  cv: { hasCv: false },
  completeness: 90,
  skills: [
    { id: 'skl-recruitment', name: 'Recruitment', category: 'people', level: 90, verified: true, score: 93 },
    { id: 'skl-hr-ops', name: 'HR Operations', category: 'people', level: 82, verified: true, score: 88 },
    { id: 'skl-excel', name: 'Excel', category: 'business', level: 72, verified: false },
    { id: 'skl-ai-automation', name: 'AI Automation', category: 'technology', level: 64, verified: false },
    { id: 'skl-communication', name: 'Communication', category: 'people', level: 78, verified: false },
    { id: 'skl-stakeholder', name: 'Stakeholder Management', category: 'people', level: 70, verified: false },
    { id: 'skl-payroll', name: 'Payroll', category: 'people', level: 58, verified: false },
  ],
  experience: [
    {
      id: 'exp-1',
      title: 'People Operations Specialist',
      organization: 'Harbour & Co.',
      startDate: '2023-02',
      summary: 'Own payroll for 400 staff and the onboarding process behind it.',
    },
    {
      id: 'exp-2',
      title: 'Recruitment Coordinator',
      organization: 'Keystone Talent',
      startDate: '2021-01',
      endDate: '2023-01',
      summary: 'Ran scheduling and candidate care across operations and finance searches.',
    },
  ],
  education: [
    { id: 'edu-1', qualification: 'BSc Industrial Relations & Personnel Management', institution: 'University of Lagos', year: '2020' },
  ],
};

/**
 * The shape a brand-new candidate starts from. Onboarding fills it in, and
 * `completeness` rises as it does — the profile is something the user builds,
 * not something handed to them finished.
 */
export function emptyCandidateProfile(userId, profileId) {
  return {
    id: profileId,
    userId,
    headline: '',
    summary: '',
    location: '',
    yearsExperience: 0,
    careerGoal: '',
    careerInterests: [],
    workTypes: [],
    openTo: [],
    salaryExpectation: { min: 0, max: 0, currency: 'NGN' },
    industries: [],
    cv: { hasCv: false },
    completeness: 0,
    skills: [],
    experience: [],
    education: [],
  };
}

/**
 * Career progress for the seeded demo account.
 *
 * A new account starts at `{ xp: 0, level: 1, reputation: 0 }` — progression is
 * earned, so it cannot be seeded from a fixture.
 *
 * @type {Record<string, import('../models/index.js').CareerProgress>}
 */
export const careerProgress = {
  'usr-001': { xp: 1240, level: 8, reputation: 61 },
};

/** @type {Record<string, import('../models/index.js').CareerStats>} */
export const careerStats = {
  'usr-001': {
    completedMissions: 6,
    certifications: 2,
    applications: 5,
    interviews: 2,
    offers: 1,
    jobsViewed: 48,
    locationsVisited: 4,
  },
};

/**
 * Achievements. Those with an `event` are earned by doing that career activity;
 * the rest are seeded as already held by the demo account.
 *
 * @type {import('../models/index.js').Achievement[]}
 */
export const achievementCatalog = [
  { id: 'ach-first-mission', name: 'First Career Mission', description: 'Completed your first career mission.', icon: 'trophy', event: 'mission.completed' },
  { id: 'ach-first-application', name: 'First Application', description: 'Submitted your first application through Grooveli.', icon: 'rocket', event: 'application.suitable' },
  { id: 'ach-interview-ready', name: 'Interview Ready', description: 'Completed an interview simulation.', icon: 'target', event: 'interview.simulated' },
  { id: 'ach-excel-foundations', name: 'Excel Foundations', description: 'Passed the Excel skill challenge.', icon: 'chart', event: 'skill.challenge' },
  { id: 'ach-career-explorer', name: 'Career Explorer', description: 'Visited five districts in Grooveli City.', icon: 'map', event: 'location.visited' },
  { id: 'ach-certified', name: 'Certified', description: 'Completed an accredited course.', icon: 'award', event: 'course.completed' },
  { id: 'ach-profile-complete', name: 'Career Identity', description: 'Completed your career profile.', icon: 'user', event: 'profile.completed' },
  { id: 'ach-first-post', name: 'Found Your Voice', description: 'Shared your first career post.', icon: 'megaphone', event: 'social.posted' },
];

/** Achievements the demo account already holds. */
export const seededAchievementIds = ['ach-first-mission', 'ach-first-application', 'ach-career-explorer'];
