/**
 * Mock latency.
 *
 * Real networks are not instant, and an interface that has never seen a slow
 * response ends up with no loading states. Every mock service call goes through
 * here so skeletons and spinners are exercised in development.
 */
const configured = Number(import.meta.env?.VITE_MOCK_LATENCY);
const BASE_LATENCY = Number.isFinite(configured) ? configured : 360;

export function delay(ms = BASE_LATENCY) {
  const jitter = ms * 0.3 * Math.random();
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}
