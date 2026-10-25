/**
 * Live smoke test of the Grooveli Network (batch 3.6).
 *
 * Two candidates and one employer, because most of what matters here is what
 * one person may do to another's posts, connections and inbox.
 *
 * Usage: node smoke-live-social.mjs <api-base-url> <anon-key>
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
  const email = `grooveli-soc-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  if (!r.body?.token) throw new Error(`could not register ${label}: ${JSON.stringify(r.body)}`);
  return { email, token: r.body.token, id: r.body.user.id };
}

const A = await register('a');
const B = await register('b');
ok('two accounts registered', Boolean(A.token && B.token));

for (const [who, name] of [[A, 'Ada Writer'], [B, 'Ben Reader']]) {
  await call('POST', '/candidates', {
    token: who.token,
    body: { name, headline: `${name.split(' ')[0]}'s headline`, location: 'Lagos, Nigeria',
            skills: ['SQL'], careerInterests: ['Software Development'] },
  });
}

/* ------------------------------------------------------------- feed --- */

let r = await call('GET', '/social/posts', { token: A.token });
const seeded = r.body ?? [];
ok('the feed serves the seeded company posts', seeded.length >= 2, `${seeded.length} posts`);
ok('  with a resolved organization author',
  seeded.some((p) => p.author?.kind === 'organization' && p.author?.name),
  JSON.stringify(seeded[0]?.author));
ok('  newest first', seeded.length < 2 || new Date(seeded[0].createdAt) >= new Date(seeded[1].createdAt));

r = await call('POST', '/social/posts', {
  token: A.token, body: { body: 'Finished the Excel challenge today.', type: 'insight' },
});
ok('A publishes a post', r.status === 201 && Boolean(r.body?.id), `status=${r.status}`);
const postA = r.body?.id;
ok('  authored as A, resolved to a person', r.body?.author?.id === A.id && r.body?.author?.kind === 'user',
  JSON.stringify(r.body?.author));
ok('  starting at zero likes and no comments',
  r.body?.likeCount === 0 && r.body?.likedByMe === false && Array.isArray(r.body?.comments));

r = await call('POST', '/social/posts', { token: A.token, body: { body: '   ', type: 'insight' } });
ok('an empty post is refused', r.status === 400, `status=${r.status}`);

r = await call('POST', '/social/posts', { token: A.token, body: { body: 'x', type: 'nonsense' } });
ok('an unknown post type is refused', r.status === 400, `status=${r.status}`);

/* ----------------------------------- an attachment must be earned --- */

r = await call('POST', '/social/posts', {
  token: A.token,
  body: { body: 'Look what I got.', type: 'achievement',
          attachment: { kind: 'achievement', refId: 'ach-excel-foundations', label: 'Excel Foundations', verified: true } },
});
ok('an unearned achievement cannot be attached', r.status === 403, `status=${r.status}`);

// Earn one for real, then attach it.
await call('POST', '/career/events', {
  token: A.token, body: { event: 'skill.challenge', context: { skill: 'Excel' } },
});
r = await call('POST', '/social/posts', {
  token: A.token,
  body: { body: 'Passed the Excel challenge.', type: 'achievement',
          attachment: { kind: 'achievement', refId: 'ach-excel-foundations' } },
});
ok('an earned one can', r.status === 201, `status=${r.status}`);
ok('  and the server fills in the label and verified flag',
  r.body?.attachment?.label === 'Excel Foundations' && r.body?.attachment?.verified === true,
  JSON.stringify(r.body?.attachment));

/* ------------------------------------------------- likes and comments --- */

r = await call('POST', `/social/posts/${postA}/like`, { token: B.token });
ok('B likes the post', r.body?.likeCount === 1 && r.body?.likedByMe === true, JSON.stringify({ c: r.body?.likeCount, me: r.body?.likedByMe }));

r = await call('GET', '/social/posts', { token: A.token });
const seenByA = (r.body ?? []).find((p) => p.id === postA);
ok("  the count is shared but likedByMe is not", seenByA?.likeCount === 1 && seenByA?.likedByMe === false,
  JSON.stringify({ c: seenByA?.likeCount, me: seenByA?.likedByMe }));

r = await call('POST', `/social/posts/${postA}/like`, { token: B.token });
ok('liking again unlikes', r.body?.likeCount === 0 && r.body?.likedByMe === false);

r = await call('POST', `/social/posts/${postA}/comments`, { token: B.token, body: { body: 'Nice one.' } });
ok('B comments', r.status === 201 && r.body?.author?.id === B.id, `status=${r.status}`);

r = await call('GET', '/notifications', { token: A.token });
ok('  and A is told about the comment',
  (r.body ?? []).some((n) => String(n.title).includes('commented on your post')),
  JSON.stringify((r.body ?? []).map((n) => n.title)));

/* ------------------------------------------------------- connections --- */

r = await call('GET', '/social/connections/suggestions', { token: A.token });
ok('suggestions are real accounts', (r.body ?? []).some((p) => p.id === B.id), `${(r.body ?? []).length} suggested`);

r = await call('POST', '/social/connections', { token: A.token, body: { userId: B.id } });
ok('A asks to connect', r.status === 201 && r.body?.status === 'pending', `status=${r.status}`);
const conId = r.body?.id;

r = await call('POST', '/social/connections', { token: A.token, body: { userId: B.id } });
ok('asking twice returns the same request', r.body?.id === conId, `${r.body?.id} vs ${conId}`);

r = await call('POST', '/social/connections', { token: A.token, body: { userId: A.id } });
ok('you cannot connect to yourself', r.status === 400, `status=${r.status}`);

r = await call('GET', '/social/connections/suggestions', { token: A.token });
ok('  and B drops out of suggestions', !(r.body ?? []).some((p) => p.id === B.id));

r = await call('POST', `/social/connections/${conId}/respond`, { token: A.token, body: { decision: 'accept' } });
ok('the requester cannot accept their own request', r.status === 403, `status=${r.status}`);

r = await call('GET', '/social/connections/count', { token: A.token });
ok('count is 0 while pending', r.body?.count === 0, JSON.stringify(r.body));

r = await call('POST', `/social/connections/${conId}/respond`, { token: B.token, body: { decision: 'accept' } });
ok('the addressee can accept', r.status === 200 && r.body?.status === 'accepted', `status=${r.status}`);

r = await call('GET', '/social/connections/count', { token: A.token });
ok('  and the count moves for both', r.body?.count === 1, JSON.stringify(r.body));
r = await call('GET', '/social/connections/count', { token: B.token });
ok('  including the other side', r.body?.count === 1, JSON.stringify(r.body));

r = await call('POST', `/social/connections/${conId}/respond`, { token: B.token, body: { decision: 'decline' } });
ok('an answered request cannot be answered again', r.status === 400, `status=${r.status}`);

/* --------------------------------------------------------- referrals --- */

// B needs an application of their own for the ownership check to be exercised.
r = await call('GET', '/jobs', { token: B.token });
const jobId = (r.body ?? [])[0]?.id;
r = await call('POST', `/jobs/${jobId}/apply`, { token: B.token, body: { note: 'Keen.' } });
const appB = r.body?.id;
ok('B applied to a job', Boolean(appB));

r = await call('POST', '/social/referrals', {
  token: A.token, body: { connectionId: B.id, applicationId: appB },
});
ok("A cannot ask for a referral on B's application", r.status === 404, `status=${r.status}`);

r = await call('POST', `/jobs/${jobId}/apply`, { token: A.token, body: { note: 'Also keen.' } });
const appA = r.body?.id;
r = await call('POST', '/social/referrals', {
  token: A.token, body: { connectionId: B.id, applicationId: appA },
});
ok('A asks their connection for a referral', r.status === 201 && r.body?.referrerUserId === B.id, `status=${r.status}`);
ok('  named with the referrer', String(r.body?.referrerName ?? '').startsWith('Ben'), JSON.stringify(r.body?.referrerName));
const refId = r.body?.id;

r = await call('POST', '/social/referrals', {
  token: A.token, body: { connectionId: B.id, applicationId: appA },
});
ok('asking twice is the same ask', r.body?.id === refId);

r = await call('GET', '/notifications', { token: B.token });
ok('  and B is asked', (r.body ?? []).some((n) => String(n.title).includes('referral')),
  JSON.stringify((r.body ?? []).map((n) => n.title)));

r = await call('GET', '/social/referrals', { token: A.token });
ok('A sees the referral they asked for', (r.body ?? []).some((x) => x.id === refId));
r = await call('GET', '/social/referrals', { token: B.token });
ok('  and it is not in B’s own list', !(r.body ?? []).some((x) => x.id === refId), `${(r.body ?? []).length} rows`);

/* ----------------------------------------------------------- follows --- */

r = await call('GET', '/social/follows', { token: A.token });
ok('A follows nothing to start', (r.body?.organizationIds ?? []).length === 0);

r = await call('POST', '/social/follows', { token: A.token, body: { organizationId: 'org-northwind' } });
ok('A follows a company', (r.body?.organizationIds ?? []).includes('org-northwind'), JSON.stringify(r.body));

r = await call('POST', '/social/follows', { token: A.token, body: { organizationId: 'org-northwind' } });
ok('  following again unfollows', !(r.body?.organizationIds ?? []).includes('org-northwind'));

/* -------------------------------------------------------- moderation --- */

r = await call('POST', `/social/posts/${postA}/report`, { token: B.token, body: { reason: 'spam' } });
ok('B reports a post', r.status === 201 && r.body?.status === 'open', `status=${r.status}`);
const rptId = r.body?.id;
r = await call('POST', `/social/posts/${postA}/report`, { token: B.token, body: { reason: 'spam' } });
ok('  reporting twice is one report', r.body?.id === rptId);

r = await call('GET', '/social/posts', { token: B.token });
ok('  and the post is still there — a report is not a takedown',
  (r.body ?? []).some((p) => p.id === postA));

r = await call('POST', '/social/blocks', { token: B.token, body: { authorId: A.id } });
ok('B blocks A', r.status === 200 && (r.body ?? []).includes(A.id), `status=${r.status}`);

r = await call('GET', '/social/posts', { token: B.token });
ok("  A's posts vanish from B's feed", !(r.body ?? []).some((p) => p.author?.id === A.id));

r = await call('GET', '/social/posts', { token: A.token });
ok("  and nobody else's feed changed", (r.body ?? []).some((p) => p.id === postA));

console.log(`\n      accounts left behind: ${A.email}, ${B.email}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
