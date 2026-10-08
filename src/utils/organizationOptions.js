/**
 * Option lists for employer forms.
 *
 * These are interface vocabulary, not data: a real backend would serve them
 * from a taxonomy endpoint, and until it does they live here rather than in the
 * mock layer so screens never import mock data.
 */
export const INDUSTRIES = [
  'Technology',
  'Fintech',
  'Financial Services',
  'Accounting',
  'Healthcare',
  'Education',
  'Recruitment',
  'Design & Media',
  'Hospitality',
  'Logistics',
  'Retail',
  'Conglomerate',
  'Energy',
  'Public Sector',
];

export const COMPANY_SIZES = ['1-10', '11-50', '50-200', '200-500', '500-1500', '1500-5000', '5000+'];

/** Roles a person can hold at their organization, and what each can do. */
export const EMPLOYER_ROLES = [
  { id: 'owner', label: 'Founder / Owner' },
  { id: 'admin', label: 'HR Manager' },
  { id: 'recruiter', label: 'Recruiter' },
  { id: 'hiring-manager', label: 'Hiring Manager' },
];

export const EMPLOYMENT_TYPE_OPTIONS = [
  { id: 'full-time', label: 'Full-time' },
  { id: 'part-time', label: 'Part-time' },
  { id: 'contract', label: 'Contract' },
  { id: 'internship', label: 'Internship' },
  { id: 'freelance', label: 'Freelance' },
];

export const WORK_TYPE_OPTIONS = [
  { id: 'onsite', label: 'On-site' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'remote', label: 'Remote' },
];

export const EXPERIENCE_LEVEL_OPTIONS = [
  { id: 'entry', label: 'Entry' },
  { id: 'junior', label: 'Junior' },
  { id: 'mid', label: 'Mid' },
  { id: 'senior', label: 'Senior' },
  { id: 'lead', label: 'Lead' },
];

export const CURRENCY_OPTIONS = [
  { id: 'NGN', label: 'NGN — Nigerian Naira' },
  { id: 'USD', label: 'USD — US Dollar' },
  { id: 'GBP', label: 'GBP — Pound Sterling' },
  { id: 'EUR', label: 'EUR — Euro' },
];
