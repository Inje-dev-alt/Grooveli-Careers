-- Jobs and applications (handoff §4.3, §4.4).
--
-- Reversal:
--   drop table if exists public.applications;
--   drop table if exists public.jobs;

create table if not exists public.jobs (
  -- Text PK: ids stay opaque to the frontend (§1); seeded demo jobs carry
  -- ids like 'job-001' so the seed is deterministic and re-runnable.
  id text primary key,
  organization_id text not null references public.organizations (id) on delete cascade,
  -- company_name is denormalised on purpose: job lists render many rows and
  -- must not need a second request (§4.3).
  company_name text not null,
  title text not null,
  description text not null default '',
  salary_min integer not null default 0,
  salary_max integer not null default 0,
  currency text not null default 'NGN',
  salary_period text not null default 'month'
    check (salary_period in ('month', 'year')),
  location text not null default '',
  work_type text not null default 'onsite'
    check (work_type in ('onsite', 'hybrid', 'remote')),
  employment_type text not null default 'full-time'
    check (employment_type in ('full-time', 'part-time', 'contract', 'internship', 'freelance')),
  experience_level text not null default 'mid'
    check (experience_level in ('entry', 'junior', 'mid', 'senior', 'lead')),
  required_skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  industry text not null default '',
  district_id text not null default 'corporate-district',
  deadline timestamptz,
  -- Only 'published' roles are discoverable; the rest belong to the owner (§4.3).
  status text not null default 'draft'
    check (status in ('draft', 'published', 'paused', 'closed')),
  -- Exists so employer roles and partner feeds share every screen; the UI
  -- never branches on it (§4.3).
  source text not null default 'grooveli_employer'
    check (source in ('grooveli_employer', 'workpedia', 'partner', 'mock')),
  responsibilities text[] not null default '{}',
  requirements text[] not null default '{}',
  featured boolean not null default false,
  -- matchScore / matchReasons / skillGaps are deliberately NOT columns: they
  -- are per-requesting-candidate output of the matching service (§4.3), and a
  -- stored score would show one person's match to another.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_organization_idx on public.jobs (organization_id);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  -- References the account (profiles.id), not the candidate profile row: the
  -- frontend keys everything (progress, events, application lists) by account.
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  -- §4.4 lists every state so no screen has to invent one; the MVP only
  -- moves as far as 'shortlisted'.
  status text not null default 'applied'
    check (status in ('applied', 'under-review', 'shortlisted', 'interview',
                      'assessment', 'offer', 'rejected', 'withdrawn',
                      'declined', 'hired')),
  note text not null default '',
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One application per candidate per job: re-applying is a 409 that the API
  -- reports as already-done (§3), never a duplicate row.
  unique (job_id, candidate_id)
);

create index if not exists applications_candidate_idx on public.applications (candidate_id);
create index if not exists applications_job_idx on public.applications (job_id);

-- RLS: deny-by-default, same rationale as the identity migration - the Edge
-- Function is the only client, using the service role and authorizing itself.
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
