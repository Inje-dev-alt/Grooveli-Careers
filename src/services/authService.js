/**
 * Authentication.
 *
 * The backend owns accounts entirely. The prototype signs a demo candidate in
 * so the rest of the experience has an identity to hang off; the function
 * signatures match what `POST /auth/login` and `GET /users/me` will serve.
 */
import { apiClient, withMock, setAuthToken, getAuthToken } from './apiClient.js';
import { db } from './mockDb.js';
import { delay } from '../utils/delay.js';

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ token: string, user: import('../models/index.js').User }>}
 */
export function login(credentials) {
  return withMock(
    async () => {
      await delay();
      const token = 'mock-session-token';
      setAuthToken(token);
      return { token, user: { ...db.user, email: credentials?.email || db.user.email } };
    },
    async () => {
      const result = await apiClient.post('/auth/login', credentials);
      setAuthToken(result.token);
      return result;
    },
  );
}

/** Signs the demo candidate in without credentials — prototype entry point. */
export function startDemoSession() {
  return login({ email: db.user.email, password: 'demo' });
}

/** @returns {Promise<import('../models/index.js').User>} */
export function getCurrentUser() {
  return withMock(
    async () => {
      await delay(180);
      return { ...db.user };
    },
    () => apiClient.get('/users/me'),
  );
}

export function logout() {
  return withMock(
    async () => {
      setAuthToken(null);
      return null;
    },
    async () => {
      await apiClient.post('/auth/logout');
      setAuthToken(null);
      return null;
    },
  );
}

export function hasSession() {
  return Boolean(getAuthToken());
}
