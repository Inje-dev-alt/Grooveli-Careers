-- Batch 3.1 — server-owned career progression (handoff §4.5).
--
-- Until now XP, levels, achievements and the activity stream were written by
-- the browser: `PUT /career/progress`, `POST /career/ledger`,
-- `POST /career/stats/increment`, `POST /career/achievements/evaluate`,
-- `POST /career/one-time-events` and `POST /career/activity` all took numbers
-- straight from the client, so any of them could be forged from a console.
-- These tables move the XP table, the one-off rule and the anti-spam rule
-- behind `POST /career/events`, which becomes the single write.
--
-- Note on `level`: it is deliberately NOT stored. It is a pure function of
-- total XP (xpForLevel(n) = round(120 × 1.18^(n-1)), src/utils/progression.js)
-- and a stored copy is a second source of truth that can disagree with the
-- ledger. The router derives it on read.
--
-- Reversal:
--   drop table if exists public.career_activity;
--   drop table if exists public.achievement_progress;
--   drop table if exists public.xp_ledger;
--   drop table if exists public.career_events;
--   drop table if exists public.career_stats;
--   drop table if exists public.career_progress;
--   drop table if exists public.achievements;

-- ---------------------------------------------------------------- catalog ---

-- The achievement definitions, lifted from `achievementCatalog` in
-- src/mock/users.js. `required_count` and the context pair are what make
-- achievements *counted* rather than fired: Career Explorer needs five
-- distinct districts, and the Excel award needs context.skill = 'Excel'
-- specifically rather than whichever skill challenge happened to be first.
create table if not exists public.achievements (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  event text not null,
  required_count integer not null default 1 check (required_count > 0),
  context_key text,
  context_value text,
  sort_order integer not null default 0
);

insert into public.achievements
  (id, name, description, icon, event, required_count, context_key, context_value, sort_order)
values
  ('ach-first-mission', 'First Career Mission', 'Completed your first career mission.', 'trophy', 'mission.completed', 1, null, null, 1),
  ('ach-first-application', 'First Application', 'Submitted your first application through Grooveli.', 'rocket', 'application.suitable', 1, null, null, 2),
  ('ach-interview-ready', 'Interview Ready', 'Completed an interview simulation.', 'target', 'interview.simulated', 1, null, null, 3),
  ('ach-excel-foundations', 'Excel Foundations', 'Passed the Excel skill challenge.', 'chart', 'skill.challenge', 1, 'skill', 'Excel', 4),
  ('ach-comms-proven', 'Communication Proven', 'Passed the Communication skill challenge.', 'megaphone', 'skill.challenge', 1, 'skill', 'Communication', 5),
  ('ach-career-explorer', 'Career Explorer', 'Visited five districts in Grooveli City.', 'map', 'location.visited', 5, null, null, 6),
  ('ach-certified', 'Certified', 'Completed an accredited course.', 'award', 'course.completed', 1, null, null, 7),
  ('ach-profile-complete', 'Career Identity', 'Completed your career profile.', 'user', 'profile.completed', 1, null, null, 8),
  ('ach-first-post', 'Found Your Voice', 'Shared your first career post.', 'megaphone', 'social.posted', 1, null, null, 9),
  ('ach-bounce-back', 'Bounce Back', 'Kept going after a rejection.', 'rocket', 'application.rejected', 1, null, null, 10),
  ('ach-offer-accepted', 'Signed the Offer', 'Accepted a real offer and started a new role.', 'trophy', 'offer.accepted', 1, null, null, 11)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  event = excluded.event,
  required_count = excluded.required_count,
  context_key = excluded.context_key,
  context_value = excluded.context_value,
  sort_order = excluded.sort_order;

create index if not exists achievements_event_idx on public.achievements (event);

-- --------------------------------------------------------------- totals ---

-- One row per account. A new account starts at level 1 with 0 XP: progression
-- that was handed out rather than earned makes every number downstream
-- meaningless (§4.5). Reputation is 0-100 and moves only on verifiable work.
create table if not exists public.career_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  reputation integer not null default 0 check (reputation between 0 and 100),
  updated_at timestamptz not null default now()
);

-- The seven counters the HUD and the profile render. Kept as columns rather
-- than a jsonb blob so a bad key is a database error, not a silent no-op the
-- way `POST /career/stats/increment` was.
create table if not exists public.career_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  completed_missions integer not null default 0 check (completed_missions >= 0),
  certifications integer not null default 0 check (certifications >= 0),
  applications integer not null default 0 check (applications >= 0),
  interviews integer not null default 0 check (interviews >= 0),
  offers integer not null default 0 check (offers >= 0),
  jobs_viewed integer not null default 0 check (jobs_viewed >= 0),
  locations_visited integer not null default 0 check (locations_visited >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- events ---

-- Append-only. The unique idempotency key per user is what makes the endpoint
-- safe to retry: every screen that can fire an event can double-fire it
-- (double-clicks, retries, two tabs), so the server treats a repeated key as
-- already-done and replays the original result rather than awarding twice.
--
-- This table also replaces the client's `one_time_events` array. The one-off
-- rule (profile, CV, assessment) becomes "one row per event name for this
-- user", enforced by `career_events_one_shot_idx` below.
create table if not exists public.career_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  idempotency_key text not null,
  xp_awarded integer not null default 0,
  reputation_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists career_events_user_idx
  on public.career_events (user_id, occurred_at desc);
create index if not exists career_events_user_event_idx
  on public.career_events (user_id, event);

-- The one-shot guard, in the database rather than in a client array that a
-- reload used to reset. A partial unique index means a second
-- `profile.completed` row cannot exist at all, whatever the idempotency key.
create unique index if not exists career_events_one_shot_idx
  on public.career_events (user_id, event)
  where event in ('profile.completed', 'cv.uploaded', 'assessment.completed');

-- Why the level went up. Totals without a ledger are numbers the player
-- cannot defend, so every non-zero award writes a row here.
create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  career_event_id uuid references public.career_events (id) on delete cascade,
  event text not null,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists xp_ledger_user_idx
  on public.xp_ledger (user_id, created_at desc);

-- Counted progress toward each award. `awarded_at` null means in progress.
create table if not exists public.achievement_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  count integer not null default 0 check (count >= 0),
  awarded_at timestamptz,
  primary key (user_id, achievement_id)
);

create index if not exists achievement_progress_user_idx
  on public.achievement_progress (user_id);

-- The activity stream behind social proof: a log of career work, not of
-- engagement. `shareable` is what the feed is allowed to surface.
create table if not exists public.career_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  career_event_id uuid references public.career_events (id) on delete cascade,
  type text not null,
  label text not null,
  xp integer not null default 0,
  shareable boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists career_activity_user_idx
  on public.career_activity (user_id, created_at desc);

-- RLS on everywhere; the router reaches these through the service-role client
-- only, exactly as the Phase 2 tables do. `achievements` is a public catalog
-- but stays deny-all so that reads go through the router's shaping.
alter table public.achievements enable row level security;
alter table public.career_progress enable row level security;
alter table public.career_stats enable row level security;
alter table public.career_events enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.achievement_progress enable row level security;
alter table public.career_activity enable row level security;
