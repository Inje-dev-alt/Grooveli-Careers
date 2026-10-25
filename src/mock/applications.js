/**
 * Mocked applications and interviews.
 * Replaced by `GET /applications`, `POST /jobs/:id/apply`, `GET /interviews`.
 *
 * ONE collection, exactly as the API will have it: rows a candidate sees are
 * filtered by `candidateId`, rows an employer sees are filtered by
 * `organizationId`. Splitting them into two arrays was the mistake that kept a
 * real candidate's application out of the employer pipeline.
 *
 * `seeded: true` marks fixture history that the pipeline simulation must leave
 * alone, so the demo timeline stays stable across sessions.
 *
 * @type {import('../models/index.js').Application[]}
 */
export const applications = [
  {
    id: 'app-001',
    jobId: 'job-019',
    jobTitle: 'Payroll Specialist',
    organizationId: 'org-harbour-co',
    companyName: 'Harbour & Co.',
    candidateId: 'usr-001',
    status: 'interview',
    appliedAt: '2026-09-21T10:12:00.000Z',
    updatedAt: '2026-10-03T14:00:00.000Z',
    stageEnteredAt: '2026-10-03T14:00:00.000Z',
    note: 'First-stage call completed. Panel interview scheduled.',
    seeded: true,
  },
  {
    id: 'app-002',
    jobId: 'job-013',
    jobTitle: 'Hospitality Training Coordinator',
    organizationId: 'org-azure-bay',
    companyName: 'Azure Bay Hotels',
    candidateId: 'usr-001',
    status: 'under-review',
    appliedAt: '2026-09-30T16:40:00.000Z',
    updatedAt: '2026-10-02T09:05:00.000Z',
    stageEnteredAt: '2026-10-02T09:05:00.000Z',
    note: 'With the hiring manager.',
    seeded: true,
  },
  {
    id: 'app-003',
    jobId: 'job-016',
    jobTitle: 'Operations Analyst',
    organizationId: 'org-atlas-holdings',
    companyName: 'Atlas Holdings',
    candidateId: 'usr-001',
    status: 'applied',
    appliedAt: '2026-10-04T11:25:00.000Z',
    updatedAt: '2026-10-04T11:25:00.000Z',
    stageEnteredAt: '2026-10-04T11:25:00.000Z',
    seeded: true,
  },
  {
    id: 'app-004',
    jobId: 'job-006',
    jobTitle: 'Financial Analyst',
    organizationId: 'org-meridian',
    companyName: 'Meridian Capital Partners',
    candidateId: 'usr-001',
    status: 'rejected',
    appliedAt: '2026-08-14T08:00:00.000Z',
    updatedAt: '2026-08-29T13:30:00.000Z',
    stageEnteredAt: '2026-08-29T13:30:00.000Z',
    note: 'Looking for stronger modelling experience.',
    feedback: 'Strong process instincts, but the modelling case needed more depth. A financial modelling course would close the gap.',
    rejectionAcknowledged: true,
    seeded: true,
  },
  {
    id: 'app-005',
    jobId: 'job-011',
    jobTitle: 'Healthcare Recruiter',
    organizationId: 'org-vitalis',
    companyName: 'Vitalis Health Group',
    candidateId: 'usr-001',
    status: 'offer',
    appliedAt: '2026-07-02T09:00:00.000Z',
    updatedAt: '2026-08-01T15:45:00.000Z',
    stageEnteredAt: '2026-08-01T15:45:00.000Z',
    note: 'Offer received - decision pending.',
    seeded: true,
  },

  /* Applications to the demo employer's organization, from the candidate pool. */
  { id: 'inapp-001', jobId: 'job-001', jobTitle: 'Backend Engineer', organizationId: 'org-northwind', companyName: 'Northwind Systems', candidateId: 'cand-002', status: 'shortlisted', appliedAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-04T10:00:00.000Z', stageEnteredAt: '2026-10-04T10:00:00.000Z', seeded: true },
  { id: 'inapp-002', jobId: 'job-001', jobTitle: 'Backend Engineer', organizationId: 'org-northwind', companyName: 'Northwind Systems', candidateId: 'cand-006', status: 'under-review', appliedAt: '2026-10-02T11:30:00.000Z', updatedAt: '2026-10-03T08:20:00.000Z', stageEnteredAt: '2026-10-03T08:20:00.000Z', seeded: true },
  { id: 'inapp-003', jobId: 'job-005', jobTitle: 'Frontend Engineer', organizationId: 'org-northwind', companyName: 'Northwind Systems', candidateId: 'cand-004', status: 'applied', appliedAt: '2026-10-03T14:45:00.000Z', updatedAt: '2026-10-03T14:45:00.000Z', stageEnteredAt: '2026-10-03T14:45:00.000Z', seeded: true },
  { id: 'inapp-004', jobId: 'job-018', jobTitle: 'Sales Development Representative', organizationId: 'org-northwind', companyName: 'Northwind Systems', candidateId: 'cand-005', status: 'interview', appliedAt: '2026-09-28T10:15:00.000Z', updatedAt: '2026-10-05T09:00:00.000Z', stageEnteredAt: '2026-10-05T09:00:00.000Z', seeded: true },
  { id: 'inapp-005', jobId: 'job-005', jobTitle: 'Frontend Engineer', organizationId: 'org-northwind', companyName: 'Northwind Systems', candidateId: 'cand-001', status: 'applied', appliedAt: '2026-10-05T07:30:00.000Z', updatedAt: '2026-10-05T07:30:00.000Z', stageEnteredAt: '2026-10-05T07:30:00.000Z', seeded: true },
];

/** @type {import('../models/index.js').Interview[]} */
export const interviews = [
  {
    id: 'int-001',
    userId: 'usr-001',
    applicationId: 'app-001',
    companyName: 'Harbour & Co.',
    jobTitle: 'Payroll Specialist',
    type: 'final',
    scheduledAt: '2026-10-09T10:00:00.000Z',
    status: 'scheduled',
  },
  {
    id: 'int-002',
    userId: 'usr-001',
    applicationId: 'app-005',
    companyName: 'Vitalis Health Group',
    jobTitle: 'Healthcare Recruiter',
    type: 'technical',
    scheduledAt: '2026-07-19T13:00:00.000Z',
    status: 'completed',
    score: 88,
  },
];