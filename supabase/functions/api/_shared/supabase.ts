import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/**
 * Server-side client with the service role key.
 *
 * Only ever constructed inside this function — never returned to, or echoed
 * at, the browser. Supabase injects both env vars into the function runtime
 * automatically (deployed and `functions serve` alike).
 *
 * IMPORTANT: never call auth.signIn* on this client. Signing in attaches an
 * in-memory user session, and every later .from() call would then send that
 * user's JWT instead of the service key — running as `authenticated` against
 * deny-all RLS. Use authClient() for sign-in; use this one for data only.
 */
export function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    // Fail loudly in the function logs; the client sees the generic §3 500.
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the function environment.');
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Public (anon) client for auth endpoints such as sign-in. Deliberately
 * never used for data access — see the warning on adminClient().
 */
export function authClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
