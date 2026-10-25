/**
 * Generates the interview migration from the repo's own question banks.
 *
 * The bank is 55 questions with their answer keys and rationales. Retyping it
 * into SQL would be an invitation to transcribe an answer index wrong, which
 * is a bug nobody notices until a candidate is told they failed a question
 * they got right. So the SQL is derived:
 *
 *   node scripts/generate-interview-seed.mjs
 *
 * Output: supabase/migrations/20261024140000_interviews.sql (idempotent, safe
 * to re-apply). Re-run it whenever src/data/interviewQuestions.js changes.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INTERVIEW_BANKS } from '../src/data/interviewQuestions.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** JS string -> SQL single-quoted literal. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const json = (v) => `${lit(JSON.stringify(v))}::jsonb`;

const rows = [];
for (const [bankId, questions] of Object.entries(INTERVIEW_BANKS)) {
  questions.forEach((q, index) => {
    rows.push(
      `  (${lit(q.id)}, ${lit(bankId)}, ${lit(q.question)}, ${json(q.options)}, ` +
        `${q.answerIndex}, ${lit(q.rationale)}, ${index})`,
    );
  });
}

const sql = `-- Batch 3.7 — interview simulation (handoff §4.7).
--
-- A simulation is a real exam with a binary pass rule: **two correct answers
-- pass, two wrong answers fail**, over up to four questions drawn from the
-- candidate's path bank. An exam everyone passes certifies nothing, and the
-- Interview Ready badge is only worth wearing if it can be failed.
--
-- The reason this needs a table at all: the answer key cannot live in the
-- browser. The prototype shipped \`src/data/interviewQuestions.js\` with every
-- \`answerIndex\` and rationale in it, so the exam was open-book to anyone who
-- opened devtools. Here the bank is server-side and a question is served
-- without its answer; the rationale rides back with the grade, because the
-- point of a practice interview is the feedback rather than the score.
--
-- THIS FILE IS GENERATED. Edit src/data/interviewQuestions.js and re-run
-- \`node scripts/generate-interview-seed.mjs\` rather than editing the seed by
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

-- ${rows.length} questions across ${Object.keys(INTERVIEW_BANKS).length} banks, generated from
-- src/data/interviewQuestions.js.
insert into public.interview_questions
  (id, bank_id, question, options, answer_index, rationale, sort_order) values
${rows.join(',\n')}
on conflict (id) do update set
  bank_id      = excluded.bank_id,
  question     = excluded.question,
  options      = excluded.options,
  answer_index = excluded.answer_index,
  rationale    = excluded.rationale,
  sort_order   = excluded.sort_order;
`;

const out = join(root, 'supabase/migrations/20261024140000_interviews.sql');
writeFileSync(out, sql, 'utf8');
console.log(`wrote ${out}`);
console.log(`${rows.length} questions across ${Object.keys(INTERVIEW_BANKS).length} banks`);
