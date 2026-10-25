-- Saved jobs (jobService.setJobSaved / listSavedJobIds).
--
-- Reversal: drop table if exists public.saved_jobs;

create table if not exists public.saved_jobs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id text not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists saved_jobs_user_idx on public.saved_jobs (user_id);

-- RLS: deny-by-default, same as the rest - the Edge Function is the only
-- client and authorizes per request with the service role.
alter table public.saved_jobs enable row level security;
