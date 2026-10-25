/**
 * Live smoke test of the connection flow, end to end across three surfaces.
 *
 * WHY THIS EXISTS SEPARATELY. `smoke-live-social.mjs` already proves the
 * respond endpoint: the addressee can accept, the requester cannot accept for
 * them, the count moves. What nothing covered is the part the interface
 * depends on, and the part that only broke once presence and chat landed:
 *
 *   1. the `incoming` flag on GET /social/connections — the requests panel
 *      filters on it, so if it were wrong the panel would show the requests
 *      you SENT and offer to accept them on the other person's behalf.
 *   2. the notice raised on request, and where it points. It is routed by the
 *      recipient's active role, because `/network` is candidate-only and an
 *      employer following a notice there is bounced straight back out.
 *   3. that accepting actually lifts the chat invite gate and promotes a
 *      person from counted to named in presence. Three features meeting at
 *      one row, none of which were written together.
 *
 * Usage: node smoke-live-connection-flow.mjs <api-base-url> <anon-key>
 *
 * Leaves accounts behind; clear them with scripts/cleanup-test-accounts.mjs.
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

async function register(label, { candidate = true } = {}) {
  const email = `grooveli-cfl-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  const token = r.body?.token;
  if (candidate) {
    await call('POST', '/candidates', {
      token,
      body: { name: `Flow ${label.toUpperCase()}`, headline: `${label} headline`,
              location: 'Lagos, Nigeria', careerPathId: 'path-hr',
              skills: ['SQL'], careerInterests: ['Human Resources'] },
    });
  }
  return { email, token, id: r.body?.user?.id };
}

const A = await register('a');
const B = await register('b');
// An employer, to prove the notice does not send them somewhere they cannot go.
const E = await register('e', { candidate: false });
await call('POST', '/users/me/roles', { token: E.token, body: { role: 'employer' } });
await call('POST', '/organizations', {
  token: E.token,
  body: { companyName: `Flowworks ${stamp}`, industry: 'Technology', size: '11-50',
          location: 'Lagos, Nigeria', districtId: 'technology-hub' },
});
ok('two candidates and an employer registered', [A, B, E].every((x) => x.token && x.id));

/* ------------------------------------------------- asking to connect --- */

let r = await call('POST', '/social/connections', { token: A.token, body: { userId: B.id } });
const conId = r.body?.id;
ok('A asks B to connect', r.status === 201 && Boolean(conId), `status=${r.status}`);
ok('  and it starts pending', r.body?.status === 'pending', r.body?.status);

/* ---- the `incoming` flag, which the requests panel filters on ---- */

r = await call('GET', '/social/connections', { token: B.token });
let rows = r.body ?? [];
ok("B's list has the request", rows.length === 1, `${rows.length} rows`);
ok('  flagged INCOMING, so the panel offers B the buttons',
  rows[0]?.incoming === true, `incoming=${rows[0]?.incoming}`);
ok('  naming A, not B', rows[0]?.name?.includes('A'), rows[0]?.name);

r = await call('GET', '/social/connections', { token: A.token });
rows = r.body ?? [];
ok("A's list has the same row", rows.length === 1);
ok('  flagged NOT incoming, so A is never offered to accept their own request',
  rows[0]?.incoming === false, `incoming=${rows[0]?.incoming}`);

/* ---- the notice, and where it sends them ---- */

r = await call('GET', '/notifications', { token: B.token });
let notices = (r.body ?? []).filter((n) => String(n.title ?? '').includes('wants to connect'));
ok('B was told somebody wants to connect', notices.length === 1,
  `${notices.length} notices`);
ok('  pointing a candidate at /network', notices[0]?.route === '/network',
  notices[0]?.route);

r = await call('POST', '/social/connections', { token: A.token, body: { userId: E.id } });
const empConId = r.body?.id;
ok('A asks the employer to connect', Boolean(empConId));

r = await call('GET', '/notifications', { token: E.token });
notices = (r.body ?? []).filter((n) => String(n.title ?? '').includes('wants to connect'));
ok('the employer was told too', notices.length === 1, `${notices.length} notices`);
ok('  and sent to /employer, NOT to the candidate-only /network',
  notices[0]?.route === '/employer', notices[0]?.route);

r = await call('GET', '/social/connections', { token: E.token });
ok('  with the request on a list they can read',
  (r.body ?? [])[0]?.incoming === true, JSON.stringify((r.body ?? [])[0]?.incoming));

/* ---- before accepting: counted, gated ---- */

const ROOM = { scene: 'office', locationId: 'org-keystone' };
await call('POST', '/presence/heartbeat', { token: B.token, body: ROOM });
r = await call('POST', '/presence/heartbeat', { token: A.token, body: ROOM });
ok('B is counted in the room before accepting', r.body?.hereCount === 1,
  `hereCount=${r.body?.hereCount}`);
ok('  but NOT named, at the default visibility', (r.body?.here ?? []).length === 0,
  JSON.stringify((r.body?.here ?? []).map((p) => p.name)));
ok('  and absent from connectionsOnline', (r.body?.connectionsOnline ?? []).length === 0);

r = await call('POST', '/conversations', { token: A.token, body: { userId: B.id } });
const thread = r.body?.id;
await call('POST', `/conversations/${thread}/messages`, { token: A.token, body: { body: 'Hello B.' } });
r = await call('POST', `/conversations/${thread}/messages`, { token: A.token, body: { body: 'Again.' } });
ok('the invite gate holds before accepting', r.status === 403, `status=${r.status}`);

/* ---- accepting ---- */

r = await call('POST', `/social/connections/${conId}/respond`, {
  token: B.token, body: { decision: 'accept' },
});
ok('B accepts', r.status === 200 && r.body?.status === 'accepted', `status=${r.status}`);

r = await call('GET', '/notifications', { token: A.token });
ok('  and A is told', (r.body ?? []).some((n) => String(n.title ?? '').includes('accepted')));

/* ---- after accepting: named, ungated ---- */

r = await call('POST', `/conversations/${thread}/messages`, { token: A.token, body: { body: 'Again.' } });
ok('accepting lifts the chat invite gate', r.status === 201, `status=${r.status}`);

await call('POST', '/presence/heartbeat', { token: B.token, body: ROOM });
r = await call('POST', '/presence/heartbeat', { token: A.token, body: ROOM });
ok('accepting promotes B from counted to NAMED',
  (r.body?.here ?? []).some((p) => p.id === B.id),
  JSON.stringify((r.body?.here ?? []).map((p) => p.name)));
ok('  without changing the count', r.body?.hereCount === 1, `hereCount=${r.body?.hereCount}`);
ok('  and B now shows in connectionsOnline',
  (r.body?.connectionsOnline ?? []).some((p) => p.id === B.id));

/* ---- declining ---- */

r = await call('POST', `/social/connections/${empConId}/respond`, {
  token: E.token, body: { decision: 'decline' },
});
ok('the employer can decline', r.status === 200 && r.body?.status === 'declined',
  `status=${r.status}`);

r = await call('GET', '/social/connections', { token: A.token });
rows = r.body ?? [];
ok('  and a declined row stops being pending',
  !rows.some((c) => c.userId === E.id && c.status === 'pending'),
  JSON.stringify(rows.map((c) => c.status)));

r = await call('GET', '/social/connections/count', { token: A.token });
ok('A counts exactly one accepted connection', r.body?.count === 1, `count=${r.body?.count}`);

console.log(`\n      accounts left behind: ${[A, B, E].map((x) => x.email).join(', ')}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
