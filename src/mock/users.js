/**
 * The signed-in candidate. One user is enough for the prototype — the backend
 * owns accounts, so the UI only ever reads "the current user".
 * Replaced by `POST /auth/login` + `GET /users/me`.
 */

/** @type {import('../models/index.js').User} */
export const currentUser = {
  id: 'usr-001',
  email: 'john.doe@example.com',
  displayName: 'John Doe',
  role: 'candidate',
  createdAt: '2025-11-04T09:12:00.000Z',
  onboardingComplete: false,
};

/** @type {import('../models/index.js').CandidateProfile} */
export const candidateProfile = {
  id: 'cp-001',
  userId: 'usr-001',
  headline: 'People Operations Specialist moving into HR technology',
  summary:
    'Five years across recruitment and HR operations for mid-sized employers. Currently building automation skills so that hiring admin stops eating the week.',
  location: 'Lagos, Nigeria',
  yearsExperience: 5,
  workModes: ['hybrid', 'remote'],
  openTo: ['full-time', 'contract'],
  salaryExpectation: { min: 450000, max: 750000, currency: 'NGN' },
  industries: ['Recruitment', 'Technology', 'Financial Services'],
  cv: { hasCv: false },
  completeness: 62,
  skills: [
    { id: 'skl-recruitment', name: 'Recruitment', category: 'people', level: 90, verified: true },
    { id: 'skl-hr-ops', name: 'HR Operations', category: 'people', level: 82, verified: true },
    { id: 'skl-excel', name: 'Excel', category: 'business', level: 72, verified: false },
    { id: 'skl-ai-automation', name: 'AI Automation', category: 'technology', level: 64, verified: false },
    { id: 'skl-communication', name: 'Communication', category: 'people', level: 78, verified: false },
    { id: 'skl-stakeholder', name: 'Stakeholder Management', category: 'people', level: 70, verified: false },
    { id: 'skl-payroll', name: 'Payroll', category: 'people', level: 58, verified: false },
  ],
};

/**
 * Career statistics as the backend would return them from `GET /career/stats`.
 * Live XP and level are owned by the career store while the backend is absent;
 * everything else is read-only history.
 */
/** @type {import('../models/index.js').CareerStats} */
export const careerStats = {
  level: 17,
  xp: 14280,
  reputation: 82,
  completedMissions: 47,
  certifications: 6,
  applications: 23,
  interviews: 8,
  offers: 3,
  jobsViewed: 164,
  locationsVisited: 7,
};

/** Achievements shown on the apartment trophy shelf. */
export const achievements = [
  { id: 'ach-first-application', name: 'First Application', description: 'Submitted your first application through Grooveli.', earned: true, earnedAt: '2025-11-18T10:00:00.000Z' },
  { id: 'ach-assessment', name: 'Known Quantity', description: 'Completed the AI career assessment.', earned: true, earnedAt: '2025-12-02T15:30:00.000Z' },
  { id: 'ach-six-certs', name: 'Six Certifications', description: 'Earned six verified certifications.', earned: true, earnedAt: '2026-02-11T08:45:00.000Z' },
  { id: 'ach-interview-ace', name: 'Interview Ace', description: 'Scored above 85 in an interview simulation.', earned: true, earnedAt: '2026-03-09T12:10:00.000Z' },
  { id: 'ach-city-explorer', name: 'City Explorer', description: 'Visited every district in Grooveli City.', earned: false },
  { id: 'ach-offer-holder', name: 'Offer Holder', description: 'Received three offers in a single year.', earned: true, earnedAt: '2026-04-22T16:20:00.000Z' },
  { id: 'ach-skill-master', name: 'Skill Master', description: 'Verified five skills through skill missions.', earned: false },
  { id: 'ach-mentor', name: 'Mentor', description: 'Helped another candidate prepare for an interview.', earned: false },
];
