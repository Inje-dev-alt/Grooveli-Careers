/**
 * Live smoke test of conversations (batch 4.2).
 *
 * THREE accounts, because every rule in chat is a rule about the other person.
 * The mock mirrors all of them and proves none of them: it is being asked
 * whether it agrees with itself. Only this suite has a second account to
 * refuse on behalf of.
 *
 *   A  opens threads and sends
 *   B  a stranger, who eventually replies — the one-message invite
 *   C  a stranger who never replies, and then blocks
 *
 * Usage: node smoke-live-conversations.mjs <api-base-url> <anon-key>
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
  const email = `grooveli-cnv-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  const token = r.body?.token;
  await call('POST', '/candidates', {
    token,
    body: { name: `Chat ${label.toUpperCase()}`, headline: `${label} headline`,
            location: 'Lagos, Nigeria', careerPathId: 'path-hr',
            skills: ['SQL'], careerInterests: ['Human Resources'] },
  });
  return { email, token, id: r.body?.user?.id };
}

const A = await register('a');
const B = await register('b');
const C = await register('c');
ok('three candidates registered', [A, B, C].every((x) => x.token && x.id));

/* ------------------------------------------------- opening a thread --- */

let r = await call('POST', '/conversations', { token: A.token, body: { userId: A.id } });
ok('you cannot talk to yourself', r.status === 400, `status=${r.status}`);

r = await call('POST', '/conversations', {
  token: A.token,
  body: { userId: 'not-a-person' },
});
ok('an unknown person is refused', r.status === 400, `status=${r.status}`);

r = await call('POST', '/conversations', {
  token: A.token,
  body: { userId: B.id, metScene: 'office', metLocationId: 'org-keystone' },
});
const AB = r.body?.id;
ok('A opens a thread with B', r.status === 201 && Boolean(AB), `status=${r.status}`);
ok('  carrying B as the partner', r.body?.partner?.id === B.id, JSON.stringify(r.body?.partner?.id));
ok('  with B named, not A', r.body?.partner?.name?.includes('B'), r.body?.partner?.name);
ok('  and where they met', r.body?.metScene === 'office' && r.body?.metLocationId === 'org-keystone',
  JSON.stringify([r.body?.metScene, r.body?.metLocationId]));
ok('  nothing said yet', r.body?.lastMessage === null && r.body?.unread === 0);

r = await call('POST', '/conversations', { token: A.token, body: { userId: B.id } });
ok('opening it again is the SAME thread, not a second',
  r.status === 200 && r.body?.id === AB, `status=${r.status} id=${r.body?.id}`);

r = await call('POST', '/conversations', { token: B.token, body: { userId: A.id } });
ok('  and B asking from the other side finds it too',
  r.body?.id === AB, `${r.body?.id} vs ${AB}`);
ok('  with A as the partner this time', r.body?.partner?.id === A.id);

/* ---------------------------------------------- somebody else's thread --- */

r = await call('GET', `/conversations/${AB}/messages`, { token: C.token });
ok("a stranger cannot read somebody else's thread", r.status === 404, `status=${r.status}`);

r = await call('POST', `/conversations/${AB}/messages`, {
  token: C.token, body: { body: 'butting in' },
});
ok('  nor send into it', r.status === 404, `status=${r.status}`);

/* ------------------------------------------------- the invite gate --- */

r = await call('POST', `/conversations/${AB}/messages`, { token: A.token, body: { body: '   ' } });
ok('an empty message is refused', r.status === 400, `status=${r.status}`);

r = await call('POST', `/conversations/${AB}/messages`, {
  token: A.token, body: { body: 'x'.repeat(2001) },
});
ok('an overlong message is refused', r.status === 400, `status=${r.status}`);

r = await call('POST', `/conversations/${AB}/messages`, {
  token: A.token,
  body: { body: 'Saw you in the lobby — are you hiring analysts?' },
});
ok("A's first message to a stranger sends", r.status === 201, `status=${r.status}`);
const firstId = r.body?.id;

r = await call('POST', `/conversations/${AB}/messages`, {
  token: A.token, body: { body: 'Hello? Hello?' },
});
ok('a second one is refused until B replies', r.status === 403,
  `status=${r.status} ${r.body?.message ?? ''}`);
ok('  and says why, in words a person can act on',
  String(r.body?.message ?? '').includes('reply'), r.body?.message);

r = await call('GET', '/notifications', { token: B.token });
const notices = (r.body ?? []).filter((n) => n.type === 'message');
ok('B was told about the message', notices.length === 1, `${notices.length} message notices`);
ok('  and the notice carries the message itself, not just that there is one',
  String(notices[0]?.body ?? '').includes('hiring analysts'), notices[0]?.body);

r = await call('POST', `/conversations/${AB}/messages`, {
  token: B.token, body: { body: 'We are — send me your CV.' },
});
ok('B replies', r.status === 201, `status=${r.status}`);

r = await call('POST', `/conversations/${AB}/messages`, {
  token: A.token, body: { body: 'Will do, thank you.' },
});
ok('once B replies, A can write again', r.status === 201, `status=${r.status}`);

/* -------------------------------------------------------- the thread --- */

r = await call('GET', `/conversations/${AB}/messages`, { token: A.token });
let messages = r.body ?? [];
ok('the thread reads back, oldest first', messages.length === 3, `${messages.length} messages`);
ok('  in order', messages[0]?.id === firstId);

r = await call('GET', `/conversations/${AB}/messages?since=${encodeURIComponent(messages[1].createdAt)}`, {
  token: A.token,
});
ok('`since` asks only for what is new', (r.body ?? []).length === 1,
  `${(r.body ?? []).length} after the second`);

/* ---------------------------------------------------------- unread --- */

r = await call('GET', '/conversations', { token: A.token });
let threads = r.body ?? [];
ok("A's inbox has the thread", threads.length === 1 && threads[0].id === AB);
ok('  counting only B\'s unread message', threads[0]?.unread === 1,
  `unread=${threads[0]?.unread}`);
ok('  with the newest message as the preview',
  threads[0]?.lastMessage?.body === 'Will do, thank you.', threads[0]?.lastMessage?.body);

r = await call('POST', `/conversations/${AB}/read`, { token: A.token });
ok('marking read answers 204', r.status === 204, `status=${r.status}`);

r = await call('GET', '/conversations', { token: A.token });
ok('  and clears the count', (r.body ?? [])[0]?.unread === 0,
  `unread=${(r.body ?? [])[0]?.unread}`);

r = await call('GET', '/conversations', { token: B.token });
ok("  without touching B's own unread", (r.body ?? [])[0]?.unread === 2,
  `B unread=${(r.body ?? [])[0]?.unread} (A sent two)`);

/* ----------------------------------------- a connection skips the gate --- */

r = await call('POST', '/conversations', { token: A.token, body: { userId: C.id } });
const AC = r.body?.id;
ok('A opens a thread with C', Boolean(AC));

r = await call('POST', `/conversations/${AC}/messages`, { token: A.token, body: { body: 'Hi C.' } });
ok('  and gets one message in', r.status === 201, `status=${r.status}`);

r = await call('POST', `/conversations/${AC}/messages`, { token: A.token, body: { body: 'Still here.' } });
ok('  then is gated', r.status === 403, `status=${r.status}`);

r = await call('POST', '/social/connections', { token: A.token, body: { userId: C.id } });
const connectionId = r.body?.id;
await call('POST', `/social/connections/${connectionId}/respond`, {
  token: C.token, body: { decision: 'accept' },
});

r = await call('POST', `/conversations/${AC}/messages`, { token: A.token, body: { body: 'Connected now.' } });
ok('an accepted connection lifts the gate without a reply',
  r.status === 201, `status=${r.status} ${r.body?.message ?? ''}`);

/* ---------------------------------------------------------- blocks --- */

r = await call('POST', '/social/blocks', { token: C.token, body: { authorId: A.id } });
ok('C blocks A', r.status === 200 || r.status === 201, `status=${r.status}`);

r = await call('POST', `/conversations/${AC}/messages`, { token: A.token, body: { body: 'Hello?' } });
ok('a block stops the OTHER side sending, not just the blocker',
  r.status === 403, `status=${r.status}`);
ok('  without telling A they were blocked',
  !String(r.body?.message ?? '').toLowerCase().includes('block'), r.body?.message);

r = await call('GET', '/conversations', { token: C.token });
ok("  and the thread leaves C's inbox",
  !(r.body ?? []).some((t) => t.id === AC), `${(r.body ?? []).length} threads`);

r = await call('POST', '/conversations', { token: A.token, body: { userId: C.id } });
ok('nor can a fresh thread be opened', r.status === 403, `status=${r.status}`);

/* ---------------------------------------------------------- report --- */

r = await call('POST', `/conversations/${AB}/report`, { token: B.token, body: { reason: 'spam' } });
ok('B reports the conversation', r.status === 200 && r.body?.reported === true, `status=${r.status}`);

r = await call('POST', `/conversations/${AB}/report`, { token: B.token, body: { reason: 'spam' } });
ok('  reporting twice is one report', r.status === 200, `status=${r.status}`);

r = await call('POST', `/conversations/${AB}/report`, { token: B.token, body: { reason: 'because' } });
ok('an unknown reason is refused', r.status === 400, `status=${r.status}`);

r = await call('GET', `/conversations/${AB}/messages`, { token: B.token });
ok('a report is NOT a takedown — the thread is still there',
  (r.body ?? []).length === 3, `${(r.body ?? []).length} messages`);

/* ------------------------------------------------------------- auth --- */

r = await call('GET', '/conversations');
ok('the inbox needs a session', r.status === 401, `status=${r.status}`);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
