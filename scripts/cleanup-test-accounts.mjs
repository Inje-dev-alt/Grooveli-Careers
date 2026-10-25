/**
 * Remove the accounts the live smoke suites leave behind.
 *
 * Every suite registers real accounts against the real project, because that
 * is the only way to test a rule about what a SECOND person sees. They
 * accumulate: a dozen runs is fifty accounts, each with a profile, a career
 * ledger and now a presence row.
 *
 * SAFETY, in the order it is applied:
 *
 *  1. Only a domain reserved by RFC 2606 — `example.invalid` or
 *     `example.com`. Neither can be delivered to, so neither can belong to a
 *     real person, which is why the suites use them. An address outside this
 *     list is never a candidate for deletion, whatever else matches.
 *  2. Only a prefix a suite is known to write. Earlier suites used `smoke-`
 *     and current ones use `grooveli-`; both are listed, and a name outside
 *     the list survives even on a reserved domain.
 *  3. Dry run unless `--apply` is passed. The default prints what it would do
 *     and changes nothing.
 *  4. `--keep` is honoured before anything is deleted, not after.
 *
 * Organizations need their own pass. `organizations` has no owner column, so
 * deleting an employer cascades their membership and leaves the company row
 * behind — still in the directory, still shown to candidates, with nobody in
 * it. A row is only removed when BOTH of these hold:
 *
 *  - its id matches `org-<8 hex>`, which is what `POST /organizations`
 *    generates. The seeded demo companies have readable ids (`org-keystone`),
 *    so this can never match one.
 *  - it has no memberships left, i.e. the people who ran it are gone.
 *
 * Usage:
 *   node cleanup-test-accounts.mjs                        # dry run
 *   node cleanup-test-accounts.mjs --apply
 *   node cleanup-test-accounts.mjs --keep a@x --keep b@x --apply
 *
 * The service-role key is read from the Supabase CLI inside this process. It
 * is never taken as an argument, printed, or written anywhere.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const KEEP = new Set(
  args.flatMap((arg, i) => (arg === '--keep' ? [String(args[i + 1] ?? '').toLowerCase()] : [])),
);

const TEST_DOMAINS = ['@example.invalid', '@example.com'];
const TEST_PREFIXES = ['grooveli-', 'smoke-'];
/** `POST /organizations` ids. A seeded `org-keystone` can never match this. */
const CREATED_ORG = /^org-[0-9a-f]{8}$/;

/* ------------------------------------------------------- credentials --- */

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envValue = (key) =>
  (env.split(/\r?\n/).find((line) => line.startsWith(`${key}=`)) ?? '').slice(key.length + 1).trim();

const SUPABASE_URL = envValue('VITE_SUPABASE_URL');
if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL is not in .env');
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

function serviceRoleKey() {
  // `shell: true` because on Windows the CLI is `npx.cmd`, and spawning a
  // batch file without a shell fails with EINVAL. The arguments are all
  // literals and a project ref parsed out of a URL, so there is nothing
  // here for a shell to interpret.
  const raw = execFileSync(
    'npx',
    ['supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true },
  );
  const keys = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
  const key = keys.find((k) => k.name === 'service_role' || k.id === 'service_role')?.api_key;
  if (!key) throw new Error('could not read the service_role key from the Supabase CLI');
  return key;
}

const KEY = serviceRoleKey();
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function api(path, { method = 'GET', body, extraHeaders } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(payload)}`);
  return payload;
}

/* ----------------------------------------------------------- accounts --- */

async function allUsers() {
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const batch = result?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

const users = await allUsers();

const isTestAccount = (email) => {
  const address = String(email ?? '').toLowerCase();
  // Both conditions, in this order. The domain check is the one that matters:
  // on its own it already guarantees the address cannot reach a person.
  return (
    TEST_DOMAINS.some((domain) => address.endsWith(domain)) &&
    TEST_PREFIXES.some((prefix) => address.startsWith(prefix))
  );
};

const testAccounts = users.filter((u) => isTestAccount(u.email));
const kept = testAccounts.filter((u) => KEEP.has(String(u.email).toLowerCase()));
const doomed = testAccounts.filter((u) => !KEEP.has(String(u.email).toLowerCase()));
const untouched = users.filter((u) => !isTestAccount(u.email));

console.log(`accounts in the project:   ${users.length}`);
console.log(`  test accounts:           ${testAccounts.length}`);
console.log(`  kept by --keep:          ${kept.length}`);
console.log(`  to delete:               ${doomed.length}`);
console.log(`  not test accounts:       ${untouched.length}  (never touched)\n`);

for (const email of KEEP) {
  if (!testAccounts.some((u) => String(u.email).toLowerCase() === email)) {
    console.log(`WARNING  --keep ${email} matched no test account`);
  }
}

if (untouched.length) {
  console.log('left alone:');
  for (const u of untouched) console.log(`  ${u.email}`);
  console.log('');
}

if (kept.length) {
  console.log('kept:');
  for (const u of kept) console.log(`  ${u.email}`);
  console.log('');
}

console.log(`${APPLY ? 'deleting' : 'would delete'}:`);
for (const u of doomed) console.log(`  ${u.email}`);

let deleted = 0;
if (APPLY) {
  for (const u of doomed) {
    try {
      await api(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
      deleted += 1;
    } catch (error) {
      console.log(`  FAILED  ${u.email} — ${error.message}`);
    }
  }
  console.log(`\ndeleted ${deleted} of ${doomed.length}`);
}

/* ------------------------------------------------------ organizations --- */

const organizations = await api('/rest/v1/organizations?select=id,name');
const memberships = await api('/rest/v1/organization_memberships?select=organization_id');
const hasMembers = new Set(memberships.map((m) => m.organization_id));

const orphaned = organizations.filter((o) => CREATED_ORG.test(o.id) && !hasMembers.has(o.id));

console.log(`\norganizations: ${organizations.length}`);
console.log(`  created through the API: ${organizations.filter((o) => CREATED_ORG.test(o.id)).length}`);
console.log(`  of those, now memberless: ${orphaned.length}`);

if (orphaned.length) {
  console.log(`\n${APPLY ? 'deleting' : 'would delete'} memberless companies:`);
  for (const o of orphaned) console.log(`  ${o.id}  ${o.name}`);

  if (APPLY) {
    for (const o of orphaned) {
      try {
        await api(`/rest/v1/organizations?id=eq.${o.id}`, { method: 'DELETE' });
      } catch (error) {
        console.log(`  FAILED  ${o.id} — ${error.message}`);
      }
    }
  }
}

if (!APPLY) console.log('\nDRY RUN — nothing was changed. Pass --apply to carry it out.');
