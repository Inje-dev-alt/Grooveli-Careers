/**
 * Job-to-candidate matching, ported from src/services/matchingService.js.
 *
 * The frontend's real branch returns the API's response as-is (no client-side
 * scoring), so the server owns the score - same weights, same reasons, same
 * clamps, so the demo looks identical on mocks and on the API. If the two
 * ever drift, the contract that must hold is: matchScore 1-97, at most four
 * matchReasons written as sentences, skillGaps only for unheld required
 * skills, and NO score at all (omitted, not zero) when there is nothing to
 * match on.
 */

export type MatchProfile = {
  skills: { name: string; level?: number }[];
  workTypes: string[];
  salaryExpectation: { min: number };
  industries: string[];
  location: string;
  yearsExperience: number;
};

export type MatchResult = {
  matchScore: number;
  matchReasons: string[];
  skillGaps: string[];
};

type ScoreableJob = {
  requiredSkills: string[];
  preferredSkills: string[];
  workType: string;
  experienceLevel: string;
  salaryMin: number;
  salaryMax: number;
  industry: string;
  location: string;
};

const EXPERIENCE_ORDER: Record<string, number> = { entry: 0, junior: 1, mid: 2, senior: 3, lead: 4 };

const WEIGHTS = {
  requiredSkills: 34,
  preferredSkills: 10,
  workType: 14,
  experience: 12,
  salary: 13,
  industry: 8,
  location: 6,
};

const normalise = (value: unknown) => String(value ?? '').trim().toLowerCase();

const titleCase = (value = '') =>
  value
    .split(/[\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

function hasSomethingToMatch(profile: MatchProfile | null): profile is MatchProfile {
  if (!profile) return false;
  return Boolean(
    (profile.skills?.length ?? 0) > 0 ||
      (profile.workTypes?.length ?? 0) > 0 ||
      (profile.salaryExpectation?.min ?? 0) > 0 ||
      (profile.industries?.length ?? 0) > 0,
  );
}

export function scoreJobForProfile(
  job: ScoreableJob,
  profile: MatchProfile | null,
): MatchResult | null {
  if (!job || !hasSomethingToMatch(profile)) return null;

  const reasons: string[] = [];
  let score = 0;

  const held = new Map((profile.skills ?? []).map((skill) => [normalise(skill.name), skill]));
  const required = job.requiredSkills ?? [];
  const preferred = job.preferredSkills ?? [];

  if (required.length > 0) {
    let covered = 0;
    required.forEach((name) => {
      const skill = held.get(normalise(name));
      if (skill) covered += Math.max(0.4, Math.min(1, (skill.level ?? 50) / 100));
    });
    const share = covered / required.length;
    score += share * WEIGHTS.requiredSkills;
    if (share >= 1) reasons.push('Covers every required skill');
    else if (share > 0) reasons.push(`Covers ${Math.round(share * required.length)} of ${required.length} required skills`);
  }

  if (preferred.length > 0) {
    const matched = preferred.filter((name) => held.has(normalise(name)));
    score += (matched.length / preferred.length) * WEIGHTS.preferredSkills;
    if (matched.length > 0 && matched.length === preferred.length) reasons.push('Holds every preferred skill');
    else if (matched.length > 0) reasons.push(`Also holds ${matched.join(', ')}`);
  }

  const wants = profile.workTypes ?? [];
  if (wants.length > 0 && wants.includes(job.workType)) {
    score += WEIGHTS.workType;
    reasons.push(`${titleCase(job.workType)} work matches your preference`);
  }

  const jobLevel = EXPERIENCE_ORDER[job.experienceLevel];
  if (typeof jobLevel === 'number') {
    const years = profile.yearsExperience ?? 0;
    const candidateLevel = years === 0 ? 0 : years <= 2 ? 1 : years <= 5 ? 2 : years <= 9 ? 3 : 4;
    const distance = Math.abs(candidateLevel - jobLevel);
    if (distance === 0) {
      score += WEIGHTS.experience;
      reasons.push(`${titleCase(job.experienceLevel)} level fits your experience`);
    } else if (distance === 1) {
      score += Math.round(WEIGHTS.experience * 0.6);
      reasons.push('One level either side of your experience - close enough to argue');
    } else {
      score += Math.round(WEIGHTS.experience * 0.15);
    }
  }

  const expectation = profile.salaryExpectation;
  if ((expectation?.min ?? 0) > 0) {
    if (job.salaryMax >= expectation.min) {
      score += Math.round(WEIGHTS.salary * 0.75);
      reasons.push('Salary band clears your minimum');
      if (job.salaryMin >= expectation.min) {
        score += Math.round(WEIGHTS.salary * 0.25);
        reasons.push('The whole band is above your expectation');
      }
    }
  }

  const interests = (profile.industries ?? []).map(normalise);
  if (interests.length > 0 && interests.includes(normalise(job.industry))) {
    score += WEIGHTS.industry;
    reasons.push(`${job.industry} matches your industry interests`);
  }

  if (profile.location && job.location) {
    const home = normalise(profile.location).split(',')[0];
    if (home && normalise(job.location).includes(home)) {
      score += WEIGHTS.location;
      reasons.push(`Based where you are (${job.location})`);
    } else if (
      normalise(job.location).includes('remote') &&
      (profile.workTypes ?? []).includes('remote')
    ) {
      score += WEIGHTS.location;
      reasons.push('Remote fits the way you want to work');
    }
  }

  const skillGaps = required.filter((name) => !held.has(normalise(name)));

  return {
    matchScore: Math.max(1, Math.min(97, Math.round(score))),
    matchReasons: reasons.slice(0, 4),
    skillGaps,
  };
}
