/**
 * Grooveli API — the single Edge Function the frontend's apiClient talks to.
 *
 * Implements the contract in docs/BACKEND_HANDOFF.md: JSON in and out,
 * `Authorization: Bearer <supabase access token>` on authenticated routes,
 * and exactly one failure shape ({ code, message, details }) everywhere —
 * `message` is shown to users verbatim, so it is always written for a person.
 *
 * Security boundary: service-role access exists only inside this function
 * (see _shared/supabase.ts). The browser never holds a service key, and no
 * provider secrets exist in the frontend bundle (handoff §6).
 */
import { handle } from './router.ts';
import { ApiError, serverError, toErrorBody } from './_shared/errors.ts';
import { CORS_HEADERS, corsPreflight } from './_shared/cors.ts';
import './routes/index.ts';

function errorResponse(err: ApiError): Response {
  return new Response(JSON.stringify(toErrorBody(err)), {
    status: err.status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  try {
    const result = await handle(req);
    return new Response(result.body == null ? null : JSON.stringify(result.body), {
      status: result.status ?? (result.body == null ? 204 : 200),
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(result.headers ?? {}) },
    });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err);
    // Never leak framework or Postgres text at the boundary — the client's
    // error message is rendered to users as-is.
    console.error('[api] unhandled error:', err);
    return errorResponse(serverError());
  }
});
