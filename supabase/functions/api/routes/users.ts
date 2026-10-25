import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { loadProfile, userPayload } from '../_shared/users.ts';

const ROLES = ['candidate', 'employer'];

async function readBody(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Send the request as JSON.');
  return body as Record<string, unknown>;
}

// GET /users/me — restores a session from the stored token (§2).
route('GET', '/users/me', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  return { body: await userPayload(admin, authUser) };
});

// POST /users/me/roles — ADDS a capability and makes it active; never
// replaces. A recruiter who later job-hunts keeps what they built (§2).
route('POST', '/users/me/roles', async (req) => {
  const body = await readBody(req);
  const role = String(body.role ?? '');
  if (!ROLES.includes(role)) throw badRequest('Choose either the candidate or the employer space.');

  const admin = adminClient();
  const authUser = await requireUser(req);
  const profile = await loadProfile(admin, authUser.id);
  const roles = profile.roles ?? [];
  if (!roles.includes(role)) roles.push(role);

  const { error } = await admin
    .from('profiles')
    .update({ roles, active_role: role })
    .eq('id', authUser.id);
  if (error) {
    console.error('[users] add role failed:', error.message);
    throw serverError();
  }
  return { body: await userPayload(admin, authUser) };
});

// PATCH /users/me — switches between capabilities the account already holds.
route('PATCH', '/users/me', async (req) => {
  const body = await readBody(req);
  const role = String(body.activeRole ?? '');
  if (!ROLES.includes(role)) throw badRequest('Choose either the candidate or the employer space.');

  const admin = adminClient();
  const authUser = await requireUser(req);
  const profile = await loadProfile(admin, authUser.id);
  if (!(profile.roles ?? []).includes(role)) {
    throw badRequest('That space is not set up on this account yet.');
  }

  const { error } = await admin.from('profiles').update({ active_role: role }).eq('id', authUser.id);
  if (error) {
    console.error('[users] switch role failed:', error.message);
    throw serverError();
  }
  return { body: await userPayload(admin, authUser) };
});
