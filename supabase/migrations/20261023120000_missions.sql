-- Batch 3.2 — server-owned missions (handoff §4.5).
--
-- Missions are the career-activity layer behind the HUD, the city panels and
-- the profile. Until now the whole catalog lived in `src/mock/missions.js`, so
-- the mission list, its objectives and — most importantly — its `xpReward`
-- were all client-side data. `missionStore.advanceByEvent` read that reward and
-- handed it straight to `careerStore.awardMissionXp`, which means a console
-- could mint arbitrary XP by editing a mission before completing it. Batch 3.1
-- closed that hole for career events; this closes it for missions.
--
-- Three tables, and a deliberate split of authority between them:
--
--   missions             the catalog. Owns `xp_reward`, so the reward is a fact
--                        about the mission rather than a number the browser
--                        passes up.
--   mission_objectives   one row per objective. Each names the career event
--                        that advances it and how many times it must fire, so
--                        adding a mission stays a data change, not a code
--                        change (the property `missionStore` is built around).
--   mission_progress     per-account progress. Advisory only — see the note on
--                        the table itself. Completion is *re-derived* from
--                        `career_events` by `POST /missions/:id/complete`.
--
-- Objectives are a table rather than a client-side constant plus an
-- `objective_count` column, which was the first design here. The frontend's
-- `Mission` typedef declares `objectives` required and `missionStore`
-- dereferences `mission.objectives` in three places, so a catalog served
-- without them breaks the browser; and a count column that has to be kept in
-- step with a hand-maintained client array is a drift bug waiting to happen.
--
-- Mirrors 20261022120000_career_progression.sql throughout: flat catalog,
-- RLS enabled with no policies, reached only by the router's service-role
-- client. The seed is a verbatim port of `src/mock/missions.js` (20 missions,
-- 38 objectives), checked by `node scripts/verify-missions-seed.mjs`, and is
-- idempotent, so re-applying is safe.
--
-- Reversal:
--   drop table if exists public.mission_progress;
--   drop table if exists public.mission_objectives;
--   drop table if exists public.missions;

-- ---------------------------------------------------------------- catalog ---

create table if not exists public.missions (
  id            text primary key,
  title         text not null,
  description   text not null,
  type          text not null check (type in ('career', 'skill', 'discovery')),
  category      text not null,
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  -- The reward, owned here. `POST /missions/:id/complete` reads it from this
  -- column and never from the request body.
  xp_reward     integer not null default 0 check (xp_reward >= 0),
  location_id   text,
  -- When set, this mission belongs to that career path's chain and is only
  -- served to accounts resolved to it (§4.6). FK so a typo'd path is a
  -- migration error rather than a mission nobody can ever see.
  path_id       text references public.career_paths (id),
  -- Nullable: `msn-city-tour` genuinely has no reward line in the mock, and
  -- inventing one would be putting words in the product's mouth.
  reward        text,
  unlocks_level text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists missions_type_idx on public.missions (type);
create index if not exists missions_path_idx on public.missions (path_id);
create index if not exists missions_location_idx on public.missions (location_id);

-- One row per objective. `event` is a career-event name from
-- `_shared/progression.ts`; left unconstrained for the same reason
-- `achievements.event` is — the vocabulary lives in one place in TypeScript,
-- and a check constraint here would be a second copy to keep in step.
create table if not exists public.mission_objectives (
  id           text primary key,
  mission_id   text not null references public.missions (id) on delete cascade,
  label        text not null,
  hint         text,
  event        text not null,
  target       integer not null default 1 check (target > 0),
  action_label text,
  action_route text,
  sort_order   integer not null default 0
);

create index if not exists mission_objectives_mission_idx
  on public.mission_objectives (mission_id, sort_order);
create index if not exists mission_objectives_event_idx
  on public.mission_objectives (event);

-- --------------------------------------------------------------- progress ---

-- Per-account mission progress.
--
-- Advisory, and deliberately so. `objective_counts` is written by
-- `PUT /missions/progress` straight from the browser, so nothing that matters
-- may be decided from it: it exists so the mission list can render part-done
-- objectives immediately and survive a reload. The one thing that *does*
-- matter — whether a mission may be completed, and therefore whether its XP is
-- paid — is re-derived from `career_events` on the server by
-- `POST /missions/:id/complete`, which is the only writer of `status =
-- 'completed'` that anything downstream trusts.
create table if not exists public.mission_progress (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  mission_id       text not null references public.missions (id) on delete cascade,
  status           text not null default 'available'
                     check (status in ('locked', 'available', 'active', 'completed')),
  objective_counts jsonb not null default '{}'::jsonb,
  completed_at     timestamptz,
  -- Last mission-reminder notice, for the 24h rule in `dueMissionReminders`.
  last_reminded_at timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, mission_id)
);

create index if not exists mission_progress_user_idx
  on public.mission_progress (user_id);

-- RLS on everywhere. `missions` and `mission_objectives` are public catalogs
-- but stay deny-all so reads go through the router's shaping and its path
-- filtering, exactly as `achievements` does.
alter table public.missions enable row level security;
alter table public.mission_objectives enable row level security;
alter table public.mission_progress enable row level security;

-- ------------------------------------------------------------------- seed ---

-- Verbatim port of `src/mock/missions.js`. Ten core missions that serve every
-- account, then the ten path chains (§4.6) — one per career path, each served
-- only to accounts resolved to that path.
insert into public.missions (
  id, title, description, type, category, difficulty,
  xp_reward, location_id, path_id, reward, unlocks_level, sort_order
) values
  ('msn-first-job',
   'Get Your First Job',
   'The core career loop, start to finish: make yourself legible to employers, find out where you actually stand, then put that in front of three roles that suit you.',
   'career', 'onboarding', 'medium',
   250, 'recruitment-agency', null, 'Unlocks verified candidate status', 'Level 2', 1),

  ('msn-city-tour',
   'Know the City',
   'Every district in Grooveli City maps to a part of the employment market. Walk them once and you will know where to go when you need something.',
   'discovery', 'exploration', 'easy',
   75, 'spawn-plaza', null, null, null, 2),

  ('msn-excel',
   'Excel Mission',
   'Prove you can model, not just format. Pivot a messy export, build the lookup, and explain what the numbers say.',
   'skill', 'excel', 'medium',
   100, 'university-campus', null, 'Verifies Excel on your profile', null, 3),

  ('msn-communication',
   'Communication Mission',
   'Write the difficult message: a delay, a decline, a correction. The AI scores clarity, tone and whether the reader knows what happens next.',
   'skill', 'communication', 'easy',
   100, 'university-campus', null, 'Verifies Communication on your profile', null, 4),

  ('msn-interview',
   'Interview Mission',
   'A full simulated interview for a role in your match range, with structured feedback on each answer afterwards.',
   'skill', 'interview', 'hard',
   100, 'ai-career-center', null, 'Interview readiness score on your profile', null, 5),

  ('msn-recruitment',
   'Recruitment Mission',
   'Four hypothetical candidates, one brief. Shortlist two and justify the cut — the AI checks your reasoning against the brief, not against its own taste.',
   'skill', 'recruitment', 'medium',
   100, 'recruitment-agency', null, 'Verifies Recruitment on your profile', null, 6),

  ('msn-sales',
   'Sales Mission',
   'Handle a simulated customer conversation from first objection to agreed next step. Scored on discovery, not on charm.',
   'skill', 'sales', 'medium',
   100, 'corporate-district', null, 'Verifies Sales on your profile', null, 7),

  ('msn-certification',
   'Earn a Certification',
   'Finish an accredited short course at the Training Center. Certifications are the part of your profile employers trust most.',
   'career', 'learning', 'hard',
   200, 'university-campus', null, 'Adds a verified certification to your profile', null, 8),

  ('msn-bounce-back',
   'Bounce Back',
   'Every career has a no in it. Read the feedback, take it seriously, sharpen the gap it named, and put yourself back in front of employers who are still hiring.',
   'career', 'resilience', 'medium',
   150, 'recruitment-agency', null, 'Proves you can take a no and keep moving', null, 9),

  ('msn-network',
   'Network Mission',
   'Careers move through people. Make one real connection, then use it the honest way - ask someone who could know your work to say so to an employer.',
   'career', 'networking', 'easy',
   60, 'spawn-plaza', null, 'Referrals unlocked on your active applications', null, 10),

  ('msn-path-hr',
   'First Roles in Human Resources',
   'The Recruitment Agency is your home ground. Sit the Human Resources interview simulation, then put three suitable roles in front of employers who can check your claims.',
   'career', 'path', 'medium',
   150, 'recruitment-agency', 'path-hr', 'Proves you can run your own path end to end', null, 11),

  ('msn-path-software',
   'First Roles in Software Development',
   'Home district is the Technology Hub. Pass a Software Development interview simulation, then apply to three suitable engineering roles - shipped code is the only reference that matters.',
   'career', 'path', 'medium',
   150, 'technology-hub', 'path-software', 'Proves you can run your own path end to end', null, 12),

  ('msn-path-ai',
   'First Roles in AI Engineering',
   'The Technology Hub runs on people who can explain a model to a non-engineer. Sit the AI Engineering interview simulation, then apply to three suitable roles.',
   'career', 'path', 'medium',
   150, 'technology-hub', 'path-ai', 'Proves you can run your own path end to end', null, 13),

  ('msn-path-social-media',
   'First Roles in Social Media Management',
   'Own the voice before you ask an employer to. Complete the Social Media Management interview simulation, then apply to three suitable roles in the Creative District.',
   'career', 'path', 'medium',
   150, 'creative-district', 'path-social-media', 'Proves you can run your own path end to end', null, 14),

  ('msn-path-digital-marketing',
   'First Roles in Digital Marketing',
   'Campaigns are judged on cost per outcome, and so are candidates. Sit the Digital Marketing interview simulation, then apply to three suitable roles.',
   'career', 'path', 'medium',
   150, 'creative-district', 'path-digital-marketing', 'Proves you can run your own path end to end', null, 15),

  ('msn-path-product-design',
   'First Roles in Product Design',
   'A case study of a decision beats a gallery of pixels. Sit the Product Design interview simulation, then apply to three roles that will actually read your portfolio.',
   'career', 'path', 'medium',
   150, 'creative-district', 'path-product-design', 'Proves you can run your own path end to end', null, 16),

  ('msn-path-motion-design',
   'First Roles in Motion Design',
   'The reel is the CV, but delivery discipline is the career. Sit the Motion Design interview simulation, then apply to three suitable roles on the clock.',
   'career', 'path', 'medium',
   150, 'creative-district', 'path-motion-design', 'Proves you can run your own path end to end', null, 17),

  ('msn-path-video-editing',
   'First Roles in Video Editing',
   'The short-form economy hired this path into the city. Sit the Video Editing interview simulation, then apply to three suitable roles that live and die on retention.',
   'career', 'path', 'medium',
   150, 'creative-district', 'path-video-editing', 'Proves you can run your own path end to end', null, 18),

  ('msn-path-customer-support',
   'First Roles in Customer Support',
   'The fastest entry route into tech companies, and the best listening post in the city. Sit the Customer Support interview simulation, then apply to three suitable roles.',
   'career', 'path', 'medium',
   150, 'hospitality-district', 'path-customer-support', 'Proves you can run your own path end to end', null, 19),

  ('msn-path-virtual-assistant',
   'First Roles in Virtual Assistance',
   'Reliability is the whole pitch: what was promised, delivered, before it was chased. Sit the Virtual Assistance interview simulation, then apply to three suitable roles.',
   'career', 'path', 'medium',
   150, 'corporate-district', 'path-virtual-assistant', 'Proves you can run your own path end to end', null, 20)
on conflict (id) do update set
  title         = excluded.title,
  description   = excluded.description,
  type          = excluded.type,
  category      = excluded.category,
  difficulty    = excluded.difficulty,
  xp_reward     = excluded.xp_reward,
  location_id   = excluded.location_id,
  path_id       = excluded.path_id,
  reward        = excluded.reward,
  unlocks_level = excluded.unlocks_level,
  sort_order    = excluded.sort_order;

-- The objectives, in the order the mission detail panel renders them. Every
-- `event` here is a career-event name, which is what lets a single action
-- advance progression, a mission and an achievement without any of the three
-- knowing about the others.
insert into public.mission_objectives (
  id, mission_id, label, hint, event, target, action_label, action_route, sort_order
) values
  -- msn-first-job
  ('obj-profile', 'msn-first-job',
   'Complete your career profile',
   'Headline, summary, skills and salary expectation.',
   'profile.completed', 1, 'Open profile', '/profile', 1),
  ('obj-cv', 'msn-first-job',
   'Upload your CV',
   'Employers still ask for it, and the AI reads it to find skill gaps.',
   'cv.uploaded', 1, 'Upload CV', '/profile', 2),
  ('obj-assessment', 'msn-first-job',
   'Complete the AI career assessment',
   'Twelve questions. It calibrates your match scores.',
   'assessment.completed', 1, 'Start assessment', '/ai', 3),
  ('obj-apply', 'msn-first-job',
   'Apply to three suitable jobs',
   'Only roles matching 60% or better count — volume is not progress.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 4),
  ('obj-interview', 'msn-first-job',
   'Complete an interview simulation',
   'Practise with the AI before the real thing.',
   'interview.simulated', 1, 'Practise interview', '/ai', 5),

  -- msn-city-tour
  ('obj-visit', 'msn-city-tour',
   'Visit five districts',
   'Walk up to a building and press E.',
   'location.visited', 5, 'Enter the city', '/city', 1),
  ('obj-ai-intro', 'msn-city-tour',
   'Introduce yourself to Grooveli AI',
   null,
   'ai.consulted', 1, 'Open AI Career Center', '/ai', 2),

  -- msn-excel
  ('obj-excel-challenge', 'msn-excel',
   'Complete the Excel challenge',
   'Three tasks, roughly fifteen minutes.',
   'skill.challenge', 1, 'Start challenge', null, 1),

  -- msn-communication
  ('obj-comms-exercise', 'msn-communication',
   'Complete the AI communication exercise',
   null,
   'skill.challenge', 1, 'Start exercise', null, 1),

  -- msn-interview
  ('obj-interview-sim', 'msn-interview',
   'Complete an AI interview',
   'Six questions, no retries mid-run.',
   'interview.simulated', 1, 'Start interview', '/ai', 1),

  -- msn-recruitment
  ('obj-recruitment-eval', 'msn-recruitment',
   'Evaluate the candidate shortlist',
   null,
   'skill.challenge', 1, 'Start evaluation', null, 1),

  -- msn-sales
  ('obj-sales-sim', 'msn-sales',
   'Handle the simulated customer conversation',
   null,
   'skill.challenge', 1, 'Start simulation', null, 1),

  -- msn-certification
  ('obj-course', 'msn-certification',
   'Complete a course',
   'Data Essentials and People Analytics are both open.',
   'course.completed', 1, 'Browse courses', null, 1),

  -- msn-bounce-back
  ('obj-rejection', 'msn-bounce-back',
   'Read the feedback on a rejection',
   'Open your applications. The note is there for a reason.',
   'application.rejected', 1, 'Open applications', '/profile', 1),
  ('obj-sharpen', 'msn-bounce-back',
   'Pass a skill mission',
   'Close the gap the feedback named.',
   'skill.challenge', 1, 'Find a skill mission', '/missions', 2),
  ('obj-retry', 'msn-bounce-back',
   'Apply to two suitable roles',
   'Match 60% or better still counts, rejection or not.',
   'application.suitable', 2, 'Browse jobs', '/jobs', 3),

  -- msn-network
  ('obj-connect', 'msn-network',
   'Connect with one professional',
   'The Network shows people working in your part of the market.',
   'social.connected', 1, 'Open the Network', '/network', 1),
  ('obj-referral', 'msn-network',
   'Ask a connection for a referral',
   'Open an active application and use "Ask for a referral".',
   'referral.requested', 1, 'Open applications', '/profile', 2),

  -- the ten path chains: an interview simulation on the path, then three
  -- suitable applications. Same shape throughout, different question bank.
  ('obj-path-hr-interview', 'msn-path-hr',
   'Complete a Human Resources interview simulation',
   'Your question bank is drawn from the HR path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-hr-apply', 'msn-path-hr',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-software-interview', 'msn-path-software',
   'Complete a Software Development interview simulation',
   'Your question bank is drawn from the engineering path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-software-apply', 'msn-path-software',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-ai-interview', 'msn-path-ai',
   'Complete an AI Engineering interview simulation',
   'Your question bank is drawn from the AI path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-ai-apply', 'msn-path-ai',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-social-media-interview', 'msn-path-social-media',
   'Complete a Social Media Management interview simulation',
   'Your question bank is drawn from the social path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-social-media-apply', 'msn-path-social-media',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-digital-marketing-interview', 'msn-path-digital-marketing',
   'Complete a Digital Marketing interview simulation',
   'Your question bank is drawn from the marketing path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-digital-marketing-apply', 'msn-path-digital-marketing',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-product-design-interview', 'msn-path-product-design',
   'Complete a Product Design interview simulation',
   'Your question bank is drawn from the design path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-product-design-apply', 'msn-path-product-design',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-motion-design-interview', 'msn-path-motion-design',
   'Complete a Motion Design interview simulation',
   'Your question bank is drawn from the motion path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-motion-design-apply', 'msn-path-motion-design',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-video-editing-interview', 'msn-path-video-editing',
   'Complete a Video Editing interview simulation',
   'Your question bank is drawn from the video path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-video-editing-apply', 'msn-path-video-editing',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-customer-support-interview', 'msn-path-customer-support',
   'Complete a Customer Support interview simulation',
   'Your question bank is drawn from the support path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-customer-support-apply', 'msn-path-customer-support',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2),

  ('obj-path-virtual-assistant-interview', 'msn-path-virtual-assistant',
   'Complete a Virtual Assistance interview simulation',
   'Your question bank is drawn from the VA path.',
   'interview.simulated', 1, 'Practise interview', '/ai', 1),
  ('obj-path-virtual-assistant-apply', 'msn-path-virtual-assistant',
   'Apply to three suitable roles',
   'Match 60% or better, same as everywhere else.',
   'application.suitable', 3, 'Browse jobs', '/jobs', 2)
on conflict (id) do update set
  mission_id   = excluded.mission_id,
  label        = excluded.label,
  hint         = excluded.hint,
  event        = excluded.event,
  target       = excluded.target,
  action_label = excluded.action_label,
  action_route = excluded.action_route,
  sort_order   = excluded.sort_order;
