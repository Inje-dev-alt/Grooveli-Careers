-- Report 0 awarded when nothing was awarded.
--
-- `apply_career_event` was inconsistent about one field. The one-shot branch
-- reported `xp_awarded: 0` on a repeat, but the two replay branches reported
-- the amount the *original* event had paid — so `xp_awarded` meant "what this
-- call awarded" on one path and "what that event was once worth" on another.
--
-- The totals were never wrong: `xp_total` comes from `career_progress` either
-- way, and no second award was made. What was wrong was what the caller could
-- say about it. `careerStore.recordEvent` returns `xpAwarded` as the award for
-- this action, so a replayed skill challenge raised a "+100 XP" toast for XP
-- nobody earned — found by the live smoke test, which the mock had missed
-- because it already answered 0.
--
-- All three early-return branches now report 0, and `status` remains the way
-- to tell the three apart (`applied` | `replayed` | `already_counted`). The
-- original amount stays on the `career_events` row for anyone who needs it.
--
-- Only the two jsonb literals change; the body is otherwise the function as
-- 20261022130000 defined it, re-issued with `create or replace`.
--
-- Reversal: re-run 20261022130000_apply_career_event.sql.

create or replace function public.apply_career_event(
  p_user_id         uuid,
  p_event           text,
  p_context         jsonb,
  p_idempotency_key text,
  p_xp              integer,
  p_reputation      integer,
  p_label           text,
  p_stat_column     text,
  p_one_shot        boolean,
  p_achievement_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   public.career_events;
  v_event      public.career_events;
  v_progress   public.career_progress;
  v_stats      public.career_stats;
  v_awarded    text[] := '{}';
  v_aid        text;
begin
  -- The one-shot rule. Profile completion, CV upload and the assessment may be
  -- counted once per account, ever — a page reload used to re-award them.
  -- Reported rather than raised: the caller wants the current state back, not
  -- an error, because re-firing is normal (the screen cannot know).
  if p_one_shot and exists (
    select 1 from public.career_events
    where user_id = p_user_id and event = p_event
  ) then
    select * into v_progress from public.career_progress where user_id = p_user_id;
    select * into v_stats    from public.career_stats    where user_id = p_user_id;
    return jsonb_build_object(
      'status', 'already_counted',
      'xp_awarded', 0,
      'reputation_awarded', 0,
      'xp_total', coalesce(v_progress.xp, 0),
      'reputation', coalesce(v_progress.reputation, 0),
      'stats', to_jsonb(v_stats),
      'awarded_achievements', '[]'::jsonb
    );
  end if;

  -- Idempotent replay. Every screen that can fire an event can double-fire it,
  -- so a repeated key returns the original outcome instead of awarding again.
  select * into v_existing from public.career_events
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    select * into v_progress from public.career_progress where user_id = p_user_id;
    select * into v_stats    from public.career_stats    where user_id = p_user_id;
    return jsonb_build_object(
      'status', 'replayed',
      'event_id', v_existing.id,
      'xp_awarded', 0,
      'reputation_awarded', 0,
      'xp_total', coalesce(v_progress.xp, 0),
      'reputation', coalesce(v_progress.reputation, 0),
      'stats', to_jsonb(v_stats),
      'awarded_achievements', '[]'::jsonb
    );
  end if;

  -- The two guards above are read-then-write, so they are not sufficient on
  -- their own: two concurrent calls (a double-click, two tabs) can both pass
  -- the SELECT and both reach this INSERT. One of them then trips either
  -- `career_events_user_id_idempotency_key_key` or the one-shot partial index.
  --
  -- That is the *normal* case for this endpoint, not an error, so the unique
  -- violation is caught and answered with the winner's outcome. Without this
  -- block the loser gets a 500 and the UI reports a failure for an event that
  -- was in fact recorded exactly once -- the worst of both readings.
  begin
    insert into public.career_events
      (user_id, event, context, idempotency_key, xp_awarded, reputation_awarded)
    values
      (p_user_id, p_event, coalesce(p_context, '{}'::jsonb), p_idempotency_key,
       coalesce(p_xp, 0), coalesce(p_reputation, 0))
    returning * into v_event;
  exception when unique_violation then
    select * into v_existing from public.career_events
     where user_id = p_user_id
       and (idempotency_key = p_idempotency_key
            or (p_one_shot and event = p_event));
    select * into v_progress from public.career_progress where user_id = p_user_id;
    select * into v_stats    from public.career_stats    where user_id = p_user_id;
    return jsonb_build_object(
      'status', case when p_one_shot then 'already_counted' else 'replayed' end,
      'event_id', v_existing.id,
      'xp_awarded', 0,
      'reputation_awarded', 0,
      'xp_total', coalesce(v_progress.xp, 0),
      'reputation', coalesce(v_progress.reputation, 0),
      'stats', to_jsonb(v_stats),
      'awarded_achievements', '[]'::jsonb
    );
  end;

  -- A row may not exist yet: progression is created on first event, never
  -- handed out at registration.
  insert into public.career_progress (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  insert into public.career_stats (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  -- `xp = xp + n` inside the statement is what makes this race-free; the row
  -- is locked for the duration of the transaction.
  update public.career_progress
     set xp         = xp + coalesce(p_xp, 0),
         reputation = least(100, greatest(0, reputation + coalesce(p_reputation, 0))),
         updated_at = now()
   where user_id = p_user_id
  returning * into v_progress;

  -- Dynamic column, but never a client-supplied one: p_stat_column comes from
  -- STAT_FOR_EVENT in progression.ts. Whitelisted anyway, so that a future
  -- caller cannot turn this into an injection point.
  if p_stat_column is not null then
    if p_stat_column not in (
      'completed_missions', 'certifications', 'applications',
      'interviews', 'offers', 'jobs_viewed', 'locations_visited'
    ) then
      raise exception 'apply_career_event: unknown stat column %', p_stat_column;
    end if;
    execute format(
      'update public.career_stats set %I = %I + 1, updated_at = now() where user_id = $1',
      p_stat_column, p_stat_column
    ) using p_user_id;
  end if;

  select * into v_stats from public.career_stats where user_id = p_user_id;

  -- Only non-zero awards earn a ledger row; a zero-XP event is still recorded
  -- as an event and an activity, but the ledger stays a record of progression.
  if coalesce(p_xp, 0) <> 0 then
    insert into public.xp_ledger (user_id, career_event_id, event, amount, reason)
    values (p_user_id, v_event.id, p_event, p_xp, p_label);
  end if;

  insert into public.career_activity
    (user_id, career_event_id, type, label, xp, shareable)
  values
    (p_user_id, v_event.id, p_event, p_label, coalesce(p_xp, 0), true);

  -- Achievement counters. Context matching already happened in TypeScript
  -- (contextMatches), so every id handed in is one this event legitimately
  -- advances; an award already earned is left alone by the `awarded_at` guard.
  if p_achievement_ids is not null then
    foreach v_aid in array p_achievement_ids loop
      insert into public.achievement_progress (user_id, achievement_id, count)
      values (p_user_id, v_aid, 1)
      on conflict (user_id, achievement_id) do update
        set count = public.achievement_progress.count + 1
        where public.achievement_progress.awarded_at is null;
    end loop;

    with newly as (
      update public.achievement_progress ap
         set awarded_at = now()
        from public.achievements a
       where a.id = ap.achievement_id
         and ap.user_id = p_user_id
         and ap.achievement_id = any (p_achievement_ids)
         and ap.awarded_at is null
         and ap.count >= a.required_count
      returning ap.achievement_id
    )
    select coalesce(array_agg(achievement_id), '{}') into v_awarded from newly;
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'event_id', v_event.id,
    'occurred_at', v_event.occurred_at,
    'xp_awarded', coalesce(p_xp, 0),
    'reputation_awarded', coalesce(p_reputation, 0),
    'xp_total', v_progress.xp,
    'reputation', v_progress.reputation,
    'stats', to_jsonb(v_stats),
    'awarded_achievements', to_jsonb(v_awarded)
  );
end;
$$;

-- The router reaches this through the service-role client only, exactly as it
-- reaches the tables. No anon/authenticated grant: RLS is deny-all everywhere
-- in this schema and a security-definer function must not be a way around it.
revoke all on function public.apply_career_event(
  uuid, text, jsonb, text, integer, integer, text, text, boolean, text[]
) from public, anon, authenticated;
