-- Batch 3.8 — learning and the leaderboard.
--
-- Three tables. Small surfaces, but each carries one rule that only works
-- server-side.
--
-- Reversal:
--   drop table if exists public.leaderboard_opt_out;
--   drop table if exists public.course_enrollments;
--   drop table if exists public.courses;

/* ----------------------------------------------------------- courses --- */

create table if not exists public.courses (
  id            text primary key,
  title         text not null,
  provider      text not null default '',
  description   text not null default '',
  skill         text not null default '',
  -- The paths this course is recommended for. The Training Centre sorts a
  -- candidate's own path to the top; everything else keeps catalogue order.
  path_ids      text[] not null default '{}',
  weeks         integer not null default 0,
  level         text not null default 'Beginner',
  certification boolean not null default true,
  -- Mirrors XP_REWARDS['course.completed']. Carried on the row because the UI
  -- shows what a course is worth before you start it; the award itself still
  -- comes from the career event, never from this column.
  xp_reward     integer not null default 200,
  sort_order    integer not null default 0
);

/**
 * One row per account per course.
 *
 * Enrolment lives here rather than in a click, because three things depend on
 * it being a fact: a course completes once, the certification count is a
 * property of the account, and the mission objective listening for
 * `course.completed` cannot be farmed by re-clicking a card.
 */
create table if not exists public.course_enrollments (
  id           text primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  course_id    text not null references public.courses (id) on delete cascade,
  status       text not null default 'enrolled'
    check (status in ('enrolled', 'completed')),
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, course_id)
);

create index if not exists course_enrollments_user_idx
  on public.course_enrollments (user_id);

/* ------------------------------------------------------- leaderboard --- */

/**
 * Presence means hidden.
 *
 * A row here is an account that has opted out; no row is the default, which is
 * to appear. That is the product rule — participation is opt-out, not opt-in,
 * so a candidate who earns a reputation is on the board until they say
 * otherwise — and storing it as presence rather than a boolean means the
 * default needs no row written for every account that never thinks about it.
 */
create table if not exists public.leaderboard_opt_out (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.leaderboard_opt_out enable row level security;

/* ------------------------------------------------------------- seed --- */

-- The four courses from src/mock/courses.js.
insert into public.courses
  (id, title, provider, description, skill, path_ids, weeks, level, certification, xp_reward, sort_order) values
  ('crs-data-essentials', 'Data Essentials', 'Brightpath Learning',
   'Spreadsheets, SQL and reporting fundamentals for people who already own a process.',
   'Data Analysis', '{path-ai,path-digital-marketing,path-hr}', 4, 'Beginner', true, 200, 0),
  ('crs-people-analytics', 'People Analytics', 'Brightpath Learning',
   'Turn HR data into decisions: retention, funnel health and the questions worth asking of it.',
   'Data Analysis', '{path-hr}', 6, 'Intermediate', true, 200, 1),
  ('crs-automation', 'Workflow Automation with AI', 'Grooveli Academy',
   'Map a manual process, automate the repetitive half, and keep the judgement where it belongs.',
   'AI Automation', '{path-ai,path-hr,path-virtual-assistant}', 3, 'Intermediate', true, 200, 2),
  ('crs-project-foundations', 'Project Management Foundations', 'Grooveli Academy',
   'Scope, sequence and status — the parts of project management that survive contact with reality.',
   'Project Management', '{path-software,path-product-design,path-virtual-assistant}', 5, 'Beginner', true, 200, 3)
on conflict (id) do update set
  title         = excluded.title,
  provider      = excluded.provider,
  description   = excluded.description,
  skill         = excluded.skill,
  path_ids      = excluded.path_ids,
  weeks         = excluded.weeks,
  level         = excluded.level,
  certification = excluded.certification,
  xp_reward     = excluded.xp_reward,
  sort_order    = excluded.sort_order;
