/**
 * The vocabulary that connects every game mechanic to a real career outcome.
 *
 * Nothing in the city, the apartment or the AI centre awards XP directly.
 * They all emit one of these events, and the career store decides what it is
 * worth. Missions subscribe to the same events, so a single action can advance
 * progression and mission objectives without either knowing about the other.
 */
export const CAREER_EVENTS = {
  PROFILE_COMPLETED: 'profile.completed',
  CV_UPLOADED: 'cv.uploaded',
  ASSESSMENT_COMPLETED: 'assessment.completed',
  JOB_VIEWED: 'job.viewed',
  JOB_SAVED: 'job.saved',
  SUITABLE_JOB_APPLIED: 'application.suitable',
  UNSUITABLE_JOB_APPLIED: 'application.unsuitable',
  INTERVIEW_SIMULATION_COMPLETED: 'interview.simulated',
  SKILL_CHALLENGE_COMPLETED: 'skill.challenge',
  COURSE_COMPLETED: 'course.completed',
  LOCATION_VISITED: 'location.visited',
  AI_CONSULTED: 'ai.consulted',
};

/**
 * XP is attached to meaningful career activity only.
 *
 * Note the deliberate omissions: viewing a job, saving a job and applying to a
 * job that does not suit the candidate are all worth zero. The PRD is explicit
 * that the system must not reward spam applications, so volume alone can never
 * raise a career level.
 */
export const XP_REWARDS = {
  [CAREER_EVENTS.PROFILE_COMPLETED]: 50,
  [CAREER_EVENTS.CV_UPLOADED]: 25,
  [CAREER_EVENTS.ASSESSMENT_COMPLETED]: 75,
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 100,
  [CAREER_EVENTS.SUITABLE_JOB_APPLIED]: 25,
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 100,
  [CAREER_EVENTS.COURSE_COMPLETED]: 200,
  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 0,
  [CAREER_EVENTS.JOB_VIEWED]: 0,
  [CAREER_EVENTS.JOB_SAVED]: 0,
  [CAREER_EVENTS.LOCATION_VISITED]: 0,
  [CAREER_EVENTS.AI_CONSULTED]: 0,
};

/** Human-readable labels for the XP ledger and toasts. */
export const EVENT_LABELS = {
  [CAREER_EVENTS.PROFILE_COMPLETED]: 'Career profile completed',
  [CAREER_EVENTS.CV_UPLOADED]: 'CV uploaded',
  [CAREER_EVENTS.ASSESSMENT_COMPLETED]: 'AI career assessment completed',
  [CAREER_EVENTS.JOB_VIEWED]: 'Job viewed',
  [CAREER_EVENTS.JOB_SAVED]: 'Job saved',
  [CAREER_EVENTS.SUITABLE_JOB_APPLIED]: 'Applied to a suitable role',
  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 'Applied to a role outside your match range',
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 'Interview simulation completed',
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 'Skill challenge completed',
  [CAREER_EVENTS.COURSE_COMPLETED]: 'Course completed',
  [CAREER_EVENTS.LOCATION_VISITED]: 'District visited',
  [CAREER_EVENTS.AI_CONSULTED]: 'Spoke with Grooveli AI',
};

/**
 * A job has to be a plausible fit before an application counts as career
 * progress. The backend's matching service owns the real threshold; the
 * frontend mirrors it so the UI can explain itself before applying.
 */
export const SUITABLE_MATCH_THRESHOLD = 60;

/** @param {{ matchScore?: number }} job */
export function isSuitableApplication(job) {
  return (job?.matchScore ?? 0) >= SUITABLE_MATCH_THRESHOLD;
}
