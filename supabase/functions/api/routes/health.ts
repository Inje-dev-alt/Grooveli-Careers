import { route } from '../router.ts';

// Public liveness probe — no auth. Used by smoke tests and deploys to prove
// the router is mounted before any data route exists.
route('GET', '/health', () => ({
  status: 200,
  body: { ok: true, service: 'grooveli-api', time: new Date().toISOString() },
}));
