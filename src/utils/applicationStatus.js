/**
 * Presentation metadata for the recruitment pipeline.
 *
 * The states themselves belong to the backend; this is only how each one is
 * named and coloured in the interface. It lives in utils rather than in mock
 * data so screens can import it without reaching into the mock layer.
 */
export const APPLICATION_STATUS = {
  applied: { label: 'Applied', tone: 'info' },
  'under-review': { label: 'Under Review', tone: 'info' },
  shortlisted: { label: 'Shortlisted', tone: 'accent' },
  interview: { label: 'Interview', tone: 'warning' },
  assessment: { label: 'Assessment', tone: 'warning' },
  offer: { label: 'Offer', tone: 'success' },
  rejected: { label: 'Not progressing', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'default' },
  hired: { label: 'Hired', tone: 'success' },
};

/** The order an application moves through, for employer-side controls. */
export const PIPELINE_ORDER = [
  'applied',
  'under-review',
  'shortlisted',
  'interview',
  'assessment',
  'offer',
  'hired',
];

export function statusLabel(status) {
  return APPLICATION_STATUS[status]?.label ?? status;
}

export function statusTone(status) {
  return APPLICATION_STATUS[status]?.tone ?? 'default';
}
