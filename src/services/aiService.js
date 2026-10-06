/**
 * Grooveli AI — the candidate's career agent.
 *
 * SECURITY BOUNDARY. No model provider is called from the browser and no
 * provider key exists in this bundle. When the AI is wired up, every request
 * below goes to Grooveli's own backend (`POST /ai/chat`), which holds the
 * credentials, applies rate limits and decides which tools the agent may use.
 * The mock replies here are deterministic and local.
 *
 * The replies are grounded in the same mock data the rest of the app reads, so
 * the agent talks about the candidate's actual matches and applications rather
 * than producing generic chatbot filler.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { formatSalaryRange } from '../utils/format.js';

/** Intents the AI Career Center can route. Free text falls back to `general`. */
export const AI_INTENTS = {
  FIND_JOBS: 'find-jobs',
  IMPROVE_CV: 'improve-cv',
  PREPARE_INTERVIEW: 'prepare-interview',
  FIND_SKILL_GAPS: 'find-skill-gaps',
  CAREER_ADVICE: 'career-advice',
  ASSESSMENT: 'assessment',
  GENERAL: 'general',
};

const DEFAULT_ACTIONS = [
  { id: 'act-jobs', label: 'Find Jobs', intent: AI_INTENTS.FIND_JOBS },
  { id: 'act-cv', label: 'Improve My CV', intent: AI_INTENTS.IMPROVE_CV },
  { id: 'act-interview', label: 'Prepare for Interview', intent: AI_INTENTS.PREPARE_INTERVIEW },
  { id: 'act-gaps', label: 'Find Skill Gaps', intent: AI_INTENTS.FIND_SKILL_GAPS },
  { id: 'act-advice', label: 'Career Advice', intent: AI_INTENTS.CAREER_ADVICE },
];

const message = (role, content, extra = {}) => ({
  id: nextId('msg'),
  role,
  content,
  createdAt: new Date().toISOString(),
  ...extra,
});

/**
 * The standing briefing shown when the Career Center opens.
 * Counts are derived, never hardcoded, so the briefing stays true as the
 * candidate acts.
 *
 * @returns {Promise<import('../models/index.js').AIBriefing>}
 */
export function getBriefing() {
  return withMock(
    async () => {
      await delay(300);
      const strongMatches = db.jobs.filter((j) => j.matchScore >= 75);
      const awaiting = db.applications.filter((a) => ['submitted', 'in-review'].includes(a.status));
      const upcoming = db.interviews.filter(
        (i) => i.status === 'scheduled' && new Date(i.scheduledAt) > new Date(Date.now() - 86_400_000),
      );
      const recommendedMissions = db.missions.filter((m) => m.type === 'skill').slice(0, 1);

      return {
        greeting: `Welcome back, ${db.user.displayName.split(' ')[0]}.`,
        question: 'What would you like to work on?',
        highlights: [
          { id: 'hl-matches', label: 'new job matches', value: strongMatches.length, route: '/jobs' },
          { id: 'hl-apps', label: 'applications awaiting updates', value: awaiting.length, route: '/profile' },
          { id: 'hl-interviews', label: 'interview scheduled', value: upcoming.length, route: '/profile' },
          { id: 'hl-missions', label: 'recommended skill mission', value: recommendedMissions.length, route: '/missions' },
        ].filter((h) => h.value > 0),
        actions: DEFAULT_ACTIONS,
      };
    },
    () => apiClient.get('/ai/briefing'),
  );
}

function buildReply(intent, content) {
  const topMatches = [...db.jobs].sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
  const gaps = [...new Set(db.jobs.filter((j) => j.matchScore >= 60).flatMap((j) => j.skillGaps))];
  const awaiting = db.applications.filter((a) => ['submitted', 'in-review'].includes(a.status));
  const nextInterview = db.interviews.find((i) => i.status === 'scheduled');

  switch (intent) {
    case AI_INTENTS.FIND_JOBS: {
      const lines = topMatches.map(
        (job) => `• ${job.title} — ${job.companyName}, ${formatSalaryRange(job.salary)} (${job.matchScore}% match)`,
      );
      return message(
        'assistant',
        [
          `I looked at ${db.jobs.length} open roles against your profile.`,
          `${topMatches.length} are worth your time right now:`,
          '',
          ...lines,
          '',
          'The common thread is people operations with a systems edge — that is where your experience prices highest.',
        ].join('\n'),
        {
          references: { jobIds: topMatches.map((j) => j.id) },
          actions: [
            { id: 'act-open-jobs', label: 'Open these matches', intent: AI_INTENTS.FIND_JOBS },
            { id: 'act-gaps-2', label: 'What am I missing?', intent: AI_INTENTS.FIND_SKILL_GAPS },
          ],
        },
      );
    }

    case AI_INTENTS.IMPROVE_CV: {
      const hasCv = db.profile.cv?.hasCv;
      return message(
        'assistant',
        hasCv
          ? [
              `I read ${db.profile.cv.fileName}. Three things would move it:`,
              '',
              '1. Your opening line describes a job title, not an outcome. Lead with the payroll migration — it is the strongest thing on the page.',
              '2. Four bullets describe responsibilities. Convert them to results with a number attached.',
              '3. Automation appears once, at the bottom. Three of your top matches ask for it explicitly; it belongs in the first third.',
            ].join('\n')
          : [
              'I do not have a CV on file yet, so I am working from your profile alone.',
              '',
              'Upload it and I will check it against the roles you are actually matching — the gap between how you describe your work and how these employers describe it is usually where applications die.',
            ].join('\n'),
        {
          actions: [
            { id: 'act-profile', label: hasCv ? 'Open my profile' : 'Upload CV', intent: AI_INTENTS.GENERAL },
            { id: 'act-gaps-3', label: 'Find skill gaps', intent: AI_INTENTS.FIND_SKILL_GAPS },
          ],
        },
      );
    }

    case AI_INTENTS.PREPARE_INTERVIEW: {
      return message(
        'assistant',
        nextInterview
          ? [
              `Your next interview is ${nextInterview.type} with ${nextInterview.companyName} for ${nextInterview.jobTitle}.`,
              '',
              'Expect three things: a walkthrough of a payroll cycle you owned end to end, one scenario about an error caught late, and a question about how you handle a deadline you cannot move.',
              '',
              'Run the simulation and I will score the answers rather than just reacting to them.',
            ].join('\n')
          : [
              'Nothing is scheduled, which makes this the right time to practise.',
              '',
              'I will run a six-question simulation for a role in your match range and score structure, specificity and recovery.',
            ].join('\n'),
        {
          actions: [
            { id: 'act-sim', label: 'Start interview simulation', intent: AI_INTENTS.PREPARE_INTERVIEW },
            { id: 'act-advice-2', label: 'What should I ask them?', intent: AI_INTENTS.CAREER_ADVICE },
          ],
        },
      );
    }

    case AI_INTENTS.FIND_SKILL_GAPS: {
      const top = gaps.slice(0, 4);
      return message(
        'assistant',
        [
          top.length
            ? `Across the roles you match at 60% or better, ${top.length} skills keep appearing that your profile does not claim:`
            : 'Nothing is blocking you on the roles you currently match.',
          '',
          ...top.map((gap) => `• ${gap}`),
          '',
          top.length
            ? 'Data Analysis is the one worth doing first — it appears in the highest-paying matches and the Training Center course is four weeks.'
            : 'Keep applying and I will re-check as new roles come in.',
        ].join('\n'),
        {
          actions: [
            { id: 'act-missions', label: 'Show skill missions', intent: AI_INTENTS.GENERAL },
            { id: 'act-jobs-2', label: 'Jobs I already qualify for', intent: AI_INTENTS.FIND_JOBS },
          ],
        },
      );
    }

    case AI_INTENTS.CAREER_ADVICE: {
      return message(
        'assistant',
        [
          'Here is the honest read on where you stand.',
          '',
          `You are strongest in recruitment and HR operations, and the market is paying a premium for people who can also automate them. That is a narrow, well-paid lane and you are two skills from the middle of it.`,
          '',
          awaiting.length
            ? `You have ${awaiting.length} applications in flight. Do not add volume while those are live — a focused pipeline reads better than a wide one, and employers notice.`
            : 'You have nothing in flight. Pick three roles above 75% rather than ten above 40%.',
          '',
          'The fastest return on the next month: finish the AI assessment, verify Excel through the skill mission, then apply to the three strongest matches with a tailored opening paragraph each.',
        ].join('\n'),
        { actions: DEFAULT_ACTIONS.slice(0, 3) },
      );
    }

    default: {
      const query = (content || '').trim();
      return message(
        'assistant',
        [
          query
            ? `On "${query.length > 90 ? `${query.slice(0, 90)}…` : query}" — here is what I can see from your profile and the live roles.`
            : 'I am here. I can see your profile, your applications and every role currently open in the city.',
          '',
          `Right now: ${topMatches.length} strong matches, ${awaiting.length} applications awaiting updates${
            nextInterview ? ', and one interview scheduled' : ''
          }.`,
          '',
          'Tell me which of those to work on, or pick one below.',
        ].join('\n'),
        { actions: DEFAULT_ACTIONS },
      );
    }
  }
}

/**
 * Send a message to the career agent.
 *
 * @param {{ conversationId?: string, content?: string, intent?: string }} payload
 * @returns {Promise<import('../models/index.js').AIMessage>}
 */
export function sendMessage(payload) {
  return withMock(
    async () => {
      await delay(760);
      return buildReply(payload.intent || AI_INTENTS.GENERAL, payload.content);
    },
    () => apiClient.post('/ai/chat', payload),
  );
}

/**
 * The AI career assessment.
 * Returns a calibrated read on the candidate rather than a score alone.
 */
export function runCareerAssessment() {
  return withMock(
    async () => {
      await delay(1100);
      return {
        completedAt: new Date().toISOString(),
        readinessScore: 78,
        summary:
          'You present as an operator who has outgrown the administrative half of the role. Your evidence is strongest where a process was broken and you fixed it; it is weakest where you need to show influence without authority.',
        strengths: ['Process ownership', 'Candidate experience', 'Stakeholder communication'],
        development: ['Data analysis', 'Formal project management'],
        recommendedRoles: ['People Systems Analyst', 'HR Operations Lead', 'Healthcare Recruiter'],
      };
    },
    () => apiClient.post('/ai/assessment'),
  );
}

/**
 * Interview simulation.
 * Scoring is the backend's job; the frontend renders the result.
 */
export function runInterviewSimulation({ jobTitle } = {}) {
  return withMock(
    async () => {
      await delay(1200);
      const score = 74 + Math.floor(Math.random() * 20);
      return {
        jobTitle: jobTitle || 'People Systems Analyst',
        companyName: 'Grooveli AI',
        score,
        completedAt: new Date().toISOString(),
        feedback: [
          { area: 'Structure', note: 'Answers landed in a clear situation-action-result shape.' },
          { area: 'Specificity', note: 'Two answers needed a number. Name the scale you worked at.' },
          { area: 'Recovery', note: 'You handled the follow-up on the missed deadline well — you owned it without over-explaining.' },
        ],
      };
    },
    () => apiClient.post('/ai/interview-simulation', { jobTitle }),
  );
}

