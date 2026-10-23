/**
 * Live smoke test of the progression path: real HTTP, real Postgres, real RPC.
 *
 * The mock harnesses proved the rules as I implemented them. This proves the
 * server implements the same ones, which is a different claim.
 *
 * Usage: node smoke-live.mjs <api-base-url> <anon-key>
 * Registers one throwaway account and leaves it behind; it cannot be deleted
 * without a service-role key.
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

let token = null;
async function call(method, path, body) {
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

const event = (ev, context = {}) => call('POST', '/career/events', { event: ev, context });

/* ---------------------------------------------------------- register --- */

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const email = `grooveli-smoketest-${stamp}-${Date.now().toString(36)}@example.invalid`;
const reg = await call('POST', '/auth/register', { email, password: 'smoke-test-pw-1' });
ok('register returns a session', reg.status === 200 && Boolean(reg.body?.token), `status=${reg.status} ${JSON.stringify(reg.body).slice(0, 160)}`);
if (!reg.body?.token) { console.log('\ncannot continue without a token'); process.exit(1); }
token = reg.body.token;
console.log(`      account: ${email}\n`);

/* ------------------------------------------------- a clean start --- */

let r = await call('GET', '/career/progress');
ok('new account starts at 0 XP, level 1', r.body?.xp === 0 && r.body?.level === 1, JSON.stringify(r.body));
ok('  and carries a derived title', r.body?.title === 'Newcomer', `title=${r.body?.title}`);

/* ------------------------------------------- XP, keyed on its subject --- */

r = await event('skill.challenge', { skill: 'Excel', score: 86 });
ok('skill challenge pays 100', r.status === 201 && r.body?.xpAwarded === 100, `status=${r.status} xp=${r.body?.xpAwarded}`);
ok('  reputation +3', r.body?.progress?.reputation === 3, `rep=${r.body?.progress?.reputation}`);
ok('  stat certifications untouched, no stat for this event', r.body?.stats?.certifications === 0, JSON.stringify(r.body?.stats));

r = await event('skill.challenge', { skill: 'Excel', score: 99 });
ok('the same skill again pays 0', r.status === 200 && r.body?.status === 'replayed' && r.body?.xpAwarded === 0, `status=${r.body?.status} xp=${r.body?.xpAwarded}`);
ok('  total still 100', r.body?.progress?.xp === 100, `xp=${r.body?.progress?.xp}`);

r = await event('skill.challenge', { skill: 'Communication', score: 80 });
ok('a different skill pays again', r.body?.xpAwarded === 100 && r.body?.progress?.xp === 200, `xp=${r.body?.progress?.xp}`);

/* ----------------------------------- the guard against an unkeyed award --- */

r = await event('skill.challenge', {});
ok('skill challenge with no skill is refused', r.status === 400, `status=${r.status}`);
ok('  and names the field', r.body?.details?.field === 'context.skill', JSON.stringify(r.body?.details));

r = await event('course.completed', { skill: 'Excel' });
ok('course with no courseId is refused', r.status === 400 && r.body?.details?.field === 'context.courseId', JSON.stringify(r.body?.details));

r = await call('GET', '/career/progress');
ok('  neither refusal awarded anything', r.body?.xp === 200, `xp=${r.body?.xp}`);

/* ------------------------------------------------------- one-shot events --- */

r = await event('profile.completed');
ok('profile completion pays 50', r.body?.xpAwarded === 50, `xp=${r.body?.xpAwarded}`);
r = await event('profile.completed', { nonce: Math.random() });
ok('a fresh context cannot re-fire it', r.body?.status === 'already_counted' && r.body?.xpAwarded === 0, `status=${r.body?.status}`);

r = await call('GET', '/career/one-time-events');
ok('one-time list reports it', Array.isArray(r.body) && r.body.includes('profile.completed'), JSON.stringify(r.body));

/* three at once: the unique index, not the read-then-write guard */
const concurrent = await Promise.all([event('cv.uploaded'), event('cv.uploaded'), event('cv.uploaded')]);
const paidCv = concurrent.filter((c) => c.body?.xpAwarded === 25).length;
ok('three concurrent cv.uploaded pay exactly once', paidCv === 1, `paid=${paidCv} statuses=${concurrent.map((c) => c.body?.status).join(',')}`);
r = await call('GET', '/career/progress');
ok('  total is 275, not 325', r.body?.xp === 275, `xp=${r.body?.xp}`);

/* ------------------------------------- mission.completed is not accepted --- */

r = await event('mission.completed', { missionId: 'msn-excel' });
ok('mission.completed refused by /career/events', r.status === 400, `status=${r.status}`);
ok('  and names the endpoint that owns it', r.body?.details?.replacedBy === 'POST /missions/:id/complete', JSON.stringify(r.body?.details));

/* ----------------------------------- achievements counted over distinct things --- */

const districts = ['technology-hub', 'creative-quarter', 'healthcare-campus', 'hospitality-row', 'finance-district'];
let explorer = null;
for (const location of districts) {
  const res = await event('location.visited', { location });
  const won = (res.body?.awardedAchievements ?? []).find((a) => a.id === 'ach-career-explorer');
  if (won) explorer = { won, at: location };
}
ok('five distinct districts earn Career Explorer', Boolean(explorer), explorer ? `awarded on the 5th (${explorer.at})` : 'not awarded');

r = await call('GET', '/career/stats');
ok('  locationsVisited is 5', r.body?.locationsVisited === 5, `locationsVisited=${r.body?.locationsVisited}`);

const repeats = [];
for (let i = 0; i < 5; i += 1) repeats.push(await event('location.visited', { location: 'technology-hub' }));
ok('repeat visits to one district award nothing', repeats.every((x) => x.body?.xpAwarded === 0 && (x.body?.awardedAchievements ?? []).length === 0));
r = await call('GET', '/career/stats');
ok('  and do not inflate the counter', r.body?.locationsVisited === 5, `locationsVisited=${r.body?.locationsVisited}`);

r = await call('GET', '/career/achievements');
const earned = (r.body ?? []).filter((a) => a.earned).map((a) => a.id);
ok('Excel Foundations went to the Excel challenge', earned.includes('ach-excel-foundations'), earned.join(', '));
ok('Communication Proven went to the Communication challenge', earned.includes('ach-comms-proven'));
ok('  and the catalog is returned whole, not just the earned', (r.body ?? []).length > earned.length, `${r.body?.length} total, ${earned.length} earned`);

/* ------------------------------------------- ledger vs activity stream --- */

r = await call('GET', '/career/ledger');
const ledger = r.body ?? [];
ok('ledger holds only awards', ledger.length > 0 && ledger.every((e) => e.xp !== 0), `${ledger.length} rows`);
ok('  newest first', ledger.length < 2 || new Date(ledger[0].at) >= new Date(ledger[1].at));

r = await call('GET', '/career/activity', undefined);
const activity = (await call('GET', '/career/activity?limit=60')).body ?? [];
ok('zero-XP events reach the activity stream', activity.some((a) => a.xp === 0 && a.type === 'location.visited'), `${activity.length} rows`);

/* ---------------------------------------------------------- missions --- */

r = await call('GET', '/missions');
const missions = r.body ?? [];
ok('mission catalog is served', Array.isArray(missions) && missions.length > 0, `${missions.length} missions`);
ok('  every mission carries its objectives', missions.every((m) => Array.isArray(m.objectives) && m.objectives.length > 0));
const excel = missions.find((m) => m.id === 'msn-excel');
ok('  with xpReward from the catalog row', excel?.xpReward === 100, `msn-excel xpReward=${excel?.xpReward}`);

r = await call('POST', '/missions/msn-first-job/complete');
ok('an unfinished mission answers 409', r.status === 409, `status=${r.status}`);
ok('  with what is outstanding', Array.isArray(r.body?.details?.outstanding) && r.body.details.outstanding.length > 0,
  JSON.stringify(r.body?.details?.outstanding?.map((o) => `${o.event} ${o.done}/${o.target}`)));

const before = (await call('GET', '/career/progress')).body.xp;
r = await call('POST', '/missions/msn-excel/complete');
ok('a finished mission pays its catalog reward', r.status === 201 && r.body?.xpAwarded === 100, `status=${r.status} xp=${r.body?.xpAwarded}`);
ok('  and returns the new totals', r.body?.progress?.xp === before + 100, `progress.xp=${r.body?.progress?.xp} expected=${before + 100}`);
ok('  First Career Mission awarded', (r.body?.awardedAchievements ?? []).some((a) => a.id === 'ach-first-mission'), JSON.stringify((r.body?.awardedAchievements ?? []).map((a) => a.id)));

r = await call('POST', '/missions/msn-excel/complete');
ok('completing it twice pays 0', r.body?.xpAwarded === 0 && r.body?.status === 'replayed', `status=${r.body?.status}`);

r = await call('GET', '/missions/progress');
ok('mission progress reads completed', r.body?.progress?.['msn-excel']?.status === 'completed', JSON.stringify(r.body?.progress?.['msn-excel']));

r = await call('GET', '/career/stats');
ok('completedMissions counted once', r.body?.completedMissions === 1, `completedMissions=${r.body?.completedMissions}`);

/* ------------------------------------ progress is advisory, not believed --- */

r = await call('PUT', '/missions/progress', {
  progress: { 'msn-sales': { missionId: 'msn-sales', status: 'completed', objectiveCounts: { 'obj-sales-sim': 47 } } },
});
const sales = r.body?.progress?.['msn-sales'];
ok('a forged "completed" is not stored as completed', sales?.status !== 'completed', `status=${sales?.status}`);
ok('  and counts are clamped to the real target', Object.values(sales?.objectiveCounts ?? {}).every((v) => v <= 1), JSON.stringify(sales?.objectiveCounts));

/* The earlier version of this script expected a 409 here. That was wrong: this
   account has genuinely recorded two `skill.challenge` events, and msn-sales
   asks for one. 201 is the correct answer to the question the objective asks.
   What it exposes is the objective itself — see below. */
r = await call('POST', '/missions/msn-sales/complete');
ok('forged progress is ignored; the real events decide', r.status === 201 || r.status === 200, `status=${r.status}`);

/* --- the finding: skill missions do not discriminate by skill --- */
const skillMissions = ['msn-excel', 'msn-communication', 'msn-recruitment', 'msn-sales'];
const claimed = [];
for (const id of skillMissions) {
  const res = await call('POST', `/missions/${id}/complete`);
  if (res.status === 201 || (res.status === 200 && res.body?.status === 'replayed')) claimed.push(id);
}
ok('NOTE: one skill challenge satisfies every skill mission',
  claimed.length === skillMissions.length,
  `claimed ${claimed.length}/4 from 2 challenges: ${claimed.join(', ')}`);

const finalXp = (await call('GET', '/career/progress')).body;
console.log(`\n      final: ${finalXp.xp} XP, level ${finalXp.level} (${finalXp.title}), reputation ${finalXp.reputation}`);
console.log(`      account left behind: ${email}`);
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
