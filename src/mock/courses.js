/**
 * Short courses offered at the University & Training Center.
 * Replaced by `GET /learning/courses` and `POST /learning/courses/:id/complete`.
 */
export const courses = [
  {
    id: 'crs-data-essentials',
    title: 'Data Essentials',
    provider: 'Brightpath Learning',
    description: 'Spreadsheets, SQL and reporting fundamentals for people who already own a process.',
    skill: 'Data Analysis',
    weeks: 4,
    level: 'Beginner',
    certification: true,
    xpReward: 200,
  },
  {
    id: 'crs-people-analytics',
    title: 'People Analytics',
    provider: 'Brightpath Learning',
    description: 'Turn HR data into decisions: retention, funnel health and the questions worth asking of it.',
    skill: 'Data Analysis',
    weeks: 6,
    level: 'Intermediate',
    certification: true,
    xpReward: 200,
  },
  {
    id: 'crs-automation',
    title: 'Workflow Automation with AI',
    provider: 'Grooveli Academy',
    description: 'Map a manual process, automate the repetitive half, and keep the judgement where it belongs.',
    skill: 'AI Automation',
    weeks: 3,
    level: 'Intermediate',
    certification: true,
    xpReward: 200,
  },
  {
    id: 'crs-project-foundations',
    title: 'Project Management Foundations',
    provider: 'Grooveli Academy',
    description: 'Scope, sequence and status — the parts of project management that survive contact with reality.',
    skill: 'Project Management',
    weeks: 5,
    level: 'Beginner',
    certification: true,
    xpReward: 200,
  },
];
