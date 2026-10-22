/**
 * A tiny method+path router for the API Edge Function.
 *
 * Hand-rolled rather than a framework: the route table stays small, the §3
 * error contract must be the only failure shape, and every line on this
 * boundary should be readable without dependency archaeology. Route modules
 * register themselves on import (see routes/index.ts).
 */
import { notFound } from './_shared/errors.ts';

export type ApiResult = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type Handler = (
  req: Request,
  params: Record<string, string>,
) => Promise<ApiResult> | ApiResult;

type Route = { method: string; segments: string[]; handler: Handler };

const routes: Route[] = [];

/**
 * Register a route relative to the function mount. Path params use `:name`
 * segments, e.g. route('GET', '/jobs/:id', handler).
 */
export function route(method: string, path: string, handler: Handler) {
  routes.push({ method: method.toUpperCase(), segments: split(path), handler });
}

function split(path: string) {
  return path.split('/').filter(Boolean);
}

function matchSegments(route: Route, method: string, pathname: string) {
  if (route.method !== method.toUpperCase()) return null;
  const parts = split(pathname);
  if (parts.length !== route.segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 1) {
    const seg = route.segments[i];
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
    else if (seg !== parts[i]) return null;
  }
  return params;
}

/** Strip the Edge Function mount so routes read as '/auth/login', '/jobs/:id'. */
function routePath(pathname: string) {
  return pathname.replace(/^\/functions\/v1\/api/, '').replace(/^\/api/, '') || '/';
}

export async function handle(req: Request): Promise<ApiResult> {
  const url = new URL(req.url);
  const pathname = routePath(url.pathname);

  for (const r of routes) {
    const params = matchSegments(r, req.method, pathname);
    if (params) return await r.handler(req, params);
  }

  // Thrown, not returned: the entry module converts it to the §3 body.
  throw notFound(`No route for ${req.method} ${pathname}.`);
}
