/**
 * Live smoke test of learning and the leaderboard (batch 3.8).
 *
 * Two accounts, because the leaderboard's one real rule is about what OTHER
 * people see: an opted-out account must be absent from everybody's board, not
 * just its own.
 *
 * Usage: node smoke-live-learning-leaderboard.mjs <api-base-url> <anon-key>
 */
const [API, KEY] = process.argv.slice(2);
if (!API || !KEY) {
  console.error('need <api-base-url> <anon-key>');
  process.exit(2);
}

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`);
  if (!cond) failures += 1;
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : null),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, body: payload };
}

const stamp = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36)}`;
async function register(label, pathId) {
  const email = `grooveli-lrn-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  const token = r.body?.token;
  await call('POST', '/candidates', {
    token,
    body: { name: `Learner ${label.toUpperCase()}`, headline: `${label} headline`,
            location: 'Lagos, Nigeria', careerPathId: pathId,
            skills: ['SQL'], careerInterests: ['Human Resources'] },
  });
  return { email, token, id: r.body?.user?.id };
}

const A = await register('a', 'path-hr');
const B = await register('b', 'path-software');
ok('two candidates registered', Boolean(A.token && B.token));

/* ---------------------------------------------------------- learning --- */

let r = await call('GET', '/learning/courses', { token: A.token });
const courses = r.body ?? [];
ok('the catalogue is served', courses.length === 4, `${courses.length} courses`);
ok('  with enrolment state attached',
  courses.every((c) => 'enrolled' in c && 'completed' in c) && courses.every((c) => !c.enrolled));

ok("  A's own path sorts first", (courses[0]?.pathIds ?? []).includes('path-hr'),
  `${courses[0]?.id} -> ${JSON.stringify(courses[0]?.pathIds)}`);

r = await call('GET', '/learning/courses', { token: B.token });
ok("  and B's does for B", ((r.body ?? [])[0]?.pathIds ?? []).includes('path-software'),
  `${(r.body ?? [])[0]?.id}`);

r = await call('GET', '/learning/courses?skill=Data%20Analysis', { token: A.token });
ok('the skill filter works', (r.body ?? []).length === 2 && (r.body ?? []).every((c) => c.skill === 'Data Analysis'),
  `${(r.body ?? []).length} matched`);

r = await call('POST', '/learning/courses/crs-automation/enrol', { token: A.token });
ok('A enrols', r.status === 201 && r.body?.status === 'enrolled', `status=${r.status}`);
const enrolId = r.body?.id;

r = await call('POST', '/learning/courses/crs-automation/enrol', { token: A.token });
ok('  enrolling twice returns the same row', r.body?.id === enrolId);

r = await call('POST', '/learning/courses/not-a-course/enrol', { token: A.token });
ok('an unknown course is refused', r.status === 404, `status=${r.status}`);

r = await call('GET', '/learning/courses', { token: A.token });
ok('  the catalogue now shows it enrolled',
  (r.body ?? []).find((c) => c.id === 'crs-automation')?.enrolled === true);

/* ------------------------------------- a course completes exactly once --- */

const statsBefore = (await call('GET', '/career/stats', { token: A.token })).body;

r = await call('POST', '/learning/courses/crs-automation/complete', { token: A.token });
ok('A completes the course', r.status === 200 && r.body?.alreadyCompleted === false, `status=${r.status}`);

const statsAfterComplete = (await call('GET', '/career/stats', { token: A.token })).body;
ok('  completing does NOT itself bump certifications',
  statsAfterComplete?.certifications === statsBefore?.certifications,
  `${statsBefore?.certifications} -> ${statsAfterComplete?.certifications}`);

// The career event is what counts it — exactly as the client does.
r = await call('POST', '/career/events', {
  token: A.token, body: { event: 'course.completed', context: { courseId: 'crs-automation' } },
});
ok('  the career event pays the 200 XP', r.body?.xpAwarded === 200, `xp=${r.body?.xpAwarded}`);
ok('  and certifies once', r.body?.stats?.certifications === (statsBefore?.certifications ?? 0) + 1,
  `certifications=${r.body?.stats?.certifications}`);

r = await call('POST', '/learning/courses/crs-automation/complete', { token: A.token });
ok('completing twice reports alreadyCompleted', r.body?.alreadyCompleted === true, JSON.stringify(r.body));

r = await call('POST', '/career/events', {
  token: A.token, body: { event: 'course.completed', context: { courseId: 'crs-automation' } },
});
ok('  and the event refuses to pay again', r.body?.xpAwarded === 0 && r.body?.status === 'replayed',
  `status=${r.body?.status}`);

r = await call('POST', '/learning/courses/crs-data-essentials/complete', { token: A.token });
ok('a course never enrolled in completes anyway', r.body?.alreadyCompleted === false, JSON.stringify(r.body));

r = await call('GET', '/learning/enrollments', { token: A.token });
ok('enrolments list both', (r.body ?? []).length === 2, `${(r.body ?? []).length} rows`);
ok('  both completed', (r.body ?? []).every((e) => e.status === 'completed'));

/* ------------------------------------------------------- leaderboard --- */

// Give B some reputation so the ordering means something. A has 5 from the
// course; a skill challenge is worth 3.
await call('POST', '/career/events', {
  token: B.token, body: { event: 'skill.challenge', context: { skill: 'Excel' } },
});

r = await call('GET', '/leaderboard', { token: A.token });
let board = r.body ?? [];
ok('the board ranks both candidates', board.some((e) => e.id === A.id) && board.some((e) => e.id === B.id),
  `${board.length} ranked`);
ok('  ranked by reputation, descending',
  board.every((e, i) => i === 0 || board[i - 1].reputation >= e.reputation));
ok('  ranks run 1..n with no gaps', board.every((e, i) => e.rank === i + 1));
ok('  and A sees itself flagged', board.find((e) => e.id === A.id)?.isMe === true);
ok('  while B is not flagged for A', board.find((e) => e.id === B.id)?.isMe === false);

const aEntry = board.find((e) => e.id === A.id);
ok('  entries carry name, headline and level',
  Boolean(aEntry?.name) && Boolean(aEntry?.headline) && typeof aEntry?.careerLevel === 'number',
  JSON.stringify(aEntry));

/* ------------------------------ opting out hides you from EVERYONE --- */

r = await call('GET', '/leaderboard/opt-out', { token: A.token });
ok('A is on the board by default', r.body === false, JSON.stringify(r.body));

r = await call('POST', '/leaderboard/opt-out', { token: A.token, body: { optedOut: true } });
ok('A opts out', r.body === true, JSON.stringify(r.body));

r = await call('GET', '/leaderboard', { token: A.token });
ok('  A is gone from their own board', !(r.body ?? []).some((e) => e.id === A.id));

r = await call('GET', '/leaderboard', { token: B.token });
board = r.body ?? [];
ok('  AND gone from B’s board — the rule that only works server-side',
  !board.some((e) => e.id === A.id), `${board.length} ranked, ids: ${board.map((e) => e.id === B.id ? 'B' : 'other').join(',')}`);
ok('  with no gap left in the ranks', board.every((e, i) => e.rank === i + 1));

r = await call('POST', '/leaderboard/opt-out', { token: A.token, body: { optedOut: false } });
ok('A opts back in', r.body === false);
r = await call('GET', '/leaderboard', { token: B.token });
ok('  and reappears for B', (r.body ?? []).some((e) => e.id === A.id));

console.log(`\n      accounts left behind: ${A.email}, ${B.email}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
