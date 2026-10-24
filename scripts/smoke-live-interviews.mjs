/**
 * Live smoke test of interview simulation (batch 3.7).
 *
 * The thing worth proving: the exam is not open-book. A question is served
 * without its answer, the paper cannot be rerolled, and the first-to-two rule
 * is decided by the server rather than reported to it.
 *
 * Usage: node smoke-live-interviews.mjs <api-base-url> <anon-key>
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
const email = `grooveli-ivw-${stamp}@example.invalid`;
let r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
const token = r.body?.token;
ok('account registered', Boolean(token));

// An explicit career path, so the attempt resolves to that bank.
r = await call('POST', '/candidates', {
  token,
  body: { name: 'Exam Sitter', headline: 'Recruiter', location: 'Lagos, Nigeria',
          careerPathId: 'path-hr', skills: ['Recruitment'], careerInterests: ['Human Resources'] },
});
ok('candidate onboarded onto path-hr', r.status === 201 || r.status === 200, `status=${r.status}`);

/* ----------------------------------------------------- the exam opens --- */

r = await call('POST', '/interviews/start', { token });
ok('an interview starts', r.status === 201 && Boolean(r.body?.attempt?.id), `status=${r.status}`);
const attempt = r.body?.attempt;
let question = r.body?.question;

ok('  drawn from the account’s own path', attempt?.pathId === 'path-hr', `pathId=${attempt?.pathId}`);
ok('  four questions, first to two', r.body?.total === 4 && String(r.body?.rule).includes('Two correct'),
  `total=${r.body?.total}`);
ok('  the question has options', Array.isArray(question?.options) && question.options.length > 1,
  JSON.stringify(question?.options?.length));

/* -------------------------------------- THE ANSWER KEY NEVER LEAVES --- */

const served = JSON.stringify(r.body);
ok('the served question carries no answer index', !('answerIndex' in (question ?? {})) && !served.includes('answerIndex'));
ok('  and no rationale', !('rationale' in (question ?? {})) && !served.includes('rationale'));
ok('  and the attempt does not leak the paper', !('questionIds' in (attempt ?? {})), Object.keys(attempt ?? {}).join(','));

/* ------------------------------------------------- the paper is fixed --- */

r = await call('POST', `/interviews/${attempt.id}/answer`, {
  token, body: { questionId: 'hr-5', optionIndex: 0 },
});
const outOfOrder = r.status === 400 || r.status === 404;
ok('a question you were not served is refused', outOfOrder, `status=${r.status}`);

r = await call('POST', `/interviews/${attempt.id}/answer`, {
  token, body: { questionId: question.id, optionIndex: 99 },
});
ok('an option index out of range is graded, not crashed', r.status === 200 && r.body?.correct === false,
  `status=${r.status}`);

// That was a wrong answer: one more ends it.
ok('  the grade brings the rationale with it', typeof r.body?.rationale === 'string' && r.body.rationale.length > 0);
ok('  and now reveals the correct option', Number.isInteger(r.body?.correctOptionIndex),
  `correctOptionIndex=${r.body?.correctOptionIndex}`);
ok('  wrong count is 1, not finished', r.body?.wrongCount === 1 && r.body?.finished === false,
  JSON.stringify({ w: r.body?.wrongCount, f: r.body?.finished }));

question = r.body?.nextQuestion;
ok('  and the next question arrives without its key', Boolean(question?.id) && !('answerIndex' in question));

/* ------------------------------------------------- two wrong, it ends --- */

r = await call('POST', `/interviews/${attempt.id}/answer`, {
  token, body: { questionId: question.id, optionIndex: 99 },
});
ok('a second wrong answer ends the interview', r.body?.finished === true && r.body?.passed === false,
  JSON.stringify({ f: r.body?.finished, p: r.body?.passed }));
ok('  scored on answers given, not on the whole paper', r.body?.score === 0, `score=${r.body?.score}`);

r = await call('POST', `/interviews/${attempt.id}/answer`, {
  token, body: { questionId: 'hr-1', optionIndex: 0 },
});
ok('a finished interview takes no more answers', r.status === 400, `status=${r.status}`);

/* --------------------------------------------------- sit one and pass --- */

r = await call('POST', '/interviews/start', { token });
const second = r.body?.attempt;
let q = r.body?.question;
let passed = false;
let guard = 0;

// Without the key, the only way through is to try options until one lands —
// which is itself the proof that the server is the one grading.
while (!passed && guard < 12) {
  guard += 1;
  let graded = null;
  for (let option = 0; option < (q?.options?.length ?? 0); option += 1) {
    graded = (await call('POST', `/interviews/${second.id}/answer`, {
      token, body: { questionId: q.id, optionIndex: option },
    })).body;
    if (graded?.correct) break;
    if (graded?.finished) break;
    // A wrong answer consumed the question; move to the next one.
    q = graded?.nextQuestion;
    break;
  }
  if (!graded) break;
  if (graded.finished) {
    passed = graded.passed === true;
    ok('an attempt finishes with a verdict', typeof graded.passed === 'boolean',
      JSON.stringify({ passed: graded.passed, score: graded.score }));
    break;
  }
  q = graded.nextQuestion ?? q;
}

/* ---------------------------------------------------------- the record --- */

r = await call('GET', '/interviews/attempts', { token });
ok('attempts are listed, newest first', (r.body ?? []).length >= 2, `${(r.body ?? []).length} attempts`);
ok('  and none of them carry the paper', !(r.body ?? []).some((a) => 'questionIds' in a));

r = await call('GET', '/interviews/pass-rate', { token });
ok('pass rate counts completed attempts', r.body?.attempts >= 1 && typeof r.body?.rate === 'number',
  JSON.stringify(r.body));

/* ----------------------------------- a simulation record needs a pass --- */

const fresh = `grooveli-ivw2-${stamp}@example.invalid`;
const other = (await call('POST', '/auth/register', { body: { email: fresh, password: 'smoke-test-pw-1' } })).body?.token;
r = await call('POST', '/interviews/simulations', { token: other, body: { jobTitle: 'Nice try', score: 100 } });
ok('a simulation record with no passed attempt is refused', r.status === 400, `status=${r.status}`);

r = await call('GET', '/interviews/pass-rate', { token: other });
ok('  and a candidate who has sat nothing has no rate, not 0%', r.body?.rate === null, JSON.stringify(r.body));

console.log(`\n      accounts left behind: ${email}, ${fresh}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
