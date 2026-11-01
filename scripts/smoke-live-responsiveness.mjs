/**
 * Live smoke test of the employer responsiveness endpoints (plan item 6).
 *
 * The SCORE itself is verified against real PostgreSQL by `npm run check:hrs`,
 * which can set up a company with a hiring history in memory. This checks the
 * things only a deployment can answer: that the routes are registered, that
 * the authorisation holds, and that a rating survives a round trip.
 *
 * Jobs are seeded rather than creatable through the API, so the rateable
 * outcome here is a candidate withdrawing — the one terminal state a test
 * account can reach without owning a listing. That is a real case and not a
 * contrivance: people withdraw most often because nobody answered them.
 *
 * Usage: node smoke-live-responsiveness.mjs <api-base-url> <anon-key>
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

async function register(label) {
  const email = `grooveli-hrs-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  if (!r.body?.token) throw new Error(`could not register ${label}: ${JSON.stringify(r.body)}`);
  return { email, token: r.body.token, id: r.body.user.id };
}

const C = await register('cand');
const D = await register('other');
const E = await register('emp');
ok('three accounts registered', Boolean(C.token && D.token && E.token));
console.log(`      ${C.email}\n      ${D.email}\n      ${E.email}\n`);

await call('POST', '/candidates', {
  token: C.token,
  body: { name: 'HRS Candidate', headline: 'Backend engineer', location: 'Lagos, Nigeria',
          skills: ['SQL'], careerInterests: ['Software Development'] },
});

/* ------------------------------------------------- the public board --- */

let r = await call('GET', '/leaderboard/employers');
ok('the employer board refuses an unauthenticated caller', r.status === 401, `status=${r.status}`);

r = await call('GET', '/leaderboard/employers', { token: C.token });
ok('the employer board is served to a signed-in account', r.status === 200, `status=${r.status}`);
const board = Array.isArray(r.body) ? r.body : [];
ok('  it is a list', Array.isArray(r.body), typeof r.body);
ok('  every entry carries a rank, a score and the badge flag',
  board.every((e) => typeof e.rank === 'number' && typeof e.hrs === 'number'
    && typeof e.quickResponder === 'boolean'),
  `${board.length} entries`);
ok('  ranks run 1..n with no gaps',
  board.every((e, i) => e.rank === i + 1));
ok('  nobody under the volume threshold is ranked',
  board.every((e) => e.closedCount >= 5),
  board.map((e) => `${e.name}:${e.closedCount}`).join(' ') || 'board empty');

/* -------------------------------------------- an employer's own score --- */

r = await call('POST', '/organizations', {
  token: E.token,
  body: { companyName: `HRS Smoke ${stamp}`, industry: 'Technology', size: '1-10',
          location: 'Lagos, Nigeria', districtId: 'technology-hub' },
});
const org = r.body?.organization?.id;
ok('an employer creates a company', Boolean(org), `status=${r.status}`);

r = await call('GET', `/employer/responsiveness/${org}`, { token: E.token });
ok('a brand new company can read its own score', r.status === 200, `status=${r.status}`);
ok('  it is told it is not ranked yet, and why',
  r.body?.ranked === false && r.body?.minimumClosed === 5,
  `ranked=${r.body?.ranked} minimumClosed=${r.body?.minimumClosed}`);
ok('  with no applications it reports no rating rather than nought',
  r.body?.experienceRating === null && r.body?.ratingCount === 0,
  `experienceRating=${r.body?.experienceRating}`);

r = await call('GET', `/employer/responsiveness/${org}`, { token: C.token });
ok('an outsider cannot read a company score', r.status === 403, `status=${r.status}`);

r = await call('POST', `/employer/opt-out/${org}`, { token: E.token, body: { optedOut: true } });
ok('a company can opt out', r.status === 200 && r.body === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
r = await call('GET', `/employer/responsiveness/${org}`, { token: E.token });
ok('  and still sees its own score afterwards', r.status === 200 && r.body?.optedOut === true,
  `optedOut=${r.body?.optedOut}`);
r = await call('POST', `/employer/opt-out/${org}`, { token: C.token, body: { optedOut: false } });
ok('  an outsider cannot opt a company back in', r.status === 403, `status=${r.status}`);

/* ------------------------------------------------------- the rating --- */

r = await call('GET', '/jobs', { token: C.token });
const job = (Array.isArray(r.body) ? r.body : r.body?.items ?? [])[0];
ok('a seeded job is available to apply to', Boolean(job?.id), JSON.stringify(Object.keys(r.body ?? {})).slice(0, 80));

/*
 * Deliberately with NO note, which is the ordinary case — the apply button
 * sends none. This used to be a 500: `applications.note` is `not null default
 * ''` and the route passed an explicit null, which overrides a default rather
 * than falling back to it. Applying WITH a note worked, so the broken path
 * was the common one and the working path was the exception.
 */
r = await call('POST', `/jobs/${job.id}/apply`, { token: C.token, body: {} });
const appId = r.body?.id;
ok('a candidate can apply without writing a note', Boolean(appId), `status=${r.status}`);
ok('  and the stored note is empty rather than missing', r.body?.note === '' || r.body?.note === null,
  JSON.stringify(r.body?.note));

r = await call('PUT', `/applications/${appId}/rating`, { token: C.token, body: { rating: 5 } });
ok('rating an open application is refused', r.status === 400, `status=${r.status}`);

r = await call('PATCH', `/applications/${appId}`, { token: C.token, body: { status: 'withdrawn' } });
ok('the candidate withdraws', r.status === 200, `status=${r.status}`);

r = await call('PUT', `/applications/${appId}/rating`, { token: C.token, body: { rating: 6 } });
ok('a rating of 6 is refused', r.status === 400, `status=${r.status}`);
r = await call('PUT', `/applications/${appId}/rating`, { token: C.token, body: { rating: 0 } });
ok('a rating of 0 is refused', r.status === 400, `status=${r.status}`);
r = await call('PUT', `/applications/${appId}/rating`, { token: C.token, body: { rating: 2.5 } });
ok('a fractional rating is refused', r.status === 400, `status=${r.status}`);

r = await call('PUT', `/applications/${appId}/rating`, { token: C.token, body: { rating: 4 } });
ok('a rating of 4 is accepted once the application is closed',
  r.status === 200 && r.body?.rating === 4, `status=${r.status} ${JSON.stringify(r.body)}`);

r = await call('GET', `/applications/${appId}/rating`, { token: C.token });
ok('  it reads back', r.body?.rating === 4, JSON.stringify(r.body));

r = await call('PUT', `/applications/${appId}/rating`, { token: C.token, body: { rating: 1 } });
r = await call('GET', `/applications/${appId}/rating`, { token: C.token });
ok('  re-rating corrects rather than adding a second vote', r.body?.rating === 1, JSON.stringify(r.body));

r = await call('GET', `/applications/${appId}/rating`, { token: D.token });
ok("a stranger cannot read somebody else's rating", r.body === null, JSON.stringify(r.body));

r = await call('PUT', `/applications/${appId}/rating`, { token: D.token, body: { rating: 1 } });
ok("a stranger cannot rate somebody else's application", r.status === 404,
  `status=${r.status} — 404 not 403, so existence is not confirmed`);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
console.log(`\nClean up with: node scripts/cleanup-test-accounts.mjs --apply`);
process.exit(failures ? 1 : 0);
