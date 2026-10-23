/**
 * The vocabulary that connects every game mechanic to a real career outcome.
 *
 * Nothing in the city, the apartment, the marketplace or the network awards XP
 * directly. They all emit one of these events, and the career store decides
 * what it is worth. Missions and achievements subscribe to the same events, so
 * a single action can advance progression, a mission and an achievement without
 * any of them knowing about each other.
 *
 * The backend owns this vocabulary. `POST /career/events` receives one of these
 * strings and decides for itself what it is worth, keyed so a retried request
 * can never double-award.
 *
 * **The tables below are a mirror, not the authority.** They exist so the
 * interface can explain an award *before* it happens - "applying to this role
 * earns 25 XP", "below your match range, no XP" - and so the mock backend can
 * stand in for the real one. Nothing in the browser may add XP to a total: the
 * only number that reaches the store is the one the server replied with. The
 * server's copies live in `supabase/functions/api/_shared/progression.ts` and
 * the two must not drift; if you change a number here, change it there too.
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
  APPLICATION_REJECTED: 'application.rejected',
  INTERVIEW_SIMULATION_COMPLETED: 'interview.simulated',
  SKILL_CHALLENGE_COMPLETED: 'skill.challenge',
  COURSE_COMPLETED: 'course.completed',
  MISSION_COMPLETED: 'mission.completed',
  LOCATION_VISITED: 'location.visited',
  AI_CONSULTED: 'ai.consulted',
  POST_PUBLISHED: 'social.posted',
  CONNECTION_MADE: 'social.connected',
  REFERRAL_REQUESTED: 'referral.requested',
  OFFER_RECEIVED: 'offer.received',
  OFFER_ACCEPTED: 'offer.accepted',
  OFFER_DECLINED: 'offer.declined',
};

/**
 * XP is attached to meaningful career activity only. Mirror of the server's
 * table, for explaining an award in advance - never for making one.
 *
 * Note the deliberate zeros: viewing a job, saving a job, walking into a
 * district, posting, being rejected, and applying to a role that does not suit
 * the candidate are all worth nothing. Volume alone can never raise a career
 * level, and no amount of time spent in the product substitutes for career
 * work. The one large award - accepting a real offer - is the hardest thing a
 * candidate can do here, and the only one that ends with a job.
 */
export const careerActions = {
  profileComplete: 50,
  cvComplete: 25,
  assessmentComplete: 75,
  skillChallenge: 100,
  interviewSimulation: 100,
  suitableApplication: 25,
  learningMission: 200,
  offerAccepted: 150,
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
  [CAREER_EVENTS.OFFER_ACCEPTED]: careerActions.offerAccepted,

  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 0,
  [CAREER_EVENTS.APPLICATION_REJECTED]: 0,
  [CAREER_EVENTS.OFFER_RECEIVED]: 0,
  [CAREER_EVENTS.OFFER_DECLINED]: 0,
  [CAREER_EVENTS.REFERRAL_REQUESTED]: 0,
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
 * completed course, a finished interview, a signed offer. Posting, connecting,
 * being rejected and applying do not - credibility that could be farmed would
 * not be credibility. Mission completion deliberately adds none: the verifiable
 * work inside the mission is already counted by its own event.
 */
export const REPUTATION_REWARDS = {
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 3,
  [CAREER_EVENTS.COURSE_COMPLETED]: 5,
  [CAREER_EVENTS.ASSESSMENT_COMPLETED]: 2,
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 2,
  [CAREER_EVENTS.PROFILE_COMPLETED]: 1,
  [CAREER_EVENTS.OFFER_ACCEPTED]: 5,
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
  [CAREER_EVENTS.APPLICATION_REJECTED]: 'Application not progressing',
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 'Interview simulation completed',
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 'Skill challenge completed',
  [CAREER_EVENTS.COURSE_COMPLETED]: 'Course completed',
  [CAREER_EVENTS.MISSION_COMPLETED]: 'Mission completed',
  [CAREER_EVENTS.LOCATION_VISITED]: 'District visited',
  [CAREER_EVENTS.AI_CONSULTED]: 'Spoke with Grooveli AI',
  [CAREER_EVENTS.POST_PUBLISHED]: 'Shared a career post',
  [CAREER_EVENTS.CONNECTION_MADE]: 'Connected with a professional',
  [CAREER_EVENTS.REFERRAL_REQUESTED]: 'Asked a connection for a referral',
  [CAREER_EVENTS.OFFER_RECEIVED]: 'Offer received',
  [CAREER_EVENTS.OFFER_ACCEPTED]: 'Offer accepted',
  [CAREER_EVENTS.OFFER_DECLINED]: 'Offer declined',
};

/**
 * Events that may only ever be counted once per account, however often the
 * screen that fires them re-renders.
 *
 * Mirrored from the server so the interface can skip a request it knows will be
 * refused, and so the mock can enforce the same rule. The guarantee itself is
 * the server's: a partial unique index on `career_events`.
 */
export const ONE_SHOT_EVENTS = new Set([
  CAREER_EVENTS.PROFILE_COMPLETED,
  CAREER_EVENTS.CV_UPLOADED,
  CAREER_EVENTS.ASSESSMENT_COMPLETED,
]);

/**
 * The context field that makes each event unique, and therefore the field a
 * call site has to send.
 *
 * This is the anti-farming rule, and it is worth understanding before adding a
 * `recordCareerEvent` call. The server keys each event on the thing it is
 * *about* - this application, this course, this skill, this district - so the
 * database enforces one award per thing rather than one per click. An event
 * that arrives without its field cannot be keyed, so an XP-bearing one is
 * refused with a 400 naming the field (`routes/career.ts`), and a zero-XP one
 * is counted but stops being distinct - "visit five districts" would collapse
 * into "visit one district five times".
 *
 * `recordCareerEvent` warns in development when a field listed here is
 * missing, which is cheaper than finding out from a 400 in production.
 */
export const EVENT_CONTEXT_KEY = {
  [CAREER_EVENTS.SUITABLE_JOB_APPLIED]: 'applicationId',
  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 'applicationId',
  [CAREER_EVENTS.APPLICATION_REJECTED]: 'applicationId',
  [CAREER_EVENTS.OFFER_RECEIVED]: 'applicationId',
  [CAREER_EVENTS.OFFER_ACCEPTED]: 'applicationId',
  [CAREER_EVENTS.OFFER_DECLINED]: 'applicationId',
  [CAREER_EVENTS.EXPERIENCE_ADDED]: 'experienceId',
  [CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED]: 'simulationId',
  [CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED]: 'skill',
  [CAREER_EVENTS.COURSE_COMPLETED]: 'courseId',
  [CAREER_EVENTS.MISSION_COMPLETED]: 'missionId',
  [CAREER_EVENTS.JOB_VIEWED]: 'jobId',
  [CAREER_EVENTS.JOB_SAVED]: 'jobId',
  [CAREER_EVENTS.LOCATION_VISITED]: 'location',
  [CAREER_EVENTS.POST_PUBLISHED]: 'postId',
  [CAREER_EVENTS.CONNECTION_MADE]: 'connectionId',
  [CAREER_EVENTS.REFERRAL_REQUESTED]: 'referralId',
};

/**
 * Which career statistic an event advances, in the camelCase the API serves.
 *
 * `interviews` and `offers` are deliberately absent: they move on application
 * *stage* transitions, which the pipeline drives, not on anything a candidate's
 * browser can fire.
 */
export const STAT_FOR_EVENT = {
  [CAREER_EVENTS.MISSION_COMPLETED]: 'completedMissions',
  [CAREER_EVENTS.SUITABLE_JOB_APPLIED]: 'applications',
  [CAREER_EVENTS.UNSUITABLE_JOB_APPLIED]: 'applications',
  [CAREER_EVENTS.COURSE_COMPLETED]: 'certifications',
  [CAREER_EVENTS.JOB_VIEWED]: 'jobsViewed',
  [CAREER_EVENTS.LOCATION_VISITED]: 'locationsVisited',
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