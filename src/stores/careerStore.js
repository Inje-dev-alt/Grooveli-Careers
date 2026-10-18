import { create } from 'zustand';
import * as careerService from '../services/careerService.js';
import {
  XP_REWARDS,
  REPUTATION_REWARDS,
  EVENT_LABELS,
} from '../utils/careerEvents.js';
import { resolveProgression, careerTitleForLevel } from '../utils/progression.js';

/**
 * Career progression.
 *
 * XP and reputation are separate numbers on purpose. XP measures progression -
 * what you have done. Reputation measures credibility - what an employer can
 * trust, and it only moves on work someone else could verify. Collapsing them
 * would make both meaningless.
 *
 * The store holds no seed data: progression is hydrated from the service for
 * the signed-in account, and a new account starts at zero. A career level that
 * was handed out rather than earned makes every number downstream a lie.
 *
 * Hydration also restores the one-shot event guard and the XP ledger. Both
 * belong to the account, not the tab: without the guard, refreshing the page
 * re-awarded the profile-completion XP every time.
 */
const EMPTY = { xp: 0, reputation: 0 };
const LEDGER_LIMIT = 60;

export const useCareerStore = create((set, get) => ({
  xp: 0,
  reputation: 0,
  /** @type {{ id: string, event: string, label: string, xp: number, at: string }[]} */
  ledger: [],
  /** Events that may only ever count once, however often they fire. */
  oneTimeEvents: [],
  hydrated: false,

  /** Load progression for the signed-in account. */
  hydrate: async () => {
    try {
      const [progress, oneTimeEvents, ledger] = await Promise.all([
        careerService.getProgress(),
        careerService.getOneTimeEvents().catch(() => []),
        careerService.getLedger().catch(() => []),
      ]);
      set({
        xp: progress.xp ?? 0,
        reputation: progress.reputation ?? 0,
        oneTimeEvents,
        ledger,
        hydrated: true,
      });
      return progress;
    } catch {
      set({ ...EMPTY, oneTimeEvents: [], ledger: [], hydrated: true });
      return null;
    }
  },

  /** Clear on sign-out so the next account does not inherit a stranger's career. */
  reset: () => set({ ...EMPTY, ledger: [], oneTimeEvents: [], hydrated: false }),

  /**
   * Record a career activity and award whatever it is worth.
   *
   * `ledger` defaults to "anything that earned XP". Pass it explicitly for an
   * activity worth zero that the user still needs to see explained - an
   * application below the match threshold, for instance. Passive events stay
   * out: the ledger is a record of career work, not a click log.
   *
   * @param {string} event one of CAREER_EVENTS
   * @param {{ once?: boolean, label?: string, ledger?: boolean, context?: Record<string, unknown> }} [options]
   */
  recordEvent: (event, options = {}) => {
    const before = resolveProgression(get().xp);

    if (options.once && get().oneTimeEvents.includes(event)) {
      return { xp: 0, reputation: 0, levelledUp: false, level: before.level, reason: 'already-counted' };
    }

    const xp = XP_REWARDS[event] ?? 0;
    const reputation = REPUTATION_REWARDS[event] ?? 0;
    const label = options.label || EVENT_LABELS[event] || event;
    const shouldLog = options.ledger ?? xp > 0;
    const now = new Date().toISOString();
    const entry = { id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, event, label, xp, at: now };

    set((state) => ({
      xp: state.xp + xp,
      reputation: Math.min(100, state.reputation + reputation),
      ledger: shouldLog ? [entry, ...state.ledger].slice(0, LEDGER_LIMIT) : state.ledger,
      // Claimed synchronously so a double-fire in the same tick cannot pass
      // the guard twice; persisted so a reload cannot either.
      oneTimeEvents: options.once ? [...state.oneTimeEvents, event] : state.oneTimeEvents,
    }));

    if (options.once) careerService.markOneTimeEvent(event).catch(() => {});
    if (shouldLog) careerService.appendLedger(entry).catch(() => {});
    get().persist();

    const after = resolveProgression(get().xp);
    return {
      xp,
      reputation,
      levelledUp: after.level > before.level,
      level: after.level,
      reason: xp === 0 ? 'no-xp-for-event' : undefined,
    };
  },

  /**
   * Bonus XP from a completed mission, which is not itself a career event.
   * Reputation is untouched: the verifiable work inside the mission raised it
   * through its own event, and counting twice would make the number fiction.
   */
  awardMissionXp: (missionTitle, amount) => {
    const before = resolveProgression(get().xp);
    const entry = {
      id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      event: 'mission.completed',
      label: `Mission complete - ${missionTitle}`,
      xp: amount,
      at: new Date().toISOString(),
    };
    set((state) => ({
      xp: state.xp + amount,
      ledger: [entry, ...state.ledger].slice(0, LEDGER_LIMIT),
    }));
    careerService.appendLedger(entry).catch(() => {});
    get().persist();
    const after = resolveProgression(get().xp);
    return { xp: amount, levelledUp: after.level > before.level, level: after.level };
  },

  /** Write progression back. The backend owns this permanently. */
  persist: () => {
    const { xp, reputation } = get();
    careerService
      .saveProgress({ xp, reputation, level: resolveProgression(xp).level })
      .catch(() => {
        /* the in-session value stands; the backend reconciles on next load */
      });
  },

  hasRecorded: (event) => get().oneTimeEvents.includes(event),
}));

/**
 * Derived progression - level, XP into level, progress to next.
 *
 * Memoised on `xp`. Zustand compares snapshots by reference, so a selector that
 * builds a fresh object every call re-renders forever.
 */
let progressionCache = { xp: null, value: null };

export const selectProgression = (state) => {
  if (progressionCache.xp !== state.xp) {
    progressionCache = { xp: state.xp, value: resolveProgression(state.xp) };
  }
  return progressionCache.value;
};

export const selectCareerTitle = (state) => careerTitleForLevel(selectProgression(state).level);