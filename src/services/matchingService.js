/**
 * Job-to-candidate matching.
 *
 * The prototype previously trusted `matchScore` values baked into the seed
 * fixtures - which were calibrated for the demo account and therefore wrong for
 * every other user. This module computes the score from the requesting
 * candidate's profile and the job, so a freshly registered account sees honest
 * numbers: possibly low, never someone else's.
 *
 * It is pure: (job, profile) in, explanation out. The backend's matching
 * service will own the real algorithm; keeping this one in a single module
 * means the swap is an import change, and the contract on the shape
 * (`matchScore`, `matchReasons`, `skillGaps`) does not move.
 *
 * When the profile says nothing - a brand-new account with an empty profile -
 * the result is `null`, and callers must omit the score rather than fabricate
 * one. A zero that is not a judgement must not look like one.
 */
import { titleCase } from '../utils/format.js';

const EXPERIENCE_ORDER = { entry: 0, junior: 1, mid: 2, senior: 3, lead: 4 };

/** Points available to each signal. They must add to no more than 100. */
const WEIGHTS = {
  requiredSkills: 34,
  preferredSkills: 10,
  workType: 14,
  experience: 12,
  salary: 13,
  industry: 8,
  location: 6,
};

const normalise = (value) => String(value ?? '').trim().toLowerCase();

/** True once the profile contains anything a job could match against. */
function hasSomethingToMatch(profile) {
  if (!profile) return false;
  return Boolean(
    (profile.skills?.length ?? 0) > 0 ||
      (profile.workTypes?.length ?? 0) > 0 ||
      (profile.salaryExpectation?.min ?? 0) > 0 ||
      (profile.industries?.length ?? 0) > 0,
  );
}

/**
 * @param {import('../models/index.js').Job} job
 * @param {import('../models/index.js').CandidateProfile | null} profile
 * @returns {{ matchScore: number, matchReasons: string[], skillGaps: string[] } | null}
 */
export function scoreJobForProfile(job, profile) {
  if (!job || !hasSomethingToMatch(profile)) return null;

  const reasons = [];
  let score = 0;

  const held = new Map(
    (profile.skills ?? []).map((skill) => [normalise(skill.name), skill]),
  );
  const required = job.requiredSkills ?? [];
  const preferred = job.preferredSkills ?? [];

  /* ---- required skills: coverage weighted by how deep the skill goes ---- */
  if (required.length > 0) {
    let covered = 0;
    required.forEach((name) => {
      const skill = held.get(normalise(name));
      if (skill) covered += Math.max(0.4, Math.min(1, (skill.level ?? 50) / 100));
    });
    const share = covered / required.length;
    score += share * WEIGHTS.requiredSkills;
    if (share >= 1) {
      reasons.push(`Covers every required skill${required.length > 1 ? '' : ''}`);
    } else if (share > 0) {
      reasons.push(`Covers ${Math.round(share * required.length)} of ${required.length} required skills`);
    }
  }

  /* ---- preferred skills ---- */
  if (preferred.length > 0) {
    const matched = preferred.filter((name) => held.has(normalise(name)));
    score += (matched.length / preferred.length) * WEIGHTS.preferredSkills;
    if (matched.length > 0 && matched.length === preferred.length) {
      reasons.push('Holds every preferred skill');
    } else if (matched.length > 0) {
      reasons.push(`Also holds ${matched.join(', ')}`);
    }
  }

  /* ---- work type ---- */
  const wants = profile.workTypes ?? [];
  if (wants.length > 0) {
    if (wants.includes(job.workType)) {
      score += WEIGHTS.workType;
      reasons.push(`${titleCase(job.workType)} work matches your preference`);
    }
  }

  /* ---- experience level: close is good, far is not ---- */
  const jobLevel = EXPERIENCE_ORDER[job.experienceLevel];
  if (typeof jobLevel === 'number') {
    const years = profile.yearsExperience ?? 0;
    // Entry roles suit people early on; otherwise map years to a level band.
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

  /* ---- salary against expectation ---- */
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

  /* ---- industry interest ---- */
  const interests = (profile.industries ?? []).map(normalise);
  if (interests.length > 0 && interests.includes(normalise(job.industry))) {
    score += WEIGHTS.industry;
    reasons.push(`${job.industry} matches your industry interests`);
  }

  /* ---- location ---- */
  if (profile.location && job.location) {
    const home = normalise(profile.location).split(',')[0];
    if (home && normalise(job.location).includes(home)) {
      score += WEIGHTS.location;
      reasons.push(`Based where you are (${job.location})`);
    } else if (normalise(job.location).includes('remote') && (profile.workTypes ?? []).includes('remote')) {
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

/** Score a list of jobs against one profile, leaving nulls as `undefined`. */
export function scoreJobsForProfile(jobs, profile) {
  return jobs.map((job) => {
    const result = scoreJobForProfile(job, profile);
    return result
      ? { ...job, ...result }
      // No score yet - the UI hides the badge, as the contract requires.
      : { ...job, matchScore: undefined, matchReasons: [], skillGaps: [] };
  });
}