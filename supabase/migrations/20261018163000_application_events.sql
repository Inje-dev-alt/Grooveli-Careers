-- Application stage machine support (handoff §4.4): the fields the pipeline
-- carries beyond the row itself, plus the append-only stage history.
--
-- Reversal:
--   drop table if exists public.application_events;
--   alter table public.applications
--     drop column if exists stage_entered_at,
--     drop column if exists feedback,
--     drop column if exists rejection_acknowledged;

alter table public.applications
  add column if not exists stage_entered_at timestamptz not null default now(),
  add column if not exists feedback text,
  add column if not exists rejection_acknowledged boolean not null default false;

-- One row per stage move: who moved it, from where, to where and why. This
-- history is what the candidate sees as a timeline, and what rejection
-- feedback hangs off (§4.4).
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null check (actor in ('candidate', 'system', 'employer')),
  note text,
  at timestamptz not null default now()
);

create index if not exists application_events_app_idx
  on public.application_events (application_id, at);

alter table public.application_events enable row level security;
