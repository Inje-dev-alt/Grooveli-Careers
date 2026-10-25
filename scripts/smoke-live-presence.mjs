/**
 * Live smoke test of presence (batch 4.1).
 *
 * FOUR accounts, because every rule worth testing here is about what someone
 * ELSE sees. One account can prove a heartbeat was stored and nothing more;
 * the whole feature is the visibility predicate, and a predicate with three
 * settings needs one account per setting plus somebody to look at them.
 *
 *   A  the viewer
 *   B  presence_visibility = 'everyone'     — named to A
 *   C  presence_visibility = 'connections'  — counted by A, not named, until
 *                                             they connect
 *   D  presence_visibility = 'nobody'       — never named and never counted,
 *                                             which is the one that would leak
 *                                             silently if it broke
 *
 * Usage: node smoke-live-presence.mjs <api-base-url> <anon-key> [slow]
 *
 * `slow` adds the staleness check, which has to wait out the 45-second online
 * window in real time. It is off by default so the suite stays runnable, and
 * it is the one assertion that proves going offline needs no client
 * cooperation — so it is worth running before a release.
 */
const [API, KEY, MODE] = process.argv.slice(2);
if (!API || !KEY) {
  console.error('need <api-base-url> <anon-key> [slow]');
  process.exit(2);
}
const SLOW = MODE === 'slow';

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

async function register(label, headline) {
  const email = `grooveli-prs-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  const token = r.body?.token;
  // Registration alone makes no candidate_profiles row, so without this the
  // roster would have no headline to serve — which is a branch of its own,
  // tested separately with E below.
  if (headline) {
    await call('POST', '/candidates', {
      token,
      body: { name: `Presence ${label.toUpperCase()}`, headline,
              location: 'Lagos, Nigeria', careerPathId: 'path-hr',
              skills: ['SQL'], careerInterests: ['Human Resources'] },
    });
  }
  return { email, token, id: r.body?.user?.id };
}

const A = await register('a', 'Viewer of rooms');
const B = await register('b', 'Visible to everyone');
const C = await register('c', 'Visible to connections');
const D = await register('d', 'Invisible by choice');
// No candidate profile: an employer is a person standing in a room with no
// career to show, and must still appear rather than being dropped.
const E = await register('e', null);
ok('five accounts registered', [A, B, C, D, E].every((x) => x.token));

/* ------------------------------------------------------- the default --- */

let r = await call('GET', '/users/me/presence', { token: A.token });
ok('visibility defaults to connections', r.body?.visibility === 'connections',
  JSON.stringify(r.body));

r = await call('PATCH', '/users/me/presence', { token: B.token, body: { visibility: 'everyone' } });
ok('B opens up to everyone', r.status === 200 && r.body?.visibility === 'everyone',
  `status=${r.status}`);

r = await call('PATCH', '/users/me/presence', { token: E.token, body: { visibility: 'everyone' } });
ok('E opens up to everyone', r.body?.visibility === 'everyone');

r = await call('PATCH', '/users/me/presence', { token: D.token, body: { visibility: 'nobody' } });
ok('D goes invisible', r.body?.visibility === 'nobody');

r = await call('PATCH', '/users/me/presence', { token: A.token, body: { visibility: 'sometimes' } });
ok('a setting that is not a setting is refused', r.status === 400, `status=${r.status}`);

r = await call('GET', '/users/me/presence', { token: D.token });
ok('  and left the previous setting alone', r.body?.visibility === 'nobody');

/* --------------------------------------------------- the heartbeat --- */

r = await call('POST', '/presence/heartbeat', { body: { scene: 'city' } });
ok('a heartbeat without a session is refused', r.status === 401, `status=${r.status}`);

r = await call('POST', '/presence/heartbeat', { token: A.token, body: {} });
ok('a heartbeat with no room is refused', r.status === 400, `status=${r.status}`);

const ROOM = { scene: 'office', locationId: 'org-keystone' };
const beat = (who, position = ROOM) =>
  call('POST', '/presence/heartbeat', { token: who.token, body: position });

r = await beat(A);
ok('A beats', r.status === 200, `status=${r.status}`);
ok('  and is told how often to beat', r.body?.heartbeatSeconds > 0,
  `${r.body?.heartbeatSeconds}s`);
ok('  the city count includes A themselves', r.body?.cityOnline >= 1,
  `cityOnline=${r.body?.cityOnline}`);
ok('  an empty room has no occupants', r.body?.hereCount === 0 && (r.body?.here ?? []).length === 0,
  `hereCount=${r.body?.hereCount}`);
ok('  and its own setting comes back with it', r.body?.visibility === 'connections');

/* ------------------------------------------- named, counted, neither --- */

await beat(B);
await beat(C);
await beat(D);
await beat(E);

r = await beat(A);
const here = r.body?.here ?? [];
const names = here.map((p) => p.id);

ok('the room counts B, C and E but not D',
  r.body?.hereCount === 3, `hereCount=${r.body?.hereCount} (expected 3)`);
ok('  B is named, being visible to everyone', names.includes(B.id));
ok('  E is named too, with no candidate profile to name them by',
  names.includes(E.id));
ok('  E falls back to a generic headline rather than an empty one',
  Boolean(here.find((p) => p.id === E.id)?.headline),
  JSON.stringify(here.find((p) => p.id === E.id)?.headline));
ok('  C is counted but NOT named, being connections-only',
  !names.includes(C.id));
ok('  D is neither named nor counted',
  !names.includes(D.id) && r.body?.hereCount === 3);
ok('  and A is never in their own roster', !names.includes(A.id));

ok('a roster card carries what the panel renders',
  here.every((p) => p.id && p.name && p.headline && typeof p.careerLevel === 'number'),
  JSON.stringify(here[0]));

ok('the city count excludes the invisible account',
  r.body?.cityOnline === 4, `cityOnline=${r.body?.cityOnline} (A + B + C + E)`);

/* ------------------------------ a connection changes what A can see --- */

r = await call('POST', '/social/connections', { token: A.token, body: { userId: C.id } });
const connectionId = r.body?.id;
ok('A asks to connect with C', Boolean(connectionId), `status=${r.status}`);

r = await call('POST', `/social/connections/${connectionId}/respond`, {
  token: C.token, body: { decision: 'accept' },
});
ok('  C accepts', r.status === 200, `status=${r.status}`);

r = await beat(A);
ok('C is now named to A, being a connection',
  (r.body?.here ?? []).some((p) => p.id === C.id), JSON.stringify((r.body?.here ?? []).map((p) => p.id)));
ok('  and the count did not change — C was always counted',
  r.body?.hereCount === 3, `hereCount=${r.body?.hereCount}`);
ok('  C also appears in connectionsOnline',
  (r.body?.connectionsOnline ?? []).some((p) => p.id === C.id),
  JSON.stringify((r.body?.connectionsOnline ?? []).map((p) => p.id)));
ok('  which lists nobody else',
  (r.body?.connectionsOnline ?? []).length === 1);

/* ------------------------------------------------- a block overrides --- */

r = await call('POST', '/social/blocks', { token: A.token, body: { authorId: B.id } });
ok('A blocks B', r.status === 200 || r.status === 201, `status=${r.status}`);

r = await beat(A);
ok('a blocked account disappears from the roster',
  !(r.body?.here ?? []).some((p) => p.id === B.id),
  JSON.stringify((r.body?.here ?? []).map((p) => p.id)));
ok('  and from the count, not just the list',
  r.body?.hereCount === 2, `hereCount=${r.body?.hereCount} (expected 2)`);

r = await beat(B);
ok('the block cuts both ways: B cannot see A either',
  !(r.body?.here ?? []).some((p) => p.id === A.id),
  JSON.stringify((r.body?.here ?? []).map((p) => p.id)));

/* ---------------------------------------------------- private rooms --- */

const FLAT = { scene: 'apartment', locationId: null };
await beat(C, FLAT);
r = await beat(A, FLAT);
ok('an apartment has no occupants, even with two people in one',
  r.body?.hereCount === 0 && (r.body?.here ?? []).length === 0,
  `hereCount=${r.body?.hereCount}`);
ok('  but the city still counts them',
  r.body?.cityOnline >= 2, `cityOnline=${r.body?.cityOnline}`);

/* -------------------------------------------------- moving between --- */

const OTHER_ROOM = { scene: 'office', locationId: 'org-northwind' };
await beat(A, OTHER_ROOM);
r = await beat(A, OTHER_ROOM);
ok('moving rooms leaves the last room behind',
  r.body?.hereCount === 0, `hereCount=${r.body?.hereCount}`);

r = await beat(A, ROOM);
ok('  and coming back finds who is still there',
  r.body?.hereCount === 2, `hereCount=${r.body?.hereCount}`);

/* -------------------------------------------- occupancy from outside --- */

r = await call('GET', '/presence/room?scene=office&locationId=org-keystone', { token: B.token });
ok('a room you are not in reports a count', typeof r.body?.count === 'number',
  JSON.stringify(r.body));
ok('  and nothing else — no names leave the room',
  Object.keys(r.body ?? {}).length === 1, JSON.stringify(Object.keys(r.body ?? {})));

r = await call('GET', '/presence/room?scene=office', { token: B.token });
ok('counting a room that was not named is refused', r.status === 400, `status=${r.status}`);

r = await call('GET', '/presence/room?scene=office&locationId=org-keystone', { token: D.token });
ok("an invisible account still sees everyone else", (r.body?.count ?? 0) >= 2,
  `count=${r.body?.count}`);

/* ------------------------------------------------------- staleness --- */

if (SLOW) {
  console.log('\n(waiting out the 45-second online window…)');
  await new Promise((resolve) => setTimeout(resolve, 50_000));
  r = await beat(A, ROOM);
  ok('accounts that stopped beating are gone, with nothing sent on their behalf',
    r.body?.hereCount === 0, `hereCount=${r.body?.hereCount}`);
  ok('  and the city empties out to just the one still beating',
    r.body?.cityOnline === 1, `cityOnline=${r.body?.cityOnline}`);
} else {
  console.log('\nSKIP  staleness (run with `slow` to wait out the 45s window)');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
