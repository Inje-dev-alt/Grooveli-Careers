/**
 * CORS for the browser client.
 *
 * `*` is safe here: the API authenticates with a Bearer token, not cookies,
 * so the credential-restriction on wildcard origins does not apply. The
 * allowed headers mirror what apiClient sends plus Supabase conventions.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
