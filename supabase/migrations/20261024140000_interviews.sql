-- Batch 3.7 — interview simulation (handoff §4.7).
--
-- A simulation is a real exam with a binary pass rule: **two correct answers
-- pass, two wrong answers fail**, over up to four questions drawn from the
-- candidate's path bank. An exam everyone passes certifies nothing, and the
-- Interview Ready badge is only worth wearing if it can be failed.
--
-- The reason this needs a table at all: the answer key cannot live in the
-- browser. The prototype shipped `src/data/interviewQuestions.js` with every
-- `answerIndex` and rationale in it, so the exam was open-book to anyone who
-- opened devtools. Here the bank is server-side and a question is served
-- without its answer; the rationale rides back with the grade, because the
-- point of a practice interview is the feedback rather than the score.
--
-- THIS FILE IS GENERATED. Edit src/data/interviewQuestions.js and re-run
-- `node scripts/generate-interview-seed.mjs` rather than editing the seed by
-- hand — a mistyped answer index tells a candidate they failed a question they
-- answered correctly.
--
-- Reversal:
--   drop table if exists public.interview_attempts;
--   drop table if exists public.interviews;
--   drop table if exists public.interview_questions;

/* ---------------------------------------------------------- the bank --- */

create table if not exists public.interview_questions (
  id           text primary key,
  -- Matches career_paths.interview_bank_id, plus 'bank-general' for an
  -- account whose path cannot be resolved. Not a foreign key: the general
  -- bank belongs to no path.
  bank_id      text not null,
  question     text not null,
  options      jsonb not null,
  -- Never served to a candidate mid-exam. See routes/interviews.ts.
  answer_index integer not null check (answer_index >= 0),
  rationale    text not null,
  sort_order   integer not null default 0
);

create index if not exists interview_questions_bank_idx
  on public.interview_questions (bank_id, sort_order);

/* ------------------------------------------------------- the attempt --- */

create table if not exists public.interview_attempts (
  id             text primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  -- Nullable: an account with no resolved path sits the general bank.
  path_id        text references public.career_paths (id),
  path_title     text not null default '',
  job_title      text not null default '',
  -- The drawn paper, fixed when the attempt starts so a retry cannot swap
  -- questions mid-exam (§4.7).
  question_ids   jsonb not null default '[]'::jsonb,
  answers        jsonb not null default '[]'::jsonb,
  correct_count  integer not null default 0,
  wrong_count    integer not null default 0,
  status         text not null default 'in-progress'
    check (status in ('in-progress', 'passed', 'failed')),
  passed         boolean,
  score          integer check (score is null or score between 0 and 100),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index if not exists interview_attempts_user_idx
  on public.interview_attempts (user_id, started_at desc);

/* ------------------------------------------ the schedule and record --- */

-- Interviews as events: the ones an employer schedules, and the completed
-- simulations the AI centre records. One table, because the candidate's
-- "Interviews" surface lists both.
create table if not exists public.interviews (
  id             text primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  company_name   text not null default '',
  job_title      text not null default '',
  type           text not null default 'screening'
    check (type in ('screening', 'technical', 'final', 'simulation')),
  scheduled_at   timestamptz not null default now(),
  status         text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  score          integer check (score is null or score between 0 and 100)
);

create index if not exists interviews_user_idx
  on public.interviews (user_id, scheduled_at);

alter table public.interview_questions enable row level security;
alter table public.interview_attempts enable row level security;
alter table public.interviews enable row level security;

/* ------------------------------------------------------------- seed --- */

-- 55 questions across 11 banks, generated from
-- src/data/interviewQuestions.js.
insert into public.interview_questions
  (id, bank_id, question, options, answer_index, rationale, sort_order) values
  ('hr-1', 'bank-hr', 'A hiring manager asks you to fill a role in five days. What do you say first?', '["Agree, then work nights to deliver","Ask what success looks like, then trade scope for time","Say no - five days is impossible","Post the job and hope"]'::jsonb, 1, 'Anchor on the outcome, then negotiate scope or timeline. Agreeing first trains the stakeholder to keep doing it.', 0),
  ('hr-2', 'bank-hr', 'Four candidates apply for a backend role. Which shortlist decision is defensible?', '["Shortlist the two with the best university names","Shortlist everyone who applied - fairness means no cuts","Shortlist two against the brief''s must-haves and write down why the others missed it","Shortlist the two with the most total years"]'::jsonb, 2, 'A shortlist is a judgement against the brief, written down. Prestige and tenure are proxies; the brief is the standard you can defend.', 1),
  ('hr-3', 'bank-hr', 'A candidate asks for salary far above the band. What is the honest response?', '["Promise you will try to get it approved","State the band, ask what they need to see to be comfortable, and keep the process moving","End the conversation - they are out of range","Invent a higher band to keep them warm"]'::jsonb, 1, 'State reality, explore the gap, keep the process honest. Candidates remember how a process treated them long after the result.', 2),
  ('hr-4', 'bank-hr', 'Two interviewers score the same candidate differently. What resolves it?', '["Average the scores and move on","The senior interviewer decides","Compare notes against the same criteria and record the evidence behind the call","Re-interview until you get agreement"]'::jsonb, 2, 'Disagreement usually means unclear criteria, not a bad candidate. Re-anchoring on evidence fixes both the decision and the scorecard.', 3),
  ('hr-5', 'bank-hr', 'What makes an effective exit interview worth running?', '["It changes nothing but checks a box","Patterns across leavers surface real problems while they are still fixable","It is a chance to negotiate them back","Legal requirement in every company"]'::jsonb, 1, 'One exit interview is an anecdote; a pattern across them is the most honest survey a company will ever get.', 4),
  ('sw-1', 'bank-software', 'A deploy broke production. First move?', '["Find who pushed the bad commit","Roll back to the last known good release, then investigate","Hot-fix forward as fast as possible","Write the post-mortem before acting"]'::jsonb, 1, 'Restore service first, learn second. Blame and forensics both wait until users are whole.', 0),
  ('sw-2', 'bank-software', 'A teammate''s PR has a subtle bug in a hot path. What do you do?', '["Approve with a comment and move on","Fix it yourself on their branch without a word","Request changes with a concrete example of the failure and why it matters","Merge it - the test suite will catch it later"]'::jsonb, 2, 'Review is where correctness is cheapest. Specific beats vague, and a suggested fix beats both.', 1),
  ('sw-3', 'bank-software', 'Which database index fits a query that filters by tenant and sorts by created_at?', '["Index on created_at alone","Composite index on (tenant_id, created_at)","Index on every column separately","No index - the planner will figure it out"]'::jsonb, 1, 'Composite in the order you filter then sort. Separate indexes rarely combine the way you hope.', 2),
  ('sw-4', 'bank-software', 'A feature works locally but fails in staging. What do you check first?', '["Rewrite the feature","Environment differences: config, secrets, data shape, service versions","Blame the staging server","Merge locally again and hope"]'::jsonb, 1, 'The code is the same; the environment is not. Diff the environment before you diff the logic.', 3),
  ('sw-5', 'bank-software', 'What is the strongest signal a piece of code is ready to merge?', '["It compiles without warnings","The author understands every line and can explain the trade-offs","The ticket is marked urgent","It has been open for more than a day"]'::jsonb, 1, 'Ownership of the change is the real gate. Code nobody can explain becomes code nobody can safely change.', 4),
  ('ai-1', 'bank-ai', 'A model answers confidently but wrongly. What is the first fix to try?', '["Increase the temperature","Ground it: retrieval over your own documents, with citations","Switch to a bigger model immediately","Add a disclaimer to the output"]'::jsonb, 1, 'Confident wrongness is usually missing grounding, not missing size. Evidence in the prompt fixes more than parameters do.', 0),
  ('ai-2', 'bank-ai', 'How do you evaluate a prompt change before shipping it?', '["A few examples by eye is enough","A fixed evaluation set with scoring, run before and after","Ship it and watch for complaints","Ask the model if the change is good"]'::jsonb, 1, 'Without a repeatable eval set, prompt work is vibes. Measure on cases that broke before you claim it is fixed.', 1),
  ('ai-3', 'bank-ai', 'An AI agent should call a tool that submits a job application when…', '["The user mentions applying at all","The intent is clear and the user has explicitly confirmed the action","Confidence score is above 90%","The agent has nothing better to suggest"]'::jsonb, 1, 'Consequential actions require explicit confirmation. Intent detection routes; the human authorises.', 2),
  ('ai-4', 'bank-ai', 'Retrieval keeps returning documents that are similar but irrelevant. Best lever?', '["Add more documents to the corpus","Improve chunking and query rewriting before touching the embedding model","Raise the top-k to 50","Switch embedding models weekly"]'::jsonb, 1, 'Garbage in chunks is garbage in context. Structure of retrieval beats swapping the model underneath it.', 3),
  ('ai-5', 'bank-ai', 'What is the safest default when a model output will drive a real decision?', '["Trust it - models are accurate now","Show the reasoning, log the input/output, and keep a human in the loop","Hide the output so users are not confused","Run it twice and average"]'::jsonb, 1, 'Legibility plus a human checkpoint. Silent automation of real decisions is how AI incidents are born.', 4),
  ('soc-1', 'bank-social', 'A post underperforms badly. What do you examine first?', '["Delete it immediately","The hook, timing and audience fit - then re-cut the idea rather than repost blindly","Buy followers to lift the account","Post the same thing again tomorrow"]'::jsonb, 1, 'One data point is a diagnosis opportunity, not a verdict. Hook and timing explain most underperformance.', 0),
  ('soc-2', 'bank-social', 'The brand gets a critical comment going viral. First response?', '["Delete and block","Ignore it - engagement is engagement","Acknowledge publicly, take specifics to DM, and loop in the team that owns the issue","Argue the point in replies"]'::jsonb, 2, 'Acknowledge fast, resolve offline, fix the root cause. Deleting reads as guilt; arguing reads as defensiveness.', 1),
  ('soc-3', 'bank-social', 'What makes a content calendar survive contact with a real week?', '["More posts per day","Pillars plus a re-use plan: every asset earns twice","Rigid daily themes never broken","Posting only when inspired"]'::jsonb, 1, 'Pillars give structure; re-use gives runway. Rigid calendars break; inspiration does not scale.', 2),
  ('soc-4', 'bank-social', 'Which metric best proves social work to a sceptical finance lead?', '["Follower count","Reach and engagement rate","Assisted conversions and inbound conversations attributed to social","How many posts went out"]'::jsonb, 2, 'Finance speaks outcomes. Follower counts are vanity; attributed conversations are the bridge to revenue.', 3),
  ('soc-5', 'bank-social', 'A campaign needs both a brand voice and a hard deadline. What wins when they conflict?', '["Brand voice - consistency is everything","The deadline - marketing is a business function","Neither: renegotiate the deadline or the scope with clear reasons","Split the difference and do both badly"]'::jsonb, 2, 'Trade-offs get named and escalated, not absorbed silently. The best marketers renegotiate instead of quietly compromising both.', 4),
  ('mkt-1', 'bank-marketing', 'A paid campaign has clicks but zero conversions. Where do you look?', '["Raise the budget","Landing page message match, offer clarity and form friction before touching the ads","Switch ad platforms","Pause everything"]'::jsonb, 1, 'Traffic without conversion is usually a landing problem. Fix the page before you buy more of the same click.', 0),
  ('mkt-2', 'bank-marketing', 'What does a good test hypothesis look like?', '["Try the button in green","Because first-time visitors are unclear on pricing, showing it early will raise qualified signups","The competitor changed their homepage","Marketing feels the copy is stale"]'::jsonb, 1, 'A hypothesis names who, why and the predicted movement. Without it, tests are randomised redecorating.', 1),
  ('mkt-3', 'bank-marketing', 'Open rates drop across a whole list overnight. Most likely cause?', '["Content fatigue","A deliverability problem: authentication, reputation or a provider issue","Wrong send time","Subject lines got worse in one day"]'::jsonb, 1, 'Sudden, list-wide drops are infrastructure, not editorial. Check SPF/DKIM/DMARC and reputation first.', 2),
  ('mkt-4', 'bank-marketing', 'Which channel should get the next tranche of budget?', '["Whichever has the most impressions","The one with the lowest measured cost per qualified outcome at current scale","Whatever the CEO saw at a conference","The newest platform"]'::jsonb, 1, 'Marginal cost per qualified outcome decides. Impressions and novelty are not outcomes.', 3),
  ('mkt-5', 'bank-marketing', 'SEO results are flat after three months of work. Your call?', '["Abandon SEO","Audit whether the work targeted intent anyone searches, then escalate to content that matches demand","Buy backlinks","Rewrite every page randomly"]'::jsonb, 1, 'Flat results are usually wrong-intent work. Search demand is the strategy; tactics follow it.', 4),
  ('des-1', 'bank-design', 'Stakeholders disagree on a flow. What moves it forward?', '["A vote - majority rules","The person with the loudest voice","Return to the user problem and the evidence each option serves","Design all three and ship one at random"]'::jsonb, 2, 'Taste arguments end when the shared problem is restated. Evidence beats seniority, and votes measure politics.', 0),
  ('des-2', 'bank-design', 'What belongs in a design case study?', '["Only the final polished screens","The problem, constraints, options considered, the decision and its measured result","Every iteration, unfiltered","The tools used and hours spent"]'::jsonb, 1, 'Portfolio readers hire judgement, not screenshots. Decisions and outcomes are the evidence.', 1),
  ('des-3', 'bank-design', 'A redesign ships and task completion drops. First move?', '["Revert immediately","Blame the users for not adapting","Instrument the failing step, watch real sessions, and fix that step","Redesign it again from scratch"]'::jsonb, 2, 'Find the break before choosing the fix. Sessions tell you where confusion actually lives.', 2),
  ('des-4', 'bank-design', 'How should a design system decide when a new component is allowed?', '["Any team can add one freely","Only designers may add components","It must be a repeating pattern with at least two real use cases and a named owner","Never - use variants only"]'::jsonb, 2, 'Two real use cases prevent component sprawl; ownership keeps it maintained. Both constraints together.', 3),
  ('des-5', 'bank-design', 'Accessibility in design handoff means…', '["A checkbox the engineer owns","Contrast, focus order, labels and touch targets specified so it cannot be skipped downstream","Adding alt text at the end","Only a compliance requirement"]'::jsonb, 1, 'Accessibility decided at build time costs ten times more. Specified constraints travel; checkboxes do not.', 4),
  ('mot-1', 'bank-motion', 'What makes an interface animation feel intentional rather than decorative?', '["Longer durations","It follows easing that matches the physical metaphor and guides attention","More movement on screen","Bouncing easing on everything"]'::jsonb, 1, 'Motion earns its place by explaining causality. Ease-in-out reads as weight; arbitrary bounce reads as toy.', 0),
  ('mot-2', 'bank-motion', 'A brand wants a 30-second product film but only 15 seconds of footage exist. Best move?', '["Stretch every clip to fill time","Add a stock library wholesale","Cut to the strongest 15 seconds and rebuild the story around the constraint","Add more text cards"]'::jsonb, 2, 'Story length follows material, not the other way round. Padding footage is how films lose their pulse.', 1),
  ('mot-3', 'bank-motion', 'Delivery day is tomorrow and After Effects keeps crashing on a comp. What do you do?', '["Keep retrying the same approach all night","Pre-compose the heavy layers, proxy the footage and keep a rendered backup path ready","Deliver nothing - quality matters","Lower quality silently and say nothing"]'::jsonb, 1, 'Professional motion is production discipline: proxies, pre-comps and fallback renders beat heroics. Silence about quality is the only bad option.', 2),
  ('mot-4', 'bank-motion', 'What is the correct review loop for motion in a design system?', '["Animate first, discuss later","Timing and easing specs agreed with design, then implementation against those specs","Engineering invents the motion","No review - motion is taste"]'::jsonb, 1, 'Specified motion (duration, easing, trigger) ships consistently; improvised motion drifts across every screen.', 3),
  ('mot-5', 'bank-motion', 'Which file handoff do frontend engineers actually prefer?', '["A video recording of the animation","Tokenised durations and easings plus an exported reference","A PSD with notes","A verbal walkthrough"]'::jsonb, 1, 'Engineers build from values, not from watching. Tokens drop straight into CSS variables.', 4),
  ('vid-1', 'bank-video', 'A client says a cut is boring but cannot say why. What do you ask?', '["Should I add more effects?","Where did you stop paying attention, and what did you expect to happen instead?","Do you want a different music track?","Which competitor version do you prefer?"]'::jsonb, 1, 'Locate the moment, then diagnose pacing, content or structure. Vague notes become specific at a timestamp.', 0),
  ('vid-2', 'bank-video', 'Short-form retention drops hardest in the first two seconds. What holds it?', '["A logo sting first","A pattern interrupt that promises the payoff, with the hook on screen immediately","A slow build-up of context","Credits at the top"]'::jsonb, 1, 'The open earns the next second. Promise the payoff visibly before the viewer can scroll.', 1),
  ('vid-3', 'bank-video', 'Colour grading a dialogue scene across two cameras that do not match?', '["Grade them separately until each looks best","Match exposure and white balance on the primary camera first, then grade both to that reference","Hide it with a LUT preset","Add a filter over the whole sequence"]'::jsonb, 1, 'Reference-first: one anchor camera, everything matched to it. Per-shot beautification makes the mismatch worse.', 2),
  ('vid-4', 'bank-video', 'Three rounds of revisions are eating the project margin. What protects it?', '["Work faster quietly","Scope rounds in the quote, then charge for rounds beyond it - stated up front","Refuse further feedback","Raise the price silently mid-project"]'::jsonb, 1, 'Revision limits in the agreement, stated before work begins, are professional - not adversarial.', 3),
  ('vid-5', 'bank-video', 'What makes an edit actually finish?', '["Every effect the timeline allows","Nothing left to remove - pacing, audio levels and colour are consistent and the story lands","The client runs out of comments","The file reaches a target size"]'::jsonb, 1, 'Editing is subtraction. Consistency across picture and sound is what separates finished from abandoned.', 4),
  ('sup-1', 'bank-support', 'A customer is angry about a bug that is not your fault. Open with?', '["Explain immediately that it is not your team","Acknowledge the impact, own the next step, then explain cause later","Send the documentation link","Escalate before replying"]'::jsonb, 1, 'People need ownership before explanations. Cause matters once they believe someone is moving.', 0),
  ('sup-2', 'bank-support', 'The same issue hits twenty customers today. What separates good from great?', '["Answering all twenty identically","A templated fast reply plus one clear report to product with reproduction steps","Closing tickets quickly","Waiting for a product fix before replying"]'::jsonb, 1, 'Support at volume is a feedback channel. The report you send upstream saves the next twenty tickets.', 1),
  ('sup-3', 'bank-support', 'A request is impossible today. What do you say?', '["No - and end the chat","Maybe - and disappear to check","What is possible now, when the rest might be, and that you will follow up at a named time","Promise it will ship next month"]'::jsonb, 2, 'Honesty plus a deadline you keep. Overpromising converts a hard no into a broken trust later.', 2),
  ('sup-4', 'bank-support', 'A customer asks for a refund on a policy that forbids refunds. Right move?', '["Quote the policy word for word","Waive the policy every time","Acknowledge, explain the boundary plainly, and offer the best alternative you actually control","Blame the policy page"]'::jsonb, 2, 'Boundaries stated warmly and paired with a real alternative preserve the relationship and the policy.', 3),
  ('sup-5', 'bank-support', 'What does good ticket hygiene look like?', '["One mega-thread per customer","Clear subject, status, next action and owner on every ticket, always","Closing everything old","Internal notes only"]'::jsonb, 1, 'Tickets are a shared memory. Subject, status, next action, owner - anyone should be able to pick it up cold.', 4),
  ('va-1', 'bank-va', 'Your principal asks for two things at once, both due now. What do you do?', '["Do them in the order asked","Pick the one you think matters","Surface the conflict, state your recommendation on order, and confirm","Ask them to decide and wait"]'::jsonb, 2, 'Quiet prioritisation with a stated recommendation beats silent obedience or an empty question. Waiting is the only wrong answer.', 0),
  ('va-2', 'bank-va', 'What makes an inbox handoff actually work?', '["Every email forwarded as it arrives","Filters, flags and a short daily brief: what needs them, what was handled, what is pending","Archiving aggressively","Replying to everything yourself"]'::jsonb, 1, 'Triage is the value. A principal who opens their phone to 200 unread has been failed, not served.', 1),
  ('va-3', 'bank-va', 'A calendar conflict appears for a meeting that cannot move. You…', '["Let both invites stand","Cancel one at random","Flag it immediately with options, handle logistics, and confirm the outcome in writing","Reschedule something without asking"]'::jsonb, 2, 'Escalate early with options, then confirm in writing. Silence on a conflict is how executives end up double-booked.', 2),
  ('va-4', 'bank-va', 'Confidentiality looks like…', '["Signing the NDA and moving on","Handling credentials through a manager, never reusing devices, and saying no to requests that bypass it","Never discussing work with anyone","Keeping files on a personal laptop"]'::jsonb, 1, 'Practice, not paperwork: credential hygiene, device separation, and the nerve to decline unsafe requests.', 3),
  ('va-5', 'bank-va', 'How do you prove your value as a VA over time?', '["Hours logged","Messages answered and tasks closed without follow-up needed","Always being online","How fast you reply"]'::jsonb, 1, 'Value is measured in what never reaches the principal again. Hours and speed are inputs; absence of rework is the outcome.', 4),
  ('gen-1', 'bank-general', 'Walk me through a decision you made that turned out wrong. What now?', '["Name one, what it cost, and the rule you adopted afterwards","Claim you have never been wrong","Describe a minor preference you changed","Blame missing information entirely"]'::jsonb, 0, 'Specific cost plus a changed rule is accountability. Denial or vagueness tells an interviewer you do not metabolise failure.', 0),
  ('gen-2', 'bank-general', 'A deadline and quality are in direct conflict with two days left. You…', '["Ship anything on time","Miss the deadline silently and polish","Name the trade-off to the stakeholder with options: cut scope, extend, or add help","Ask the team to work nights without asking"]'::jsonb, 2, 'Trade-offs get escalated with options, never absorbed silently. Both silent choices break trust from one direction or the other.', 1),
  ('gen-3', 'bank-general', 'What do you do when you do not know the answer?', '["Guess confidently","Say so, say how you would find out, and follow up with the actual answer","Deflect to someone else","Avoid the question entirely"]'::jsonb, 1, 'Confident guessing destroys credibility permanently. The find-out-then-follow-up pattern is the professional answer.', 2),
  ('gen-4', 'bank-general', 'How do you decide what to work on first each day?', '["Whatever arrives first","The item with the nearest hard deadline","Impact against effort, adjusted for who is waiting on it","Whatever is easiest to clear"]'::jsonb, 2, 'Impact-per-effort with waiting-parties in the frame. Deadline-first works until everything is urgent to someone.', 3),
  ('gen-5', 'bank-general', 'Why here, and not the company down the road?', '["You are hiring and I need a job","Because you are known for this work, and here is the specific thing I want to build with you","I applied everywhere","The office is close to my house"]'::jsonb, 1, 'Research plus intent. Interviewers are choosing someone who chose them back, not someone routing applications.', 4)
on conflict (id) do update set
  bank_id      = excluded.bank_id,
  question     = excluded.question,
  options      = excluded.options,
  answer_index = excluded.answer_index,
  rationale    = excluded.rationale,
  sort_order   = excluded.sort_order;
