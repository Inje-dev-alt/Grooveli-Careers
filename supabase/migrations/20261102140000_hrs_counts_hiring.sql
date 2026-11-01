-- Fix: HRS punished employers for hiring people.
--
-- The view's feedback component asked whether an application was closed out
-- with an explanation, and looked for an `application_events` row with
-- `actor = 'employer'` carrying a note. That is how a rejection is recorded —
-- `PATCH /applications/:id` refuses a rejection with no reason, so every one
-- of them has a note.
--
-- It is NOT how a hire is recorded. `POST /applications/:id/respond` writes
-- the terminal `hired` or `declined` row with `actor = 'candidate'`, because
-- the candidate is the one answering, and the employer's own last act is the
-- offer, whose note is optional and in practice null. So an application that
-- ended in someone being hired counted as closed-without-explanation, and a
-- company that hired six people scored 0.571 where a company that rejected
-- six scored 1.000.
--
-- An offer is an explicit, communicated employer decision, and `hired` and
-- `declined` are reachable only from `offer` — the respond route rejects any
-- other starting status. Reaching either therefore means the employer both
-- answered and committed, which is the most communicative outcome there is.
--
-- Caught by `npm run check:hrs` once the fixtures modelled what the API
-- actually writes rather than what was convenient to insert.
--
-- Reversal: re-run the view definition in 20261102120000.

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
    /*
     * Did this company tell the candidate where they stood?
     *
     * Two ways, because the product records two kinds of answer. A rejection
     * carries an employer note — the API will not accept one without. A hire
     * or a declined offer is reached only through `offer`, which is an
     * employer act in itself; the terminal row is written by the candidate
     * accepting or declining, so there is no employer note to look for and
     * requiring one would mean punishing companies for making offers.
     */
    (
      a.status in ('hired', 'declined')
      or exists (
        select 1
        from public.application_events e
        where e.application_id = a.id
          and e.actor = 'employer'
          and e.note is not null
          and btrim(e.note) <> ''
      )
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
    -- Of the applications this company has closed out, how many came with an
    -- answer the candidate could act on. This is the component that punishes
    -- ghosting.
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
