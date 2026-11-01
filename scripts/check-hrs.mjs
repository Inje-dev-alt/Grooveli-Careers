/**
 * Verify the Hiring Responsiveness Score against real PostgreSQL.
 *
 *   npm run check:hrs
 *
 * WHY THIS EXISTS AS A SCRIPT. HRS ranks named companies in public. The
 * weights and the normalisation curves are judgement calls that somebody will
 * reasonably want to tune later, and every one of them is the kind of change
 * that looks right in a diff and is wrong in production — a mean instead of a
 * median, an excluded null instead of a zero, a cap instead of a
 * renormalisation. None of that is visible without running it against data.
 *
 * PGlite is PostgreSQL compiled to WebAssembly, so this runs the migration
 * verbatim in-process with no Docker and no database to configure. The
 * prerequisite tables below are trimmed to the columns the view reads; they
 * are not a second schema to maintain, and if the real ones drift the
 * migration will fail to apply here, which is the signal.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(REPO, 'supabase/migrations');

/*
 * Every migration from the one that introduces the score onwards, in order.
 *
 * Not just the first file. The view has already been corrected once, and a
 * check that applied only the original would go on passing against a
 * definition nobody runs — which is worse than no check. Selecting by date
 * means the next correction is covered without anyone remembering to come
 * back here and add it.
 */
const FIRST = '20261102120000';
const MIGRATION_FILES = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql') && f.slice(0, 14) >= FIRST)
  .sort();

const db = await PGlite.create();
let f = 0;
const ok = (n, c, e = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e ? `  — ${e}` : ''}`); if (!c) f++; };
const near = (a, b, tol = 0.005) => Math.abs(Number(a) - Number(b)) <= tol;

/* ---- the prerequisite tables, matching the real columns the view reads ---- */
await db.exec(`
  create table public.profiles (id uuid primary key, display_name text not null default '');
  create table public.organizations (id text primary key, name text not null);
  create table public.jobs (
    id text primary key,
    organization_id text not null references public.organizations (id) on delete cascade
  );
  create table public.applications (
    id uuid primary key default gen_random_uuid(),
    job_id text not null references public.jobs (id) on delete cascade,
    candidate_id uuid not null references public.profiles (id) on delete cascade,
    status text not null default 'applied',
    applied_at timestamptz not null default now(),
    unique (job_id, candidate_id)
  );
  create table public.application_events (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.applications (id) on delete cascade,
    from_status text, to_status text not null,
    actor text not null check (actor in ('candidate','system','employer')),
    note text, at timestamptz not null default now()
  );
  create index application_events_app_idx on public.application_events (application_id, at);
`);

/* ---- the migration, verbatim ---- */
for (const file of MIGRATION_FILES) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    ok(`applies to real PostgreSQL: ${file}`, true);
  } catch (error) {
    ok(`applies to real PostgreSQL: ${file}`, false, error.message);
    console.log('\nCannot continue.');
    process.exit(1);
  }
}

/* ---- fixtures ---- */
const orgs = {
  fast: 'org-fast',        // answers in an hour, always explains, loved
  ghost: 'org-ghost',      // never answers
  mixed: 'org-mixed',      // five fast, one abandoned — median must hold
  unrated: 'org-unrated',  // perfect process, nobody has rated it
  slow: 'org-slow',        // answers at exactly the 7.5-day midpoint
  thin: 'org-thin',        // one closed application only
  hirer: 'org-hirer',      // makes offers and hires — must not be punished for it
  limbo: 'org-limbo',      // leaves people hanging without ever rejecting them
};
for (const [key, id] of Object.entries(orgs)) {
  await db.query('insert into public.organizations (id, name) values ($1, $2)', [id, key]);
  await db.query('insert into public.jobs (id, organization_id) values ($1, $2)', [`job-${key}`, id]);
}

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** One application, optionally answered after `replyHours`, optionally explained. */
async function apply(orgKey, { appliedDaysAgo, replyHours = null, status = 'applied', note = null }) {
  const candidate = uuid();
  const id = uuid();
  await db.query('insert into public.profiles (id) values ($1)', [candidate]);
  await db.query(
    `insert into public.applications (id, job_id, candidate_id, status, applied_at)
     values ($1, $2, $3, $4, now() - ($5 || ' days')::interval)`,
    [id, `job-${orgKey}`, candidate, status, String(appliedDaysAgo)],
  );
  if (replyHours !== null) {
    await db.query(
      `insert into public.application_events (application_id, to_status, actor, note, at)
       values ($1, $2, 'employer', $3, now() - ($4 || ' days')::interval + ($5 || ' hours')::interval)`,
      [id, status, note, String(appliedDaysAgo), String(replyHours)],
    );
  }
  return id;
}

/* fast: 6 applications, answered in 1h, all rejected with a reason */
const fastApps = [];
for (let i = 0; i < 6; i += 1) {
  fastApps.push(await apply('fast', { appliedDaysAgo: 40, replyHours: 1, status: 'rejected', note: 'Not a fit for this role, but strong on X.' }));
}
/* ghost: 6 applications, 40 days old, never answered, never closed */
for (let i = 0; i < 6; i += 1) await apply('ghost', { appliedDaysAgo: 40 });
/* mixed: 5 answered in 1h + 1 abandoned */
for (let i = 0; i < 5; i += 1) {
  await apply('mixed', { appliedDaysAgo: 40, replyHours: 1, status: 'rejected', note: 'Thanks for applying.' });
}
await apply('mixed', { appliedDaysAgo: 40 });
/* unrated: identical process to `fast`, but no ratings */
for (let i = 0; i < 6; i += 1) {
  await apply('unrated', { appliedDaysAgo: 40, replyHours: 1, status: 'rejected', note: 'Reason given.' });
}
/* slow: answered at 180h = 7.5 days, the exact midpoint of the 24h..336h ramp */
for (let i = 0; i < 6; i += 1) {
  await apply('slow', { appliedDaysAgo: 40, replyHours: 180, status: 'rejected', note: 'A reason.' });
}
/* thin: one closed application */
await apply('thin', { appliedDaysAgo: 40, replyHours: 1, status: 'hired', note: 'Welcome.' });

/*
 * hirer: six people taken all the way to an offer and hired.
 *
 * MODELLED ON WHAT THE API ACTUALLY WRITES, which is the point of this case.
 * `POST /applications/:id/respond` records the hire with actor='candidate' —
 * the candidate is the one accepting — and the employer's own last act is the
 * offer, whose note is optional and in practice null. An employer who hires
 * everybody must not score worse than one who rejects everybody.
 */
for (let i = 0; i < 6; i += 1) {
  const id = await apply('hirer', { appliedDaysAgo: 40, replyHours: 1, status: 'hired', note: null });
  await db.query(
    `insert into public.application_events (application_id, from_status, to_status, actor, note, at)
     values ($1, 'offer', 'hired', 'candidate', 'Offer accepted.', now() - interval '35 days')`,
    [id],
  );
}
/* limbo: answered fast, then left them hanging, never terminal, 40 days old */
for (let i = 0; i < 6; i += 1) {
  await apply('limbo', { appliedDaysAgo: 40, replyHours: 1, status: 'under-review', note: null });
}
/* a recent unanswered application at `fast` — too new to be evidence either way */
await apply('fast', { appliedDaysAgo: 2 });

/* ratings */
for (const id of fastApps) {
  await db.query(
    `insert into public.employer_ratings (application_id, organization_id, candidate_id, rating)
     select $1, 'org-fast', candidate_id, 5 from public.applications where id = $1`,
    [id],
  );
}

const rows = Object.fromEntries(
  (await db.query('select * from public.employer_responsiveness')).rows.map((r) => [r.organization_name, r]),
);

/* ---- assertions ---- */
console.log('');
ok('a fast, communicative, well-rated employer scores top',
  near(rows.fast.hrs, 1), `hrs=${Number(rows.fast.hrs).toFixed(3)}`);
ok('  its response speed is full marks under 24h', near(rows.fast.response_speed, 1));
ok('  and a 2-day-old unanswered application is not yet held against it',
  near(rows.fast.response_speed, 1), 'still within the fortnight, so no evidence either way');

ok('an employer that never answers scores zero on speed',
  near(rows.ghost.response_speed, 0), `speed=${Number(rows.ghost.response_speed).toFixed(3)}`);
ok('  silent applications are counted, not excluded',
  Number(rows.ghost.closed_count) === 6,
  'excluding them would let ghosting improve a score');
ok('  and its HRS is zero', near(rows.ghost.hrs, 0), `hrs=${Number(rows.ghost.hrs).toFixed(3)}`);

ok('one abandoned application does not sink a good team',
  near(rows.mixed.response_speed, 1),
  `median=${Number(rows.mixed.response_speed).toFixed(3)} (a mean would give 0.833)`);

ok('an unrated employer is renormalised, not capped at 70%',
  near(rows.unrated.hrs, 1), `hrs=${Number(rows.unrated.hrs).toFixed(3)}`);
ok('  and reports no rating rather than a rating of nought',
  rows.unrated.experience_rating === null && Number(rows.unrated.rating_count) === 0);

ok('the speed ramp is linear between 24h and 14 days',
  near(rows.slow.response_speed, 0.5),
  `180h should be the midpoint; got ${Number(rows.slow.response_speed).toFixed(3)}`);

ok('ghosting after a quick first reply still costs the feedback half',
  near(rows.limbo.response_speed, 1) && near(rows.limbo.feedback_rate, 0),
  `speed=${Number(rows.limbo.response_speed).toFixed(2)} feedback=${Number(rows.limbo.feedback_rate).toFixed(2)}`);
ok('  non-terminal applications over 30 days count as unanswered',
  Number(rows.limbo.closed_count) === 6);

ok('a thin record is scored but falls under the ranking threshold',
  Number(rows.thin.closed_count) === 1 && Number(rows.thin.hrs) > 0,
  `closed=${rows.thin.closed_count} — the route requires 5`);

ok('an employer that hires people is not punished for it',
  near(rows.hirer.feedback_rate, 1),
  `feedback=${Number(rows.hirer.feedback_rate).toFixed(2)} — a hire is recorded by the candidate accepting, not by an employer note`);
ok('  so hiring scores as well as rejecting well',
  near(rows.hirer.hrs, rows.unrated.hrs),
  `hirer=${Number(rows.hirer.hrs).toFixed(3)} vs rejecter=${Number(rows.unrated.hrs).toFixed(3)}`);

/* opt-out and ratings behave */
await db.query("insert into public.organization_opt_out (organization_id) values ('org-fast')");
const outs = await db.query('select organization_id from public.organization_opt_out');
ok('a company can opt out', outs.rows.length === 1);

const first = fastApps[0];
await db.query(
  `insert into public.employer_ratings (application_id, organization_id, candidate_id, rating)
   select $1, 'org-fast', candidate_id, 2 from public.applications where id = $1
   on conflict (application_id) do update set rating = excluded.rating`,
  [first],
);
const counted = await db.query(
  "select count(*)::int as n from public.employer_ratings where organization_id = 'org-fast'");
ok('re-rating corrects rather than stuffing the ballot',
  counted.rows[0].n === 6, `${counted.rows[0].n} rows for 6 applications`);

let rejected = false;
try {
  await db.query(
    `insert into public.employer_ratings (application_id, organization_id, candidate_id, rating)
     select $1, 'org-fast', candidate_id, 9 from public.applications where id = $1`, [fastApps[1]]);
} catch { rejected = true; }
ok('a rating outside 1..5 is refused by the database', rejected);

ok('both new tables have RLS enabled, like every other table',
  (await db.query(`select count(*)::int as n from pg_tables
     where schemaname='public' and rowsecurity
       and tablename in ('employer_ratings','organization_opt_out')`)).rows[0].n === 2);

console.log('\n' + (f === 0 ? 'ALL PASS' : `${f} FAILURE(S)`));
process.exit(f ? 1 : 0);
