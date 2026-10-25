/**
 * Live smoke test of notifications (batch 3.5): the launch gate.
 *
 * The question it answers is the one the roadmap called the gate: when an
 * employer moves the pipeline, is the candidate actually told?
 *
 * Two accounts: an employer who owns a company and publishes a role, and a
 * candidate who applies to it. The candidate's inbox is then read after every
 * move.
 *
 * Usage: node smoke-live-notifications.mjs <api-base-url> <anon-key>
 * Leaves both accounts behind; they cannot be deleted without a service key.
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
  const email = `grooveli-ntf-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  if (!r.body?.token) throw new Error(`could not register ${label}: ${JSON.stringify(r.body)}`);
  return { email, token: r.body.token, id: r.body.user.id };
}

const inbox = async (token) => (await call('GET', '/notifications', { token })).body ?? [];
const unread = (feed) => feed.filter((n) => !n.read).length;

const E = await register('employer');
const C = await register('candidate');
ok('two accounts registered', Boolean(E.token && C.token));

await call('POST', '/candidates', {
  token: C.token,
  body: { name: 'Notice Candidate', headline: 'Analyst', location: 'Lagos, Nigeria',
          skills: ['SQL', 'Excel'], careerInterests: ['Software Development'] },
});

let r = await call('POST', '/organizations', {
  token: E.token,
  body: { companyName: `Beacon ${stamp}`, industry: 'Technology', size: '11-50',
          location: 'Lagos, Nigeria', districtId: 'technology-hub' },
});
const orgId = r.body?.organization?.id;
const companyName = r.body?.organization?.name;

r = await call('POST', `/organizations/${orgId}/jobs`, {
  token: E.token,
  body: { title: 'Data Analyst', description: 'Own the reporting layer.', location: 'Lagos, Nigeria' },
});
const jobId = r.body?.id;
ok('employer published a role', Boolean(jobId));

/* --------------------------------------------- a clean inbox to start --- */

let feed = await inbox(C.token);
ok('a new candidate has an empty inbox', feed.length === 0, `${feed.length} notices`);

r = await call('POST', `/jobs/${jobId}/apply`, { token: C.token, body: { note: 'Keen.' } });
const appId = r.body?.id;
ok('candidate applied', Boolean(appId));

feed = await inbox(C.token);
ok('applying raises no notice of your own action', feed.length === 0, `${feed.length} notices`);

/* ------------------------------------------------- the gate, stage by stage --- */

r = await call('PATCH', `/applications/${appId}`, { token: E.token, body: { status: 'under-review' } });
ok('employer moves to under-review', r.status === 200, `status=${r.status}`);
feed = await inbox(C.token);
ok('  the candidate is told', feed.length === 1, `${feed.length} notices`);
ok('  with the company in the title', String(feed[0]?.title ?? '').includes(companyName), JSON.stringify(feed[0]?.title));
ok('  unread', feed[0]?.read === false);
ok('  and somewhere to go', feed[0]?.route === '/profile', `route=${feed[0]?.route}`);

await call('PATCH', `/applications/${appId}`, { token: E.token, body: { status: 'shortlisted' } });
feed = await inbox(C.token);
ok('shortlisting is told too', feed.length === 2 && String(feed[0]?.title).startsWith('Shortlisted'), JSON.stringify(feed[0]?.title));

await call('PATCH', `/applications/${appId}`, { token: E.token, body: { status: 'interview' } });
feed = await inbox(C.token);
ok('the interview stage routes to the AI centre', feed[0]?.route === '/ai' && feed[0]?.type === 'interview',
  `route=${feed[0]?.route} type=${feed[0]?.type}`);

ok('newest first', new Date(feed[0].createdAt) >= new Date(feed[1].createdAt));
ok('three unread so far', unread(feed) === 3, `unread=${unread(feed)}`);

r = await call('PATCH', `/applications/${appId}`, {
  token: E.token,
  body: { status: 'rejected', feedback: 'Strong on SQL, thin on stakeholder work. Worth reapplying.' },
});
ok('a rejection with feedback goes through', r.status === 200, `status=${r.status}`);
feed = await inbox(C.token);
ok('  and the candidate is told, not left to find it', feed.length === 4, `${feed.length} notices`);
ok('  the notice says feedback is waiting', String(feed[0]?.body ?? '').includes('feedback is on your application'), JSON.stringify(feed[0]?.body));

/* ---------------------------------------------------- the inbox is private --- */

const employerFeed = await inbox(E.token);
ok("the employer's own inbox stayed empty", employerFeed.length === 0, `${employerFeed.length} notices`);

r = await call('POST', `/notifications/${feed[0].id}/read`, { token: E.token });
ok('one account cannot read another’s notice', r.status === 404, `status=${r.status}`);

const stillUnread = await inbox(C.token);
ok('  and it is still unread for its owner', stillUnread[0]?.read === false);

/* ----------------------------------------------------------- read state --- */

r = await call('POST', `/notifications/${feed[0].id}/read`, { token: C.token });
ok('the owner can mark one read', r.status === 200 && r.body?.read === true, `status=${r.status}`);
feed = await inbox(C.token);
ok('  and the count drops by one', unread(feed) === 3, `unread=${unread(feed)}`);

r = await call('POST', '/notifications/read-all', { token: C.token });
ok('read-all clears the bell', r.status === 200 && unread(r.body ?? []) === 0, `unread=${unread(r.body ?? [])}`);
feed = await inbox(C.token);
ok('  and it stays cleared', unread(feed) === 0 && feed.length === 4, `${feed.length} notices, ${unread(feed)} unread`);

/* --------------------------------------------------------- preferences --- */

r = await call('GET', '/users/me/notification-preferences', { token: C.token });
ok('preferences default to reminders on, no quiet hours',
  r.body?.missionReminders === true && r.body?.quietHours === null, JSON.stringify(r.body));

r = await call('PUT', '/users/me/notification-preferences', { token: C.token, body: { quietHours: { start: 22, end: 7 } } });
ok('quiet hours save', r.body?.quietHours?.start === 22 && r.body?.quietHours?.end === 7, JSON.stringify(r.body));
ok('  without turning reminders off', r.body?.missionReminders === true, JSON.stringify(r.body?.missionReminders));

r = await call('PUT', '/users/me/notification-preferences', { token: C.token, body: { missionReminders: false } });
ok('a partial update leaves quiet hours alone', r.body?.missionReminders === false && r.body?.quietHours?.start === 22,
  JSON.stringify(r.body));

r = await call('PUT', '/users/me/notification-preferences', { token: C.token, body: { quietHours: { start: 30, end: 7 } } });
ok('an impossible hour is refused', r.status === 400 && r.body?.details?.field === 'quietHours', `status=${r.status}`);

r = await call('PUT', '/users/me/notification-preferences', { token: C.token, body: { quietHours: null } });
ok('quiet hours can be cleared', r.body?.quietHours === null, JSON.stringify(r.body));

console.log(`\n      accounts left behind: ${E.email}, ${C.email}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
