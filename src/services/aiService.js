/**
 * Grooveli AI — the candidate's career companion.
 *
 * SECURITY BOUNDARY. No model provider is called from the browser and no
 * provider key exists in this bundle. When the AI is wired up, every function
 * below goes to Grooveli's own backend (`POST /ai/chat`), which holds the
 * credentials, applies rate limits and decides which tools the agent may use.
 * The replies here are deterministic and local.
 *
 * They are also grounded in the same data the rest of the app reads, so the
 * agent talks about this candidate's actual matches, gaps and applications
 * rather than producing generic chatbot filler.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { formatSalaryRange } from '../utils/format.js';
import { jobSkills } from './jobService.js';

/** Intents the Career Center can route. Free text falls back to `general`. */
export const AI_INTENTS = {
  FIND_JOBS: 'find-jobs',
  IMPROVE_CV: 'improve-cv',
  PREPARE_INTERVIEW: 'prepare-interview',
  FIND_SKILL_GAPS: 'find-skill-gaps',
  CAREER_ADVICE: 'career-advice',
  ASSESSMENT: 'assessment',
  INTERVIEW_SIM: 'interview-simulation',
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

/* ------------------------------------------------------------ context --- */

/** Everything the agent knows about this candidate, read once per call. */
function context() {
  const account = currentAccount();
  const profile = account?.candidateProfileId ? db.profiles[account.candidateProfileId] : null;
  const me = account?.id;
  const published = db.jobs.filter((j) => j.status === 'published');
  const scored = published.filter((j) => typeof j.matchScore === 'number');

  return {
    account,
    profile,
    progress: db.careerProgress[me] ?? { xp: 0, level: 1, reputation: 0 },
    applications: db.applications.filter((a) => a.candidateId === me),
    interviews: db.interviews,
    jobs: published,
    topMatches: [...scored].sort((a, b) => b.matchScore - a.matchScore).slice(0, 3),
    strongMatches: scored.filter((j) => j.matchScore >= 75),
    achievements: db.achievements[me] ?? [],
  };
}

/** Skills the candidate's strong matches ask for and the profile does not claim. */
function skillGaps(ctx) {
  const have = new Set((ctx.profile?.skills ?? []).map((s) => s.name.toLowerCase()));
  const wanted = ctx.jobs
    .filter((j) => (j.matchScore ?? 0) >= 60)
    .flatMap((j) => jobSkills(j));
  const counts = new Map();
  wanted.forEach((skill) => {
    if (have.has(skill.toLowerCase())) return;
    counts.set(skill, (counts.get(skill) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([skill, count]) => ({ skill, count }));
}

/* ----------------------------------------------------------- briefing --- */

/** @returns {Promise<import('../models/index.js').AIBriefing>} */
export function getBriefing() {
  return withMock(
    async () => {
      await delay(300);
      const ctx = context();
      const awaiting = ctx.applications.filter((a) => ['applied', 'under-review'].includes(a.status));
      const upcoming = ctx.interviews.filter(
        (i) => i.status === 'scheduled' && new Date(i.scheduledAt) > new Date(Date.now() - 86_400_000),
      );
      const firstName = (ctx.account?.displayName || 'there').split(' ')[0];

      return {
        greeting: `Welcome back, ${firstName}.`,
        question: 'What would you like to work on?',
        highlights: [
          { id: 'hl-matches', label: 'jobs match your profile', value: ctx.strongMatches.length, route: '/jobs' },
          { id: 'hl-apps', label: 'applications awaiting updates', value: awaiting.length, route: '/profile' },
          { id: 'hl-interviews', label: 'interview scheduled', value: upcoming.length, route: '/profile' },
        ].filter((h) => h.value > 0),
        actions: DEFAULT_ACTIONS,
      };
    },
    () => apiClient.get('/ai/briefing'),
  );
}

/* ------------------------------------------------------- next action --- */

/**
 * The single recommended next step, with the reason for it.
 *
 * The product should always be able to answer "what should I do next, and
 * why". The rules are ordered by what genuinely moves a career forward:
 * become legible to employers, find out where you stand, close the gap that
 * blocks the most roles, then apply.
 *
 * @returns {Promise<import('../models/index.js').NextCareerAction>}
 */
export function getNextCareerAction() {
  return withMock(
    async () => {
      await delay(280);
      const ctx = context();
      const profile = ctx.profile;
      const gaps = skillGaps(ctx);

      if (!profile || profile.completeness < 100) {
        return {
          id: 'next-profile',
          title: 'Complete your career profile',
          reason:
            'Employers see your Grooveli profile before anything else, and your match scores are calculated from it. An incomplete profile under-sells you to every role in the city.',
          xp: 50,
          actionLabel: 'Open profile',
          route: '/profile',
        };
      }

      if (!profile.cv?.hasCv) {
        return {
          id: 'next-cv',
          title: 'Upload your CV',
          reason:
            'Most employers still ask for one, and the AI reads it to find gaps your profile does not mention.',
          xp: 25,
          actionLabel: 'Upload CV',
          route: '/profile',
        };
      }

      if (!ctx.achievements.includes('ach-interview-ready')) {
        return {
          id: 'next-interview',
          title: 'Complete an interview simulation',
          reason:
            'You have applications in flight. Practising now, while nothing is at stake, is worth more than practising the night before.',
          xp: 100,
          actionLabel: 'Start simulation',
          route: '/ai',
          intent: AI_INTENTS.INTERVIEW_SIM,
        };
      }

      if (gaps.length > 0) {
        const [top] = gaps;
        return {
          id: `next-skill-${top.skill}`,
          title: `Build your ${top.skill} skill`,
          reason: `${top.skill} appears in ${top.count} of the roles you are matching above 60%. It is the single gap blocking the most opportunities.`,
          xp: 100,
          actionLabel: 'Find a skill mission',
          route: '/missions',
        };
      }

      if (ctx.applications.length < 3) {
        return {
          id: 'next-apply',
          title: 'Apply to a role above 75% match',
          reason:
            'Your profile is in good shape and nothing is blocking you. Three focused applications will do more than twenty scattered ones.',
          xp: 25,
          actionLabel: 'Browse matches',
          route: '/jobs',
        };
      }

      return {
        id: 'next-course',
        title: 'Complete a course at the Training Center',
        reason:
          'Certifications are the part of a profile employers trust most, and you have none outstanding to chase.',
        xp: 200,
        actionLabel: 'Browse courses',
        route: '/city',
      };
    },
    () => apiClient.get('/ai/career/next-action'),
  );
}

/* --------------------------------------------------- career discovery --- */

/**
 * Career paths worth considering, with the reasoning behind each.
 * @returns {Promise<import('../models/index.js').CareerMatch[]>}
 */
export function getCareerMatches() {
  return withMock(
    async () => {
      await delay(520);
      const ctx = context();
      const have = (ctx.profile?.skills ?? []).filter((s) => s.level >= 65).map((s) => s.name);
      const gaps = skillGaps(ctx);

      /** Career paths are defined by the skills they lean on. */
      const paths = [
        { id: 'path-talent-ops', title: 'Talent Operations Specialist', core: ['Recruitment', 'HR Operations', 'Excel'], growth: ['Data Analysis'], summary: 'Owns the systems and process behind hiring, rather than the conversations. Pays a premium where automation is involved.' },
        { id: 'path-people-systems', title: 'People Systems Analyst', core: ['HR Operations', 'Excel', 'AI Automation'], growth: ['Data Analysis', 'SQL'], summary: 'Sits between the people team and engineering. The fastest-growing band in this market.' },
        { id: 'path-recruitment-lead', title: 'Recruitment Lead', core: ['Recruitment', 'Stakeholder Management', 'Communication'], growth: ['Project Management'], summary: 'Runs hiring for a function and manages a small team. A natural step from specialist work.' },
        { id: 'path-hr-analytics', title: 'HR Analytics Partner', core: ['HR Operations', 'Data Analysis'], growth: ['SQL', 'Data Analysis'], summary: 'Turns people data into decisions. Scarce skill set, and employers pay for it.' },
      ];

      return paths
        .map((path) => {
          const strengths = path.core.filter((s) => have.includes(s));
          const missing = [...path.core.filter((s) => !have.includes(s)), ...path.growth.filter((s) => !have.includes(s))];
          const matchScore = Math.round((strengths.length / path.core.length) * 78 + (missing.length === 0 ? 22 : 0));
          return {
            id: path.id,
            title: path.title,
            matchScore: Math.max(18, Math.min(97, matchScore + (gaps.length ? 0 : 5))),
            strengths,
            gaps: missing.slice(0, 2),
            summary: path.summary,
          };
        })
        .sort((a, b) => b.matchScore - a.matchScore);
    },
    () => apiClient.get('/ai/career/discovery'),
  );
}

/* --------------------------------------------------------------- chat --- */

function buildReply(intent, content) {
  const ctx = context();
  const gaps = skillGaps(ctx);
  const awaiting = ctx.applications.filter((a) => ['applied', 'under-review'].includes(a.status));
  const nextInterview = ctx.interviews.find((i) => i.status === 'scheduled');

  switch (intent) {
    case AI_INTENTS.FIND_JOBS: {
      if (ctx.topMatches.length === 0) {
        return message('assistant', 'Nothing is scored against your profile yet. Complete your career profile and I will have something to match on.', { actions: [{ id: 'act-profile', label: 'Open my profile', intent: AI_INTENTS.GENERAL }] });
      }
      const lines = ctx.topMatches.map(
        (job) => `• ${job.title} — ${job.companyName}, ${formatSalaryRange(job)} (${job.matchScore}% match)`,
      );
      return message(
        'assistant',
        [
          `I looked at ${ctx.jobs.length} open roles against your profile.`,
          `${ctx.topMatches.length} are worth your time right now:`,
          '',
          ...lines,
          '',
          'The common thread is people operations with a systems edge — that is where your experience prices highest.',
        ].join('\n'),
        {
          references: { jobIds: ctx.topMatches.map((j) => j.id) },
          actions: [
            { id: 'act-open-jobs', label: 'Open these matches', intent: AI_INTENTS.FIND_JOBS },
            { id: 'act-gaps-2', label: 'What am I missing?', intent: AI_INTENTS.FIND_SKILL_GAPS },
          ],
        },
      );
    }

    case AI_INTENTS.IMPROVE_CV: {
      const hasCv = ctx.profile?.cv?.hasCv;
      return message(
        'assistant',
        hasCv
          ? [
              `I read ${ctx.profile.cv.fileName}. Three things would move it:`,
              '',
              '1. Your opening line describes a job title, not an outcome. Lead with the result you are proudest of.',
              '2. Several bullets describe responsibilities. Convert them to results with a number attached.',
              '3. The skills your strongest matches ask for appear at the bottom. They belong in the first third.',
            ].join('\n')
          : [
              'I do not have a CV on file, so I am working from your profile alone.',
              '',
              'Upload it and I will check it against the roles you actually match. The gap between how you describe your work and how these employers describe it is usually where applications die.',
            ].join('\n'),
        { actions: [{ id: 'act-profile', label: hasCv ? 'Open my profile' : 'Upload CV', intent: AI_INTENTS.GENERAL }] },
      );
    }

    case AI_INTENTS.PREPARE_INTERVIEW:
      return message(
        'assistant',
        nextInterview
          ? [
              `Your next interview is ${nextInterview.type} with ${nextInterview.companyName} for ${nextInterview.jobTitle}.`,
              '',
              'Expect three things: a walkthrough of a process you owned end to end, one scenario about an error caught late, and a question about a deadline you could not move.',
              '',
              'Run the simulation and I will score the answers rather than just reacting to them.',
            ].join('\n')
          : [
              'Nothing is scheduled, which makes this the right time to practise.',
              '',
              'I will run a six-question simulation for a role in your match range and score structure, specificity and recovery.',
            ].join('\n'),
        { actions: [{ id: 'act-sim', label: 'Start interview simulation', intent: AI_INTENTS.INTERVIEW_SIM }] },
      );

    case AI_INTENTS.FIND_SKILL_GAPS: {
      const top = gaps.slice(0, 4);
      return message(
        'assistant',
        [
          top.length
            ? `Across the roles you match at 60% or better, ${top.length} skills keep appearing that your profile does not claim:`
            : 'Nothing is blocking you on the roles you currently match.',
          '',
          ...top.map((g) => `• ${g.skill} — asked for in ${g.count} ${g.count === 1 ? 'role' : 'roles'}`),
          '',
          top.length
            ? `${top[0].skill} is the one worth doing first: it blocks the most roles, and the Training Center course is four weeks.`
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

    case AI_INTENTS.CAREER_ADVICE:
      return message(
        'assistant',
        [
          'Here is the honest read on where you stand.',
          '',
          `You are at career level ${ctx.progress.level} with ${ctx.progress.xp.toLocaleString('en-US')} XP. That is progression, not credibility — your reputation of ${ctx.progress.reputation} is what employers weigh, and it moves on verified work rather than activity.`,
          '',
          awaiting.length
            ? `You have ${awaiting.length} applications in flight. Do not add volume while those are live; a focused pipeline reads better than a wide one, and employers notice.`
            : 'You have nothing in flight. Pick three roles above 75% rather than ten above 40%.',
          '',
          gaps.length
            ? `The fastest return on the next month: verify ${gaps[0].skill}, then apply to your three strongest matches with a tailored opening paragraph each.`
            : 'The fastest return on the next month: apply to your three strongest matches with a tailored opening paragraph each.',
        ].join('\n'),
        { actions: DEFAULT_ACTIONS.slice(0, 3) },
      );

    default: {
      const query = (content || '').trim();
      return message(
        'assistant',
        [
          query
            ? `On "${query.length > 90 ? `${query.slice(0, 90)}…` : query}" — here is what I can see from your profile and the live roles.`
            : 'I am here. I can see your profile, your applications and every role currently open in the city.',
          '',
          `Right now: ${ctx.topMatches.length} strong matches, ${awaiting.length} applications awaiting updates${nextInterview ? ', and one interview scheduled' : ''}.`,
          '',
          'Tell me which of those to work on, or pick one below.',
        ].join('\n'),
        { actions: DEFAULT_ACTIONS },
      );
    }
  }
}

/**
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

/** The AI career assessment: a calibrated read, not a score alone. */
export function runCareerAssessment() {
  return withMock(
    async () => {
      await delay(1100);
      const ctx = context();
      const gaps = skillGaps(ctx).slice(0, 2).map((g) => g.skill);
      const strengths = (ctx.profile?.skills ?? [])
        .filter((s) => s.level >= 70)
        .slice(0, 3)
        .map((s) => s.name);

      return {
        completedAt: new Date().toISOString(),
        readinessScore: Math.min(96, 54 + strengths.length * 8 + (ctx.profile?.completeness ?? 0) / 8),
        summary:
          'You present as an operator who has outgrown the administrative half of the role. Your evidence is strongest where a process was broken and you fixed it; it is weakest where you need to show influence without authority.',
        strengths: strengths.length ? strengths : ['Process ownership'],
        development: gaps.length ? gaps : ['Formal project management'],
        recommendedRoles: ['People Systems Analyst', 'Talent Operations Specialist', 'HR Analytics Partner'],
      };
    },
    () => apiClient.post('/ai/assessment'),
  );
}

/** Interview simulation. Scoring is the backend's job; the UI renders it. */
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
