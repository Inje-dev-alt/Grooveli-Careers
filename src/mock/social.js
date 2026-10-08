/**
 * The Grooveli Network: a lightweight professional feed.
 *
 * The hypothesis being tested is narrow — does career activity become something
 * worth sharing, and does seeing other people's make opportunities easier to
 * find? So the feed carries career substance (a verified assessment, a finished
 * course, a live role) rather than generic status updates.
 *
 * Replaced by `GET /social/posts`, `GET /social/connections`, `GET /social/follows`.
 */

/** @type {import('../models/index.js').Post[]} */
export const posts = [
  {
    id: 'post-001',
    author: {
      id: 'cand-001',
      kind: 'user',
      name: 'Adaeze Nwosu',
      headline: 'Talent Acquisition Specialist · Atlas Holdings',
      color: '#5be3c8',
    },
    type: 'achievement',
    body: 'Finally finished the Recruitment Mission. The candidate-shortlisting exercise was harder than I expected — it scores your reasoning against the brief, not against what you would personally pick. Useful correction.',
    attachment: {
      kind: 'achievement',
      refId: 'ach-excel-foundations',
      label: 'Excel Foundations',
      detail: 'Assessment score',
      score: 91,
      verified: true,
    },
    likeCount: 34,
    likedByMe: false,
    comments: [
      {
        id: 'cmt-001',
        postId: 'post-001',
        author: { id: 'cand-003', kind: 'user', name: 'Chiamaka Obi', headline: 'People Operations Lead', color: '#ffc46b' },
        body: 'The shortlist justification step is the bit most people skip in real life. Good to see it scored.',
        createdAt: '2026-10-05T11:20:00.000Z',
      },
    ],
    createdAt: '2026-10-05T09:40:00.000Z',
  },
  {
    id: 'post-002',
    author: {
      id: 'org-northwind',
      kind: 'organization',
      name: 'Northwind Systems',
      headline: 'Payments infrastructure for African commerce',
      color: '#6fe0ff',
      verified: true,
    },
    type: 'opportunity',
    body: 'We are hiring a Backend Engineer for the settlement team. Correctness-critical work, careful reviews, and we write decisions down. Remote within WAT ±3.',
    attachment: { kind: 'job', refId: 'job-001', label: 'Backend Engineer', detail: 'Northwind Systems · Lagos / Remote' },
    likeCount: 58,
    likedByMe: false,
    comments: [],
    createdAt: '2026-10-04T15:10:00.000Z',
  },
  {
    id: 'post-003',
    author: {
      id: 'cand-002',
      kind: 'user',
      name: 'Tunde Afolabi',
      headline: 'Senior Backend Engineer · Signal Labs',
      color: '#6fe0ff',
    },
    type: 'advice',
    body: 'Advice I wish I had taken earlier: stop applying to twenty roles a week. Three applications where you can name exactly why you fit will beat twenty where you cannot. The match score here makes that uncomfortably obvious.',
    likeCount: 127,
    likedByMe: false,
    comments: [
      {
        id: 'cmt-002',
        postId: 'post-003',
        author: { id: 'cand-005', kind: 'user', name: 'Funmi Adeyemi', headline: 'Financial Analyst', color: '#9fb2d8' },
        body: 'This is the lesson that took me a year. Volume feels productive and is not.',
        createdAt: '2026-10-04T08:05:00.000Z',
      },
      {
        id: 'cmt-003',
        postId: 'post-003',
        author: { id: 'cand-006', kind: 'user', name: 'Emeka Okafor', headline: 'Operations Analyst', color: '#76e8a8' },
        body: 'Agreed. I started writing one paragraph on why I fit before applying and my response rate changed.',
        createdAt: '2026-10-04T09:30:00.000Z',
      },
    ],
    createdAt: '2026-10-03T18:45:00.000Z',
  },
  {
    id: 'post-004',
    author: {
      id: 'cand-005',
      kind: 'user',
      name: 'Funmi Adeyemi',
      headline: 'Financial Analyst · Meridian Capital Partners',
      color: '#9fb2d8',
    },
    type: 'skill',
    body: 'Verified Excel at 92%. Modelling was fine; the part I had to redo was explaining what the numbers meant in two sentences. Worth practising.',
    attachment: { kind: 'skill', refId: 'skl-excel', label: 'Excel', detail: 'Verified skill', score: 92, verified: true },
    likeCount: 41,
    likedByMe: false,
    comments: [],
    createdAt: '2026-10-03T12:00:00.000Z',
  },
  {
    id: 'post-005',
    author: {
      id: 'org-brightpath',
      kind: 'organization',
      name: 'Brightpath Learning',
      headline: 'Professional certification and upskilling',
      color: '#ffc46b',
      verified: true,
    },
    type: 'company-update',
    body: 'New cohort of Data Essentials opens next week. Four weeks, evenings, assessment-backed certificate. Built for people who already own a process and want the data half of it.',
    likeCount: 76,
    likedByMe: false,
    comments: [],
    createdAt: '2026-10-02T10:30:00.000Z',
  },
  {
    id: 'post-006',
    author: {
      id: 'cand-003',
      kind: 'user',
      name: 'Chiamaka Obi',
      headline: 'People Operations Lead · Vitalis Health Group',
      color: '#ffc46b',
    },
    type: 'insight',
    body: 'Observation from hiring this quarter: candidates who can show a verified skill get a first call far more often than candidates who claim the same skill. Evidence travels better than confidence.',
    likeCount: 93,
    likedByMe: false,
    comments: [],
    createdAt: '2026-10-01T14:15:00.000Z',
  },
];

/**
 * People the signed-in candidate can connect with, and companies to follow.
 * Connection and follow are separate relationships on purpose — Grooveli is not
 * a one-way job marketplace.
 */
export const suggestedPeople = [
  { id: 'cand-001', name: 'Adaeze Nwosu', headline: 'Talent Acquisition Specialist · Atlas Holdings', color: '#5be3c8', mutual: 4 },
  { id: 'cand-003', name: 'Chiamaka Obi', headline: 'People Operations Lead · Vitalis Health Group', color: '#ffc46b', mutual: 2 },
  { id: 'cand-006', name: 'Emeka Okafor', headline: 'Operations Analyst · Atlas Holdings', color: '#76e8a8', mutual: 1 },
  { id: 'cand-002', name: 'Tunde Afolabi', headline: 'Senior Backend Engineer · Signal Labs', color: '#6fe0ff', mutual: 0 },
];

/** Organizations suggested to follow. */
export const suggestedOrganizationIds = ['org-keystone', 'org-brightpath', 'org-signal-labs'];

/** Seeded career activity for the demo account. */
export const seededActivity = [
  { id: 'act-seed-1', userId: 'usr-001', type: 'course.completed', label: 'Completed People Analytics', xp: 200, createdAt: '2026-09-28T10:00:00.000Z', shareable: true },
  { id: 'act-seed-2', userId: 'usr-001', type: 'application.suitable', label: 'Applied for Payroll Specialist', xp: 25, createdAt: '2026-09-21T10:12:00.000Z', shareable: true },
  { id: 'act-seed-3', userId: 'usr-001', type: 'mission.completed', label: 'Completed Build Your Career Identity', xp: 150, createdAt: '2026-09-14T16:30:00.000Z', shareable: true },
];
