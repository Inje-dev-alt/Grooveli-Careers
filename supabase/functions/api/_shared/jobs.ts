import type { MatchProfile } from './matching.ts';

/** One row of public.jobs, as Postgres returns it. */
export type JobRow = {
  id: string;
  organization_id: string;
  company_name: string;
  title: string;
  description: string;
  salary_min: number;
  salary_max: number;
  currency: string;
  salary_period: string;
  location: string;
  work_type: string;
  employment_type: string;
  experience_level: string;
  required_skills: string[];
  preferred_skills: string[];
  industry: string;
  district_id: string;
  deadline: string | null;
  status: string;
  source: string;
  responsibilities: string[];
  requirements: string[];
  featured: boolean;
  created_at: string;
};

/** One row of public.candidate_profiles, the fields matching needs. */
export type CandidateProfileRow = {
  skills: { name: string; level?: number }[];
  work_types: string[];
  salary_min: number;
  industries: string[];
  location: string;
  years_experience: number;
};

/**
 * Row to the normalised Job JSON (§4.3). matchScore / matchReasons /
 * skillGaps are added per caller by the routes - never stored.
 */
export function toJob(row: JobRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyName: row.company_name,
    title: row.title,
    description: row.description,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
    salaryPeriod: row.salary_period,
    location: row.location,
    workType: row.work_type,
    employmentType: row.employment_type,
    experienceLevel: row.experience_level,
    requiredSkills: row.required_skills ?? [],
    preferredSkills: row.preferred_skills ?? [],
    industry: row.industry,
    districtId: row.district_id,
    deadline: row.deadline,
    status: row.status,
    source: row.source,
    responsibilities: row.responsibilities ?? [],
    requirements: row.requirements ?? [],
    featured: row.featured,
    createdAt: row.created_at,
  };
}

/** Candidate profile row to the shape the matching port expects. */
export function toMatchProfile(row: CandidateProfileRow | null): MatchProfile | null {
  if (!row) return null;
  return {
    skills: row.skills ?? [],
    workTypes: row.work_types ?? [],
    salaryExpectation: { min: row.salary_min ?? 0 },
    industries: row.industries ?? [],
    location: row.location ?? '',
    yearsExperience: row.years_experience ?? 0,
  };
}
