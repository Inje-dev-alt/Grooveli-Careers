import { route } from '../router.ts';
import { adminClient, authClient } from '../_shared/supabase.ts';
import { badRequest, conflict, unauthorized } from '../_shared/errors.ts';
import { userPayload } from '../_shared/users.ts';

async function readBody(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Send the request as JSON.');
  return body as Record<string, unknown>;
}

// POST /auth/register — the new user has no role yet; role selection is a
// deliberate separate step, because it decides which product they enter (§2).
route('POST', '/auth/register', async (req) => {
  const body = await readBody(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) {
    throw badRequest('Email and password are both required.', { field: 'email' });
  }
  if (password.length < 6) {
    throw badRequest('Use a password of at least 6 characters.', { field: 'password' });
  }

  const admin = adminClient();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      throw conflict('An account already uses that email address.');
    }
    console.error('[auth] register failed:', error.message);
    throw badRequest('Could not create the account. Check the email address and try again.');
  }

  // Sign-in on a dedicated anon client: attaching a user session to the
  // service-role client would downgrade every later data call to
  // `authenticated` against deny-all RLS (see _shared/supabase.ts).
  const signIn = await authClient().auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw unauthorized('Could not start a session. Sign in to continue.');
  }

  return {
    body: {
      token: signIn.data.session.access_token,
      user: await userPayload(admin, signIn.data.user),
    },
  };
});

route('POST', '/auth/login', async (req) => {
  const body = await readBody(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) throw badRequest('Email and password are both required.');

  const admin = adminClient();
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  // One message for both failure cases: whether the address is unknown is
  // not the client's business.
  if (error || !data.session || !data.user) {
    throw unauthorized('That email and password do not match.');
  }
  return { body: { token: data.session.access_token, user: await userPayload(admin, data.user) } };
});

route('POST', '/auth/logout', async (req) => {
  // Token revocation is best-effort; the frontend drops its copy either way.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (token) await adminClient().auth.admin.signOut(token, 'global').catch(() => {});
  return { status: 204 };
});
