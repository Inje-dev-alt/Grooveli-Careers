/**
 * Mocked notification feed.
 * Replaced by `GET /notifications` and `POST /notifications/:id/read`.
 * @type {import('../models/index.js').Notification[]}
 */
export const notifications = [
  {
    id: 'ntf-001',
    type: 'match',
    title: '4 new job matches',
    body: 'Grooveli AI found four roles above 75% match, including Healthcare Recruiter at Vitalis Health Group.',
    createdAt: '2026-10-05T07:20:00.000Z',
    read: false,
    route: '/jobs',
  },
  {
    id: 'ntf-002',
    type: 'interview',
    title: 'Interview tomorrow, 10:00',
    body: 'Final interview with Harbour & Co. for the Payroll Specialist role.',
    createdAt: '2026-10-05T06:00:00.000Z',
    read: false,
    route: '/profile',
  },
  {
    id: 'ntf-003',
    type: 'application',
    title: 'Atlas Holdings opened your application',
    body: 'Operations Analyst — your application moved from submitted to in review.',
    createdAt: '2026-10-04T15:10:00.000Z',
    read: false,
    route: '/profile',
  },
  {
    id: 'ntf-004',
    type: 'mission',
    title: 'Recommended skill mission',
    body: 'Data Analysis appears in three of your top matches. The Excel Mission is the fastest way in.',
    createdAt: '2026-10-04T09:00:00.000Z',
    read: true,
    route: '/missions',
  },
  {
    id: 'ntf-005',
    type: 'application',
    title: 'Azure Bay Hotels is reviewing',
    body: 'Hospitality Training Coordinator — with the hiring manager since Friday.',
    createdAt: '2026-10-02T09:05:00.000Z',
    read: true,
    route: '/profile',
  },
  {
    id: 'ntf-006',
    type: 'system',
    title: 'Welcome to Grooveli City',
    body: 'Your apartment is unlocked. The desk, laptop and CV folder all work.',
    createdAt: '2026-10-01T08:00:00.000Z',
    read: true,
    route: '/apartment',
  },
];
