/**
 * Live smoke test of the employer surface (batch 3.4): real HTTP, real Postgres.
 *
 * It registers THREE throwaway accounts, because the point of most of these
 * checks is what one account may do to another's data:
 *
 *   employer A  owns a company, publishes a role, moves the pipeline
 *   employer B  owns a different company, and must not reach A's
 *   candidate C applies to A's role
 *
 * Usage: node smoke-live-employer.mjs <api-base-url> <anon-key>
 * The accounts are left behind; they cannot be deleted without a service key.
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
  const email = `grooveli-emp-${label}-${stamp}@example.invalid`;
  const r = await call('POST', '/auth/register', { body: { email, password: 'smoke-test-pw-1' } });
  if (!r.body?.token) throw new Error(`could not register ${label}: ${JSON.stringify(r.body)}`);
  return { email, token: r.body.token, id: r.body.user.id };
}

const A = await register('a');
const B = await register('b');
const C = await register('c');
ok('three accounts registered', Boolean(A.token && B.token && C.token));
console.log(`      A ${A.email}\n      B ${B.email}\n      C ${C.email}\n`);

/* C finishes candidate onboarding. Registration alone does not create a
   candidate_profiles row, and without one there is nothing for an employer to
   discover and no card to attach to an application - which is correct, and the
   reason this step is here rather than assumed. */
let r0 = await call('POST', '/candidates', {
  token: C.token,
  body: { name: 'Smoke Candidate', headline: 'Backend engineer',
          summary: 'Builds payment systems and writes things down carefully.',
          location: 'Lagos, Nigeria', yearsExperience: 4,
          skills: ['TypeScript', 'PostgreSQL', 'Deno', 'SQL', 'Testing'],
          careerInterests: ['Software Development'], workTypes: ['hybrid'],
          openTo: ['full-time'], salaryMin: 500000 },
});
ok('C completes candidate onboarding', r0.status === 201 || r0.status === 200, `status=${r0.status} ${JSON.stringify(r0.body).slice(0, 140)}`);

/* ------------------------------------------------- companies exist --- */

let r = await call('POST', '/organizations', {
  token: A.token,
  body: { companyName: `Northstar ${stamp}`, industry: 'Technology', size: '11-50',
          location: 'Lagos, Nigeria', districtId: 'technology-hub', tagline: 'We build things.' },
});
ok('employer A creates a company', r.status === 201 && Boolean(r.body?.organization?.id), `status=${r.status}`);
const orgA = r.body?.organization?.id;
ok('  and the create response carries `size`', r.body?.organization?.size === '11-50',
  JSON.stringify(r.body?.organization?.size));

r = await call('POST', '/organizations', {
  token: B.token,
  body: { companyName: `Rival ${stamp}`, industry: 'Finance', size: '1-10', location: 'Abuja' },
});
const orgB = r.body?.organization?.id;
ok('employer B creates a different company', Boolean(orgB) && orgB !== orgA);

/* --------------------------------------------- active organization --- */

r = await call('GET', '/organizations/active', { token: A.token });
ok('A resolves its active organization', r.body?.organization?.id === orgA, JSON.stringify(r.body?.organization?.id));
ok('  with the membership role', r.body?.membership?.role === 'owner', JSON.stringify(r.body?.membership));
ok('  and `size` reads the same as on create', r.body?.organization?.size === '11-50',
  `size=${JSON.stringify(r.body?.organization?.size)}`);

r = await call('GET', '/organizations/active', { token: C.token });
ok('a candidate gets null, not an error', r.status === 200 && r.body === null, `status=${r.status} body=${JSON.stringify(r.body)}`);

/* ------------------------------------------------------ publishing --- */

r = await call('POST', `/organizations/${orgA}/jobs`, {
  token: A.token,
  body: { title: 'Senior Platform Engineer', description: 'Own the settlement rails.',
          salaryMin: 600000, salaryMax: 900000, location: 'Lagos, Nigeria',
          workType: 'hybrid', employmentType: 'full-time', experienceLevel: 'senior',
          requiredSkills: ['TypeScript', 'PostgreSQL'], preferredSkills: ['Deno'] },
});
ok('A publishes a role', r.status === 201 && Boolean(r.body?.id), `status=${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
const jobA = r.body?.id;
ok('  tagged grooveli_employer', r.body?.source === 'grooveli_employer', `source=${r.body?.source}`);
ok('  industry and district come from the company, not the draft',
  r.body?.industry === 'Technology' && r.body?.districtId === 'technology-hub',
  `industry=${r.body?.industry} district=${r.body?.districtId}`);

r = await call('POST', `/organizations/${orgA}/jobs`, { token: A.token, body: { description: 'no title' } });
ok('a role with no title is refused', r.status === 400 && r.body?.details?.field === 'title', `status=${r.status}`);

r = await call('POST', `/organizations/${orgA}/jobs`, {
  token: A.token, body: { title: 'Upside down', salaryMin: 900000, salaryMax: 100000 },
});
ok('an inverted salary range is refused', r.status === 400 && r.body?.details?.field === 'salaryMax', `status=${r.status}`);

/* ------------------------------ the crossover: one job, two sides --- */

r = await call('GET', '/jobs', { token: C.token });
const found = (r.body ?? []).find((j) => j.id === jobA);
ok("A's role appears in the candidate marketplace", Boolean(found), `${(r.body ?? []).length} published roles visible`);
ok('  as the same object, same source', found?.source === 'grooveli_employer' && found?.companyName?.startsWith('Northstar'));

/* -------------------------------------------- membership is checked --- */

r = await call('GET', `/organizations/${orgA}/jobs`, { token: B.token });
ok("B cannot read A's job list", r.status === 403, `status=${r.status}`);

r = await call('POST', `/organizations/${orgA}/jobs`, { token: B.token, body: { title: 'Trojan role' } });
ok("B cannot publish into A's company", r.status === 403, `status=${r.status}`);

r = await call('PATCH', `/organizations/${orgA}`, { token: B.token, body: { tagline: 'owned' } });
ok("B cannot edit A's company profile", r.status === 403, `status=${r.status}`);

r = await call('GET', `/organizations/${orgA}/applications`, { token: B.token });
ok("B cannot read A's pipeline", r.status === 403, `status=${r.status}`);

r = await call('GET', `/organizations/${orgA}/analytics`, { token: B.token });
ok("B cannot read A's analytics", r.status === 403, `status=${r.status}`);

r = await call('GET', `/organizations/${orgA}/jobs`, { token: C.token });
ok('a candidate cannot read an employer job list', r.status === 403, `status=${r.status}`);

/* ---------------------------------------------- the company profile --- */

r = await call('PATCH', `/organizations/${orgA}`, {
  token: A.token, body: { tagline: 'Settlement rails for West Africa.', size: '51-200' },
});
ok('A edits its own profile', r.status === 200 && r.body?.tagline === 'Settlement rails for West Africa.', `status=${r.status}`);
ok('  and `size` round-trips', r.body?.size === '51-200', `size=${r.body?.size}`);

r = await call('PATCH', `/organizations/${orgA}`, { token: A.token, body: { verified: true, followerCount: 99999 } });
ok('verified and followerCount are not editable', r.status === 400, `status=${r.status}`);
r = await call('GET', `/organizations/${orgA}`, { token: A.token });
ok('  and neither moved', r.body?.verified === false && r.body?.followerCount === 0,
  `verified=${r.body?.verified} followers=${r.body?.followerCount}`);

/* ------------------------------------------------------- job status --- */

r = await call('PATCH', `/jobs/${jobA}`, { token: B.token, body: { status: 'closed' } });
ok("B cannot close A's role", r.status === 403, `status=${r.status}`);

r = await call('PATCH', `/jobs/${jobA}`, { token: A.token, body: { status: 'nonsense' } });
ok('an unknown job status is refused', r.status === 400, `status=${r.status}`);

/* ----------------------------------------- the pipeline, end to end --- */

r = await call('POST', `/jobs/${jobA}/apply`, { token: C.token, body: { note: 'Keen.' } });
ok('candidate C applies', r.status === 201 && Boolean(r.body?.id), `status=${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
const appC = r.body?.id;

r = await call('GET', `/organizations/${orgA}/applications`, { token: A.token });
const inbound = (r.body ?? []).find((a) => a.id === appC);
ok("the application appears in A's pipeline", Boolean(inbound), `${(r.body ?? []).length} inbound`);
ok('  with a candidate card attached', Boolean(inbound?.candidate), JSON.stringify(inbound?.candidate && Object.keys(inbound.candidate)));
ok('  and the card carries no private profile fields',
  inbound?.candidate && !('summary' in inbound.candidate) && !('salaryExpectation' in inbound.candidate)
    && !('education' in inbound.candidate) && !('cv' in inbound.candidate),
  JSON.stringify(inbound?.candidate && Object.keys(inbound.candidate)));

r = await call('PATCH', `/applications/${appC}`, { token: B.token, body: { status: 'shortlisted' } });
ok("B cannot move A's pipeline — and gets a 404, not a 403", r.status === 404, `status=${r.status}`);

r = await call('PATCH', `/applications/${appC}`, { token: A.token, body: { status: 'under-review' } });
ok('A moves the application to under-review', r.status === 200 && r.body?.status === 'under-review', `status=${r.status}`);

r = await call('PATCH', `/applications/${appC}`, { token: A.token, body: { status: 'shortlisted' } });
ok('  then shortlisted', r.body?.status === 'shortlisted');

r = await call('PATCH', `/applications/${appC}`, { token: A.token, body: { status: 'hired' } });
ok('A cannot declare the candidate hired', r.status === 400, `status=${r.status}`);

r = await call('PATCH', `/applications/${appC}`, { token: C.token, body: { status: 'shortlisted' } });
ok('C cannot shortlist themselves', r.status === 400, `status=${r.status}`);

r = await call('GET', `/applications/${appC}/events`, { token: C.token });
const trail = (r.body ?? []).map((e) => `${e.actor}:${e.toStatus}`);
ok('C can read the stage history of their own application',
  trail.includes('candidate:applied') && trail.includes('employer:under-review') && trail.includes('employer:shortlisted'),
  trail.join(' → '));

/* ------------------------------------------- rejection needs a reason --- */

r = await call('PATCH', `/applications/${appC}`, { token: A.token, body: { status: 'rejected' } });
ok('a rejection with no reason is refused', r.status === 400 && r.body?.details?.field === 'feedback', `status=${r.status}`);

r = await call('PATCH', `/applications/${appC}`, { token: A.token, body: { status: 'rejected', feedback: '   ' } });
ok('  whitespace is not a reason', r.status === 400, `status=${r.status}`);

r = await call('PATCH', `/applications/${appC}`, {
  token: A.token,
  body: { status: 'rejected', feedback: 'Strong on Postgres, light on distributed systems. Worth reapplying.' },
});
ok('a rejection with a reason goes through', r.status === 200 && r.body?.status === 'rejected', `status=${r.status}`);
ok('  the feedback is stored', String(r.body?.feedback ?? '').startsWith('Strong on Postgres'), JSON.stringify(r.body?.feedback));
ok('  and it is unread', r.body?.rejectionAcknowledged === false, `ack=${r.body?.rejectionAcknowledged}`);

r = await call('GET', '/applications', { token: C.token });
const mine = (r.body ?? []).find((a) => a.id === appC);
ok('C sees the rejection and the reason on their own list',
  mine?.status === 'rejected' && String(mine?.feedback ?? '').startsWith('Strong on Postgres'),
  `status=${mine?.status}`);

/* ----------------------------------------- overview and analytics --- */

r = await call('GET', `/organizations/${orgA}/overview`, { token: A.token });
ok('overview counts real rows', r.body?.applications === 1 && r.body?.openJobs >= 1,
  JSON.stringify(r.body));

r = await call('GET', `/organizations/${orgA}/analytics`, { token: A.token });
ok('analytics counts the one application', r.body?.applications === 1, JSON.stringify(r.body?.applications));
ok('  byStage reflects the rejection', r.body?.byStage?.rejected === 1, JSON.stringify(r.body?.byStage));
ok('  sourceMix counts published roles by source', r.body?.sourceMix?.grooveli_employer >= 1, JSON.stringify(r.body?.sourceMix));
ok('  matchBuckets adds up to the application count',
  Object.values(r.body?.matchBuckets ?? {}).reduce((t, n) => t + n, 0) === 1, JSON.stringify(r.body?.matchBuckets));
ok('  avgDaysInStage is a number, not an invention', typeof r.body?.avgDaysInStage === 'number' && r.body.avgDaysInStage >= 0,
  `avgDaysInStage=${r.body?.avgDaysInStage}`);

r = await call('GET', `/organizations/${orgB}/analytics`, { token: B.token });
ok("an empty pipeline returns zeros, not samples",
  r.body?.applications === 0 && r.body?.avgDaysInStage === 0 && Object.keys(r.body?.byStage ?? {}).length === 0,
  JSON.stringify(r.body));

/* -------------------------------------------- candidate discovery --- */

r = await call('GET', '/candidates', { token: A.token });
ok('A can discover candidates', r.status === 200 && Array.isArray(r.body), `status=${r.status}`);
const pool = r.body ?? [];
ok('  C is discoverable', pool.some((c) => c.id === C.id), `${pool.length} candidates`);
ok('  sorted strongest first', pool.every((c, i) => i === 0 || pool[i - 1].matchScore >= c.matchScore));

r = await call('GET', '/candidates', { token: C.token });
ok('a candidate cannot list candidates', r.status === 403, `status=${r.status}`);

r = await call('GET', `/candidates/${C.id}`, { token: A.token });
ok('A can read one candidate card', r.status === 200 && r.body?.id === C.id, `status=${r.status}`);

r = await call('GET', `/candidates/${A.id}`, { token: A.token });
ok('an employer account is not a candidate', r.status === 404, `status=${r.status}`);

console.log(`\n      companies: ${orgA} (A), ${orgB} (B)`);
console.log(`      accounts left behind: ${A.email}, ${B.email}, ${C.email}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
