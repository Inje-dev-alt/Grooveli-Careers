/**
 * Mocked application history and scheduled interviews.
 * Replaced by `GET /applications` and `GET /interviews`.
 *
 * New applications made in the prototype are held in the job store and merged
 * over this history, so the list reads the same either way.
 *
 * @type {import('../models/index.js').Application[]}
 */
export const applications = [
  {
    id: 'app-001',
    jobId: 'job-019',
    jobTitle: 'Payroll Specialist',
    companyName: 'Harbour & Co.',
    status: 'interview',
    appliedAt: '2026-09-21T10:12:00.000Z',
    updatedAt: '2026-10-03T14:00:00.000Z',
    note: 'First-stage call completed. Panel interview scheduled.',
  },
  {
    id: 'app-002',
    jobId: 'job-013',
    jobTitle: 'Hospitality Training Coordinator',
    companyName: 'Azure Bay Hotels',
    status: 'in-review',
    appliedAt: '2026-09-30T16:40:00.000Z',
    updatedAt: '2026-10-02T09:05:00.000Z',
    note: 'With the hiring manager.',
  },
  {
    id: 'app-003',
    jobId: 'job-016',
    jobTitle: 'Operations Analyst',
    companyName: 'Atlas Holdings',
    status: 'submitted',
    appliedAt: '2026-10-04T11:25:00.000Z',
    updatedAt: '2026-10-04T11:25:00.000Z',
  },
  {
    id: 'app-004',
    jobId: 'job-006',
    jobTitle: 'Financial Analyst',
    companyName: 'Meridian Capital Partners',
    status: 'rejected',
    appliedAt: '2026-08-14T08:00:00.000Z',
    updatedAt: '2026-08-29T13:30:00.000Z',
    note: 'Looking for stronger modelling experience.',
  },
  {
    id: 'app-005',
    jobId: 'job-011',
    jobTitle: 'Healthcare Recruiter',
    companyName: 'Vitalis Health Group',
    status: 'offer',
    appliedAt: '2026-07-02T09:00:00.000Z',
    updatedAt: '2026-08-01T15:45:00.000Z',
    note: 'Offer received — decision pending.',
  },
];

/** @type {import('../models/index.js').Interview[]} */
export const interviews = [
  {
    id: 'int-001',
    applicationId: 'app-001',
    companyName: 'Harbour & Co.',
    jobTitle: 'Payroll Specialist',
    type: 'final',
    scheduledAt: '2026-10-07T10:00:00.000Z',
    status: 'scheduled',
  },
  {
    id: 'int-002',
    applicationId: 'app-005',
    companyName: 'Vitalis Health Group',
    jobTitle: 'Healthcare Recruiter',
    type: 'technical',
    scheduledAt: '2026-07-19T13:00:00.000Z',
    status: 'completed',
    score: 88,
  },
];
