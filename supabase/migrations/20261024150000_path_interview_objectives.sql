-- Key the path missions' interview objectives, now that an interview has a path.
--
-- Deferred deliberately in 20261023140000. Ten `msn-path-*` missions each ask
-- for an interview simulation and name a career path in the asking:
--
--   obj-path-hr-interview        Complete a Human Resources interview simulation
--   obj-path-software-interview  Complete a Software Development interview simulation
--   …
--
-- They all listened for a bare `interview.simulated`, so any simulation
-- satisfied any of them. The fix was held back because keying them on
-- `context.pathId` would have bound an endpoint that did not exist: if
-- `/interviews/*` had turned out to send an inferred path, a different
-- vocabulary, or no path at all, ten objectives would have become quietly
-- impossible — a worse failure than the one being fixed, and harder to notice.
--
-- Batch 3.7 settled it. `interview_attempts.path_id` defaults to the account's
-- explicit `candidate_profiles.career_path_id` — the same value that gates
-- which path missions it is served — and the AI centre carries that id into
-- the career event as `context.pathId`. So the default simulation is always
-- the one its own path mission is asking for, and a simulation deliberately
-- sat for another path does not count, which is what the objective's words
-- already said.
--
-- Derived from `missions.path_id` rather than written out ten times: a list of
-- ten hand-typed ids is ten chances to pair an objective with the wrong path,
-- and a mission keyed to a path its account can never be on is an objective
-- nobody can finish.
--
-- Reversal:
--   update public.mission_objectives
--      set context_key = null, context_value = null
--    where event = 'interview.simulated' and context_key = 'pathId';

update public.mission_objectives o
   set context_key   = 'pathId',
       context_value = m.path_id
  from public.missions m
 where o.mission_id = m.id
   and m.path_id is not null
   and o.event = 'interview.simulated'
   and o.context_key is null;

-- Left generic on purpose, and this is the point of scoping by `missions.path_id`
-- rather than by event:
--
--   msn-first-job / obj-interview      "Complete an interview simulation"
--   msn-interview / obj-interview-sim  "Complete an AI interview"
--
-- Neither names a path, neither belongs to one, and any simulation should
-- finish them.
