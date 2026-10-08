/**
 * The vocabulary that connects every game mechanic to a real career outcome.
 *
 * Nothing in the city, the apartment, the marketplace or the network awards XP
 * directly. They all emit one of these events, and the career store decides
 * what it is worth. Missions and achievements subscribe to the same events, so
 * a single action can advance progression, a mission and an achievement without
 * any of them knowing about each other.
 */
export const CAREER_EVENTS = {
  PROFILE_COMPLETED: 'profile.completed',
  CV_UPLOADED: 'cv.uploaded',
  ASSESSMENT_COMPLETED: 'assessment.completed',
  EXPERIENCE_ADDED: 'experience.added',
  JOB_VIEWED: 'job.viewed',
  JOB_SAVED: 'job.saved',
  SUITABLE_JOB_APPLIED: 'application.suitable',
  UNSUITABLE_JOB_APPLIED: 'application.unsuitable',
  INTERVIEW_SIMULATION_COMPLETED: 'interview.simulated',
  SKILL_CHALLENGE_COMPLETED: 'skill.challenge',
  COURSE_COMPLETED: 'course.completed',
  MISSION_COMPLETED: 'mission.completed',
  LOCATION_VISITED: 'location.visited',
  AI_CONSULTED: 'ai.consulted',
  POST_PUBLISHED: 'social.posted',
  CONNECTION_MADE: 'social.connected',
};

/**
 * XP is attached to meaningful career activity only.
 *
 * Note the deliberate zeros: viewing a job, saving a job, walking into a
 * district, posting and applying to a role that does not suit the candidate are
 * all worth nothing. Volume alone can never raise a career level, and no amount
 * of time spent in the product substitutes for career work.
 */
export const careerActions = {
  profileComplete: 50,
  cvComplete: 25,
  assessmentComplete: 75,
  skillChallenge: 100,
  interviewSimulation: 100,
  suitableApplication: 25,
  learningMission: 200,
};

/** The same table, keyed by the event that earns it. */
export const XP_REWARDS = {
  [CAREER_EVENTS.PROFILE_COMPLETED]: careerActions.profileComplete,
  [CAREER_EVENTS.CV_UPLOADED]: careerActions.cvComplete,
  [CAREER_EVENTS.ASSESSMENT_COMPLETED]: careerActions.assessmentComplete,
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: careerActions.skillChallenge,
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: careerActions.interviewSimulation,
  [CAREER_EVENTS.SUITABLE_JOB_APPLIED]: careerActions.suitableApplication,
  [CAREER_EVENTS.COURSE_COMPLETED]: careerActions.learningMission,

  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 0,
  [CAREER_EVENTS.EXPERIENCE_ADDED]: 0,
  [CAREER_EVENTS.JOB_VIEWED]: 0,
  [CAREER_EVENTS.JOB_SAVED]: 0,
  [CAREER_EVENTS.MISSION_COMPLETED]: 0,
  [CAREER_EVENTS.LOCATION_VISITED]: 0,
  [CAREER_EVENTS.AI_CONSULTED]: 0,
  [CAREER_EVENTS.POST_PUBLISHED]: 0,
  [CAREER_EVENTS.CONNECTION_MADE]: 0,
};

/**
 * Reputation moves on evidence, not activity.
 *
 * Only work another person could verify raises it: a passed assessment, a
 * completed course, a finished interview. Posting, connecting and applying do
 * not — credibility that could be farmed would not be credibility.
 */
export const REPUTATION_REWARDS = {
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 3,
  [CAREER_EVENTS.COURSE_COMPLETED]: 5,
  [CAREER_EVENTS.ASSESSMENT_COMPLETED]: 2,
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 2,
  [CAREER_EVENTS.PROFILE_COMPLETED]: 1,
};

/** Human-readable labels for the XP ledger, toasts and the activity stream. */
export const EVENT_LABELS = {
  [CAREER_EVENTS.PROFILE_COMPLETED]: 'Career profile completed',
  [CAREER_EVENTS.CV_UPLOADED]: 'CV uploaded',
  [CAREER_EVENTS.ASSESSMENT_COMPLETED]: 'AI career assessment completed',
  [CAREER_EVENTS.EXPERIENCE_ADDED]: 'Experience added',
  [CAREER_EVENTS.JOB_VIEWED]: 'Job viewed',
  [CAREER_EVENTS.JOB_SAVED]: 'Job saved',
  [CAREER_EVENTS.SUITABLE_JOB_APPLIED]: 'Applied to a suitable role',
  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 'Applied to a role outside your match range',
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 'Interview simulation completed',
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 'Skill challenge completed',
  [CAREER_EVENTS.COURSE_COMPLETED]: 'Course completed',
  [CAREER_EVENTS.MISSION_COMPLETED]: 'Mission completed',
  [CAREER_EVENTS.LOCATION_VISITED]: 'District visited',
  [CAREER_EVENTS.AI_CONSULTED]: 'Spoke with Grooveli AI',
  [CAREER_EVENTS.POST_PUBLISHED]: 'Shared a career post',
  [CAREER_EVENTS.CONNECTION_MADE]: 'Connected with a professional',
};

/**
 * A job has to be a plausible fit before an application counts as career
 * progress. The backend's matching service owns the real threshold; the
 * frontend mirrors it so the UI can explain itself before the user applies.
 */
export const SUITABLE_MATCH_THRESHOLD = 60;

/** @param {{ matchScore?: number }} job */
export function isSuitableApplication(job) {
  return (job?.matchScore ?? 0) >= SUITABLE_MATCH_THRESHOLD;
}
