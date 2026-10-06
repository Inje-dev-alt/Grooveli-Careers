/**
 * The single place the frontend talks to the Grooveli application API.
 *
 * Today every service short-circuits to the mock layer, but they do so by
 * checking `useMocks` — the call signatures below are already the ones the real
 * backend will serve. When the API exists, flip `VITE_USE_MOCKS` to "false",
 * point `VITE_API_BASE_URL` at it, and delete the mock branches one service at
 * a time. No component changes.
 *
 * Security boundary: this client never carries provider secrets. AI requests go
 * to `POST /ai/chat` on Grooveli's own backend, which holds the model
 * credentials server-side. Nothing in this bundle should ever hold a key.
 */
import { readStorage, writeStorage, removeStorage } from '../utils/storage.js';

const TOKEN_KEY = 'auth-token';

export const apiConfig = {
  baseUrl: import.meta.env?.VITE_API_BASE_URL || '',
  /** Mocks stay on unless an API base URL is configured and mocks are disabled. */
  useMocks:
    String(import.meta.env?.VITE_USE_MOCKS ?? 'true') !== 'false' ||
    !import.meta.env?.VITE_API_BASE_URL,
};

/**
 * Normalised failure shape. Every service rejects with this, so UI error states
 * can rely on `message` being safe to show and `status` being meaningful.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

let authToken = readStorage(TOKEN_KEY, null);

export function setAuthToken(token) {
  authToken = token;
  if (token) writeStorage(TOKEN_KEY, token);
  else removeStorage(TOKEN_KEY);
}

export function getAuthToken() {
  return authToken;
}

function buildUrl(path, params) {
  const url = `${apiConfig.baseUrl.replace(/\/$/, '')}${path}`;
  if (!params) return url;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request(method, path, { body, params, signal, headers } = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : null),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach Grooveli. Check your connection and try again.', {
      status: 0,
      code: 'network_error',
    });
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: payload?.code || 'http_error',
      details: payload?.details ?? null,
    });
  }

  return payload;
}

export const apiClient = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
};

/**
 * Service bodies read as "the real call, or the mock". Keeping the branch in one
 * helper makes the remaining mock surface greppable: search for `withMock`.
 *
 * @template T
 * @param {() => Promise<T>} mockFn
 * @param {() => Promise<T>} realFn
 * @returns {Promise<T>}
 */
export function withMock(mockFn, realFn) {
  return apiConfig.useMocks ? mockFn() : realFn();
}
