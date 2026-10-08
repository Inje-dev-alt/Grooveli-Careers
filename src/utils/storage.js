/**
 * localStorage access that never throws.
 *
 * Private windows, blocked site data and quota exhaustion all surface as
 * exceptions on read or write. The prototype persists progression locally, but
 * losing it must never take the app down with it.
 */
const PREFIX = 'grooveli:';

export function readStorage(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
    return true;
  } catch {
    return false;
  }
}

/** Storage adapter in the shape Zustand's `persist` middleware expects. */
export const safeJsonStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(PREFIX + name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(PREFIX + name, value);
    } catch {
      /* progression simply will not survive a reload — acceptable here */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(PREFIX + name);
    } catch {
      /* nothing to do */
    }
  },
};
