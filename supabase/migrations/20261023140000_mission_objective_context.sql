-- Let an objective name *which* thing satisfies it.
--
-- `mission_objectives` named an event and a count and nothing else, so two
-- objectives listening for the same event were indistinguishable. Four skill
-- missions each ask for `skill.challenge` x1:
--
--   msn-excel         obj-excel-challenge     Complete the Excel challenge
--   msn-communication obj-comms-exercise      Complete the AI communication exercise
--   msn-recruitment   obj-recruitment-eval    Evaluate the candidate shortlist
--   msn-sales         obj-sales-sim           Handle the simulated customer conversation
--
-- Each names a different piece of work, but any one `skill.challenge` event
-- satisfied all four, so one passed challenge could claim four missions and
-- 400 XP. The live smoke test claimed 4/4 from two challenges.
--
-- This predates the progression batches -- it was equally true when the browser
-- awarded missions from `src/mock/missions.js` -- but it is the last remaining
-- way to draw more XP than the work justifies, now that events are keyed and
-- rewards come from the catalog.
--
-- The fix mirrors `achievements`, which already solved this problem: a nullable
-- `context_key`/`context_value` pair, matched by `contextMatches` against the
-- event's recorded `context`. That is why the Excel *achievement* was always
-- correct while the Excel *mission* was not -- the achievement had the columns.
-- A null key means "any event of this type", which stays the right answer for
-- `obj-sharpen` ("Pass a skill mission"), `obj-apply` ("Apply to three suitable
-- jobs") and every other deliberately generic objective.
--
-- Reversal:
--   alter table public.mission_objectives
--     drop constraint mission_objectives_context_pair,
--     drop column context_value,
--     drop column context_key;

alter table public.mission_objectives
  add column if not exists context_key   text,
  add column if not exists context_value text;

comment on column public.mission_objectives.context_key is
  'Field of the career event''s context this objective requires, e.g. ''skill''. '
  'Null means any event of this type advances it.';
comment on column public.mission_objectives.context_value is
  'Value that field must carry, compared case-insensitively after trimming.';

-- Half a pair is a silent no-op: a key with no value would compare every event
-- against the empty string and advance nothing, which reads in the UI as an
-- objective that can never be finished.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mission_objectives_context_pair'
  ) then
    alter table public.mission_objectives
      add constraint mission_objectives_context_pair
      check ((context_key is null) = (context_value is null));
  end if;
end $$;

-- The four skill objectives, keyed on the skill the challenge is about. These
-- values are the ones the client already sends: `SKILL_FOR_CATEGORY` in
-- src/components/missions/MissionDetail.jsx maps the mission's category to
-- exactly these strings, and has since the challenge was built.
--
-- Scoped by id rather than by event so `obj-sharpen` is left generic, which is
-- what its label asks for.
update public.mission_objectives set context_key = 'skill', context_value = 'Excel'
  where id = 'obj-excel-challenge';
update public.mission_objectives set context_key = 'skill', context_value = 'Communication'
  where id = 'obj-comms-exercise';
update public.mission_objectives set context_key = 'skill', context_value = 'Recruitment'
  where id = 'obj-recruitment-eval';
update public.mission_objectives set context_key = 'skill', context_value = 'Sales'
  where id = 'obj-sales-sim';

-- Deliberately NOT keyed here: the ten `msn-path-*` interview objectives, which
-- each name a career path ("Complete a Human Resources interview simulation")
-- and share `interview.simulated` the same way.
--
-- Keying them on `context.pathId` would be correct today and is probably where
-- this ends up, but it would bind an endpoint that does not exist yet.
-- `/interviews/*` is still mocked (§11 step 11), and the value only lines up
-- because the mock's `resolvePathForProfile` happens to prefer the explicit
-- `careerPathId` that also gates which path missions an account is served. If
-- the real endpoint sends an inferred path, a different vocabulary, or no
-- `pathId` at all, ten objectives become quietly impossible -- which is a worse
-- failure than the one being fixed, and harder to notice.
--
-- The hole left open is small: an account is only served a path's mission if it
-- is already on that path, so the most that can be gained is satisfying your
-- own path's interview objective with a simulation nominated for another, which
-- the interface offers no way to do. Recorded as a contract requirement on
-- `/interviews/*` in the handoff instead, to be keyed when that batch lands.
