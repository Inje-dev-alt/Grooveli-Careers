/**
 * The canonical career-path catalog: ten paths, one source of truth.
 *
 * Everything that talks about careers reads this file: Career Discovery
 * matches against it, onboarding interests are drawn from it, interview
 * simulations pick their question bank by it, and districts in the city are
 * mapped to it. A new path is one entry here plus a question bank - never an
 * edit to a screen.
 *
 * The backend will own this catalog (`GET /career-paths`); the shape is the
 * contract. Skills deliberately reuse the vocabulary the job fixtures already
 * speak, so matching works without a translation layer.
 *
 * @typedef {Object} CareerPath
 * @property {string} id
 * @property {string} title
 * @property {string} districtId        where this career lives in Grooveli City
 * @property {string} tagline           one line for cards and the landing page
 * @property {string} summary           the honest pitch: what the work is
 * @property {string[]} core            skills the path is built on
 * @property {string[]} growth          skills that accelerate the path
 * @property {string} interviewBankId   question bank for interview simulations
 */

/** @type {CareerPath[]} */
export const CAREER_PATHS = [
  {
    id: 'path-hr',
    title: 'Human Resources',
    districtId: 'recruitment-agency',
    tagline: 'Hiring, people operations and the systems behind them.',
    summary:
      'Run recruitment, own people operations, and build the processes that keep an organisation running. The most automatable people-function there is - which is exactly where the premium sits.',
    core: ['Recruitment', 'HR Operations', 'Communication'],
    growth: ['Excel', 'Data Analysis', 'AI Automation'],
    interviewBankId: 'bank-hr',
  },
  {
    id: 'path-software',
    title: 'Software Development',
    districtId: 'technology-hub',
    tagline: 'Build the services and products everything else runs on.',
    summary:
      'Backend, frontend or full-stack: correctness-critical code with real users. The fastest-moving salary band in the city and the clearest evidence trail - what you shipped speaks for you.',
    core: ['React', 'Node.js', 'SQL'],
    growth: ['Python', 'Project Management', 'Communication'],
    interviewBankId: 'bank-software',
  },
  {
    id: 'path-ai',
    title: 'AI Engineering',
    districtId: 'technology-hub',
    tagline: 'Build with models, retrieval and automation.',
    summary:
      'The newest ladder in the city. Turns models into products: automation pipelines, assistants, evaluations. Strong demand, thin supply, and employers pay for evidence over claims.',
    core: ['Python', 'AI Automation', 'Data Analysis'],
    growth: ['SQL', 'Node.js', 'Stakeholder Management'],
    interviewBankId: 'bank-ai',
  },
  {
    id: 'path-social-media',
    title: 'Social Media Management',
    districtId: 'creative-district',
    tagline: 'Own the voice, the calendar and the community.',
    summary:
      'Plan, publish and grow. Community management meets analytics: the best social managers can defend every post with a number.',
    core: ['Copywriting', 'Social Media', 'Communication'],
    growth: ['Data Analysis', 'Figma', 'SEO'],
    interviewBankId: 'bank-social',
  },
  {
    id: 'path-digital-marketing',
    title: 'Digital Marketing',
    districtId: 'creative-district',
    tagline: 'Paid, owned and earned - measured to the last click.',
    summary:
      'Campaigns across search, social and email, judged on cost per outcome. A path where the feedback loop is fast and the good ones are obsessively measurable.',
    core: ['SEO', 'Copywriting', 'Data Analysis'],
    growth: ['SQL', 'Figma', 'Stakeholder Management'],
    interviewBankId: 'bank-marketing',
  },
  {
    id: 'path-product-design',
    title: 'Product Design',
    districtId: 'creative-district',
    tagline: 'Research, flows and interfaces people can actually use.',
    summary:
      'From problem to prototype to shipped interface. Portfolio-weighted: a case study of a decision beats a gallery of pixels every time.',
    core: ['Figma', 'User Research', 'Communication'],
    growth: ['Motion Design', 'Data Analysis', 'Project Management'],
    interviewBankId: 'bank-design',
  },
  {
    id: 'path-motion-design',
    title: 'Motion Design',
    districtId: 'creative-district',
    tagline: 'Make brands move - product, brand and social motion.',
    summary:
      'After Effects and timing sense, working from design systems to deadline. Reels are the CV; delivery discipline is the career.',
    core: ['Motion Design', 'After Effects', 'Figma'],
    growth: ['Video Editing', 'Copywriting', 'Project Management'],
    interviewBankId: 'bank-motion',
  },
  {
    id: 'path-video-editing',
    title: 'Video Editing',
    districtId: 'creative-district',
    tagline: 'Cut for retention - long form, short form and everything between.',
    summary:
      'Story sense plus tool fluency, on a publishing clock. The short-form economy made this one of the fastest-hiring creative roles in the city.',
    core: ['Video Editing', 'After Effects', 'Storytelling'],
    growth: ['Motion Design', 'Social Media', 'Copywriting'],
    interviewBankId: 'bank-video',
  },
  {
    id: 'path-customer-support',
    title: 'Customer Support',
    districtId: 'hospitality-district',
    tagline: 'The voice of the company on its worst days.',
    summary:
      'Tickets, calls and escalations handled with patience and precision. The fastest entry route into tech companies, and the best listening post for how a product actually fails.',
    core: ['Customer Success', 'Communication', 'Empathy'],
    growth: ['Product Knowledge', 'Data Analysis', 'Sales'],
    interviewBankId: 'bank-support',
  },
  {
    id: 'path-virtual-assistant',
    title: 'Virtual Assistance',
    districtId: 'corporate-district',
    tagline: 'Run someone else\'s week from anywhere.',
    summary:
      'Scheduling, inbox, travel and research for founders and managers. The discipline is reliability: what was promised, delivered, before it was chased.',
    core: ['Excel', 'Scheduling', 'Communication'],
    growth: ['Project Management', 'AI Automation', 'Bookkeeping'],
    interviewBankId: 'bank-va',
  },
];

/** Just the titles - onboarding interest chips draw from here. */
export const CAREER_PATH_TITLES = CAREER_PATHS.map((path) => path.title);

const byId = Object.fromEntries(CAREER_PATHS.map((path) => [path.id, path]));

/** @returns {CareerPath | null} */
export function getCareerPath(pathId) {
  return byId[pathId] ?? null;
}

/**
 * The career path an interest title belongs to, or null when the title is not
 * in the catalog. Onboarding pins the first interest to this as the home path.
 */
export function pathIdForInterest(title) {
  return CAREER_PATHS.find((path) => path.title === title)?.id ?? null;
}

/**
 * The path a profile is closest to: the explicit home path when there is one,
 * then career interest, then held skills. Profiles saved before the explicit
 * field existed fall through to inference, so old accounts keep resolving.
 */
export function resolvePathForProfile(profile) {
  if (!profile) return CAREER_PATHS[0];

  const explicit = getCareerPath(profile.careerPathId);
  if (explicit) return explicit;

  const interest = (profile.careerInterests ?? [])[0];
  const byInterest = CAREER_PATHS.find((path) => path.title === interest);
  if (byInterest) return byInterest;

  const held = new Set((profile.skills ?? []).map((s) => s.name.toLowerCase()));
  let best = CAREER_PATHS[0];
  let bestHits = 0;
  CAREER_PATHS.forEach((path) => {
    const hits = path.core.filter((skill) => held.has(skill.toLowerCase())).length;
    if (hits > bestHits) {
      best = path;
      bestHits = hits;
    }
  });
  return best;
}