-- Item 6 — the employer half of the dual-sided leaderboard.
--
-- The candidate half already exists: `career_progress.reputation` ranked by
-- `/leaderboard`, with `leaderboard_opt_out` honouring who does not want to be
-- listed. This adds the employer side.
--
-- HRS = 40% response speed + 30% feedback rate + 30% candidate experience.
--
-- The first two components are computable from data already being written:
-- `application_events` records every stage move with an actor, so the earliest
-- row with `actor = 'employer'` is the moment a company first answered, and a
-- terminal move carrying a note is a company that explained itself. The third
-- had no source anywhere in the product, which is what `employer_ratings`
-- below is for.
--
-- Reversal:
--   drop view if exists public.employer_responsiveness;
--   drop table if exists public.employer_ratings;
--   drop table if exists public.organization_opt_out;

/**
 * What a candidate thought of being put through an employer's process.
 *
 * KEYED ON THE APPLICATION, NOT ON A CLICK. One application is one opinion, so
 * re-submitting corrects a rating rather than stuffing the ballot — the same
 * idempotency rule the XP awards use, keyed on the thing rather than on the
 * event that reported it.
 *
 * `organization_id` is denormalised from the job deliberately. The rating is
 * about the company as it behaved on that application, and a job being
 * deleted or moved later must not silently re-attribute or erase it.
 */
create table if not exists public.employer_ratings (
  application_id  uuid primary key references public.applications (id) on delete cascade,
  organization_id text not null references public.organizations (id) on delete cascade,
  candidate_id    uuid not null references public.profiles (id) on delete cascade,
  -- 1..5. Deliberately a bare number with no free text: a public score built
  -- out of prose would need moderation, and nothing here is shown per rating.
  rating          smallint not null check (rating between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists employer_ratings_org_idx
  on public.employer_ratings (organization_id);

/**
 * Companies that do not want to be ranked publicly.
 *
 * A SECOND TABLE, UNAVOIDABLY. `leaderboard_opt_out` is keyed on
 * `profiles.id`; organizations have text ids and are not profiles, so a
 * company physically cannot use it. The plan requires the opt-out to cover
 * "any user or company", and reusing the existing table would have meant
 * opting out whichever employee happened to click it — which is a different
 * promise from the one the setting makes.
 */
create table if not exists public.organization_opt_out (
  organization_id text primary key references public.organizations (id) on delete cascade,
  created_at      timestamptz not null default now()
);

-- The responsiveness view asks for the earliest employer event per
-- application. The existing index is (application_id, at), which cannot skip
-- the candidate's and the system's rows.
create index if not exists application_events_actor_idx
  on public.application_events (application_id, actor, at);

alter table public.employer_ratings enable row level security;
alter table public.organization_opt_out enable row level security;

/**
 * The Hiring Responsiveness Score, with its parts exposed.
 *
 * ONE DEFINITION, IN ONE PLACE. A score that ranks named companies publicly
 * must not be computable two slightly different ways by two callers — the
 * employer reading their own breakdown and the board ranking them have to
 * agree, or the first support ticket is unanswerable.
 *
 * Every component is normalised to 0..1 before weighting, so the weights mean
 * what they say.
 */
create or replace view public.employer_responsiveness as
with answered as (
  select
    a.id             as application_id,
    j.organization_id,
    a.status,
    a.applied_at,
    (
      select min(e.at)
      from public.application_events e
      where e.application_id = a.id
        and e.actor = 'employer'
    ) as first_reply_at,
    exists (
      select 1
      from public.application_events e
      where e.application_id = a.id
        and e.actor = 'employer'
        and e.note is not null
        and btrim(e.note) <> ''
    ) as explained
  from public.applications a
  join public.jobs j on j.id = a.job_id
),
judged as (
  select
    organization_id,
    application_id,
    explained,
    /*
     * SPEED, PER APPLICATION.
     *
     * Within a day is a full mark; a fortnight or worse is nothing; linear
     * between. An application nobody has answered AFTER a fortnight scores
     * zero rather than being left out — excluding the silent ones would mean
     * a company that answers one candidate quickly and ignores a hundred
     * ranks above one that answers everybody in three days, which is the
     * exact behaviour this score exists to discourage.
     *
     * An unanswered application still inside the fortnight is null: not yet
     * late, so not yet evidence either way.
     */
    case
      when first_reply_at is not null then
        greatest(0, least(1,
          1 - (greatest(0, extract(epoch from (first_reply_at - applied_at)) / 3600) - 24) / 312
        ))
      when applied_at < now() - interval '14 days' then 0
      else null
    end as speed,
    /*
     * CLOSURE. A terminal status is an answer. A non-terminal application
     * left for a month is a non-answer, and counts as one.
     */
    case
      when status in ('rejected', 'hired', 'declined') then true
      when applied_at < now() - interval '30 days' then true
      else false
    end as closed,
    status in ('rejected', 'hired', 'declined') as terminal
  from answered
),
per_org as (
  select
    organization_id,
    -- Median, not mean: one abandoned application should not sink a team that
    -- answers everything else the same week. Nulls — applications not yet
    -- late — are ignored by `percentile_cont` itself, which is exactly the
    -- wanted behaviour, so no filter is needed.
    percentile_cont(0.5) within group (order by speed) as response_speed,
    count(*) filter (where closed)     as closed_count,
    -- Of the applications this company has closed out, how many came with a
    -- reason. This is the component that punishes ghosting.
    case
      when count(*) filter (where closed) = 0 then null
      else count(*) filter (where closed and terminal and explained)::numeric
           / count(*) filter (where closed)
    end as feedback_rate
  from judged
  group by organization_id
),
rated as (
  select
    organization_id,
    count(*)                        as rating_count,
    (avg(rating) - 1) / 4           as experience_rating
  from public.employer_ratings
  group by organization_id
)
select
  o.id                                  as organization_id,
  o.name                                as organization_name,
  coalesce(p.response_speed, 0)::numeric as response_speed,
  coalesce(p.feedback_rate, 0)::numeric  as feedback_rate,
  r.experience_rating::numeric           as experience_rating,
  coalesce(r.rating_count, 0)            as rating_count,
  coalesce(p.closed_count, 0)            as closed_count,
  /*
   * THE SCORE.
   *
   * With ratings: the plan's 40/30/30.
   *
   * Without any: the remaining weights are renormalised rather than the
   * missing third being scored zero. A company nobody has rated yet has not
   * done anything wrong, and starting every new employer at a hard 70% cap
   * would make the board mostly a measure of age.
   */
  case
    when r.experience_rating is not null then
      0.40 * coalesce(p.response_speed, 0)
      + 0.30 * coalesce(p.feedback_rate, 0)
      + 0.30 * r.experience_rating
    else
      (0.40 * coalesce(p.response_speed, 0) + 0.30 * coalesce(p.feedback_rate, 0)) / 0.70
  end::numeric as hrs
from public.organizations o
left join per_org p on p.organization_id = o.id
left join rated   r on r.organization_id = o.id;
