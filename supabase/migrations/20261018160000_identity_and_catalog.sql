-- Identity and the career-path catalog (handoff §2, §4.1, §4.2, §4.6).
--
-- Reversal: drop tables in reverse dependency order -
--   drop table if exists public.organization_memberships;
--   drop table if exists public.organizations;
--   drop table if exists public.candidate_profiles;
--   drop table if exists public.profiles;
--   drop table if exists public.career_paths;
-- (the career_paths seed below is removed by the same drop).

-- The canonical ten-path catalog (§4.6). Ids are semantic ('path-hr') and are
-- referenced by candidate_profiles.career_path_id and, later, mission pathId.
create table if not exists public.career_paths (
  id text primary key,
  title text not null unique,
  district_id text not null,
  tagline text not null,
  summary text not null,
  core text[] not null default '{}',
  growth text[] not null default '{}',
  interview_bank_id text not null
);

-- One row per auth user. `roles` is an array and `active_role` selects the
-- current experience: a recruiter who is also job-hunting is ONE account, not
-- two (§2 - the hardest structural decision to undo later).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  roles text[] not null default '{}',
  active_role text not null default 'candidate'
    check (active_role in ('candidate', 'employer')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- The candidate profile (§4.1). Text-shaped fields default to empty rather
-- than null so the API never has to distinguish '' from missing.
-- skills / experience / education / cv travel as whole jsonb values: PATCH
-- replaces the array, which is exactly how the profile form edits them.
create table if not exists public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  -- Explicit home path (§4.1). Nullable on purpose: accounts that predate the
  -- field resolve by inference (interest, then held skills) - see
  -- resolvePathForProfile in src/data/careerPaths.js; the backend mirrors it.
  career_path_id text references public.career_paths (id),
  gender text
    check (gender is null or gender in ('female', 'male', 'non-binary', 'prefer-not-to-say')),
  headline text not null default '',
  summary text not null default '',
  location text not null default '',
  years_experience integer not null default 0,
  career_goal text not null default '',
  career_interests text[] not null default '{}',
  work_types text[] not null default '{}',
  open_to text[] not null default '{}',
  salary_min integer not null default 0,
  salary_max integer not null default 0,
  currency text not null default 'NGN',
  industries text[] not null default '{}',
  skills jsonb not null default '[]',
  experience jsonb not null default '[]',
  education jsonb not null default '[]',
  cv jsonb not null default '{"hasCv": false}'::jsonb,
  -- Computed by the API with the same weighting as
  -- candidateService.calculateCompleteness - the two must agree (§4.1).
  completeness integer not null default 0
    check (completeness between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  -- Text PK: ids are opaque to the frontend (§1) and the seeded demo
  -- organisations carry readable ids like 'org-northwind' (§4.2).
  id text primary key,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  industry text not null default '',
  size_band text not null default '',
  location text not null default '',
  website text not null default '',
  district_id text not null default 'corporate-district',
  logo_color text not null default '#6c8cff',
  follower_count integer not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Membership roles (§4.2): owner, admin, recruiter, hiring-manager.
create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'recruiter', 'hiring-manager')),
  title text not null default '',
  joined_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- RLS: enabled, deny-by-default. All access goes through the `api` Edge
-- Function, which uses the service role (bypasses RLS) and authorizes per
-- request. No client reaches PostgREST directly, so no policies yet - these
-- tables exist but are invisible to anon/authenticated roles.
alter table public.career_paths enable row level security;
alter table public.profiles enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;


-- Seed the catalog. Values mirror src/data/careerPaths.js exactly; idempotent
-- so re-applying the migration against an existing database is safe.
insert into public.career_paths (id, title, district_id, tagline, summary, core, growth, interview_bank_id) values
  ('path-hr', 'Human Resources', 'recruitment-agency', 'Hiring, people operations and the systems behind them.', 'Run recruitment, own people operations, and build the processes that keep an organisation running. The most automatable people-function there is - which is exactly where the premium sits.', '{Recruitment,HR Operations,Communication}', '{Excel,Data Analysis,AI Automation}', 'bank-hr'),
  ('path-software', 'Software Development', 'technology-hub', 'Build the services and products everything else runs on.', 'Backend, frontend or full-stack: correctness-critical code with real users. The fastest-moving salary band in the city and the clearest evidence trail - what you shipped speaks for you.', '{React,Node.js,SQL}', '{Python,Project Management,Communication}', 'bank-software'),
  ('path-ai', 'AI Engineering', 'technology-hub', 'Build with models, retrieval and automation.', 'The newest ladder in the city. Turns models into products: automation pipelines, assistants, evaluations. Strong demand, thin supply, and employers pay for evidence over claims.', '{Python,AI Automation,Data Analysis}', '{SQL,Node.js,Stakeholder Management}', 'bank-ai'),
  ('path-social-media', 'Social Media Management', 'creative-district', 'Own the voice, the calendar and the community.', 'Plan, publish and grow. Community management meets analytics: the best social managers can defend every post with a number.', '{Copywriting,Social Media,Communication}', '{Data Analysis,Figma,SEO}', 'bank-social'),
  ('path-digital-marketing', 'Digital Marketing', 'creative-district', 'Paid, owned and earned - measured to the last click.', 'Campaigns across search, social and email, judged on cost per outcome. A path where the feedback loop is fast and the good ones are obsessively measurable.', '{SEO,Copywriting,Data Analysis}', '{SQL,Figma,Stakeholder Management}', 'bank-marketing'),
  ('path-product-design', 'Product Design', 'creative-district', 'Research, flows and interfaces people can actually use.', 'From problem to prototype to shipped interface. Portfolio-weighted: a case study of a decision beats a gallery of pixels every time.', '{Figma,User Research,Communication}', '{Motion Design,Data Analysis,Project Management}', 'bank-design'),
  ('path-motion-design', 'Motion Design', 'creative-district', 'Make brands move - product, brand and social motion.', 'After Effects and timing sense, working from design systems to deadline. Reels are the CV; delivery discipline is the career.', '{Motion Design,After Effects,Figma}', '{Video Editing,Copywriting,Project Management}', 'bank-motion'),
  ('path-video-editing', 'Video Editing', 'creative-district', 'Cut for retention - long form, short form and everything between.', 'Story sense plus tool fluency, on a publishing clock. The short-form economy made this one of the fastest-hiring creative roles in the city.', '{Video Editing,After Effects,Storytelling}', '{Motion Design,Social Media,Copywriting}', 'bank-video'),
  ('path-customer-support', 'Customer Support', 'hospitality-district', 'The voice of the company on its worst days.', 'Tickets, calls and escalations handled with patience and precision. The fastest entry route into tech companies, and the best listening post for how a product actually fails.', '{Customer Success,Communication,Empathy}', '{Product Knowledge,Data Analysis,Sales}', 'bank-support'),
  ('path-virtual-assistant', 'Virtual Assistance', 'corporate-district', 'Run someone else''s week from anywhere.', 'Scheduling, inbox, travel and research for founders and managers. The discipline is reliability: what was promised, delivered, before it was chased.', '{Excel,Scheduling,Communication}', '{Project Management,AI Automation,Bookkeeping}', 'bank-va')
on conflict (id) do nothing;
