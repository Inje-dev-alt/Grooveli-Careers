import { createClient, type User } from 'jsr:@supabase/supabase-js@2';
import { unauthorized } from './errors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/**
 * Resolve the caller from the `Authorization: Bearer <token>` header.
 *
 * The token is a Supabase Auth access token — the frontend stores whatever
 * `/auth/login` returned and apiClient sends it on every request (handoff §1).
 * Throws the §3 401 the frontend already routes to sign-in (`isAuthError`).
 */
export async function requireUser(req: Request): Promise<User> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw unauthorized('You are signed out. Sign in again to continue.');

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw unauthorized();
  return data.user;
}
