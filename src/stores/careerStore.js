import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeJsonStorage } from '../utils/storage.js';
import { XP_REWARDS, EVENT_LABELS } from '../utils/careerEvents.js';
import { resolveProgression, careerTitleForLevel } from '../utils/progression.js';
import { careerStats } from '../mock/users.js';

/**
 * Career progression.
 *
 * TEMPORARY PERSISTENCE. XP and the activity ledger are written to
 * localStorage so a reload does not wipe the player's progress during the
 * prototype. The backend owns this permanently — see `POST /career/events` in
 * the handoff document. When that endpoint exists, `recordEvent` posts to it
 * and the persist middleware comes off; nothing else changes.
 *
 * The store deliberately refuses to award XP for anything not in `XP_REWARDS`,
 * and the reward table deliberately values spam applications at zero.
 */
const STARTING_XP = careerStats.xp;

export const useCareerStore = create()(
  persist(
    (set, get) => ({
      xp: STARTING_XP,
      reputation: careerStats.reputation,
      /** @type {{ id: string, event: string, label: string, xp: number, at: string }[]} */
      ledger: [],
      /** Events that should only ever count once, regardless of how often fired. */
      oneTimeEvents: [],

      /**
       * Record a career activity and award whatever it is worth.
       *
       * `ledger` defaults to "anything that earned XP". Pass it explicitly for
       * an activity worth zero that the user still needs to see explained — an
       * application below the match threshold, for instance. Passive events
       * (viewing a job, walking into a district) stay out of the ledger, which
       * is a record of career activity rather than a click log.
       *
       * @param {string} event one of CAREER_EVENTS
       * @param {{ once?: boolean, label?: string, reputation?: number, ledger?: boolean }} [options]
       * @returns {{ xp: number, levelledUp: boolean, level: number, reason?: string }}
       */
      recordEvent: (event, options = {}) => {
        const before = resolveProgression(get().xp);

        if (options.once && get().oneTimeEvents.includes(event)) {
          return { xp: 0, levelledUp: false, level: before.level, reason: 'already-counted' };
        }

        const xp = XP_REWARDS[event] ?? 0;
        const shouldLog = options.ledger ?? xp > 0;
        const entry = {
          id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          event,
          label: options.label || EVENT_LABELS[event] || event,
          xp,
          at: new Date().toISOString(),
        };

        set((state) => ({
          xp: state.xp + xp,
          reputation: Math.min(100, state.reputation + (options.reputation ?? 0)),
          ledger: shouldLog ? [entry, ...state.ledger].slice(0, 60) : state.ledger,
          oneTimeEvents: options.once ? [...state.oneTimeEvents, event] : state.oneTimeEvents,
        }));

        const after = resolveProgression(get().xp);
        return {
          xp,
          levelledUp: after.level > before.level,
          level: after.level,
          reason: xp === 0 ? 'no-xp-for-event' : undefined,
        };
      },

      /** Bonus XP from a completed mission, which is not itself a career event. */
      awardMissionXp: (missionTitle, amount) => {
        const before = resolveProgression(get().xp);
        set((state) => ({
          xp: state.xp + amount,
          reputation: Math.min(100, state.reputation + 1),
          ledger: [
            {
              id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              event: 'mission.completed',
              label: `Mission complete — ${missionTitle}`,
              xp: amount,
              at: new Date().toISOString(),
            },
            ...state.ledger,
          ].slice(0, 60),
        }));
        const after = resolveProgression(get().xp);
        return { xp: amount, levelledUp: after.level > before.level, level: after.level };
      },

      hasRecorded: (event) => get().oneTimeEvents.includes(event),

      resetProgress: () =>
        set({ xp: STARTING_XP, reputation: careerStats.reputation, ledger: [], oneTimeEvents: [] }),
    }),
    {
      name: 'career-progress',
      storage: createJSONStorage(() => safeJsonStorage),
      version: 1,
      partialize: (state) => ({
        xp: state.xp,
        reputation: state.reputation,
        ledger: state.ledger,
        oneTimeEvents: state.oneTimeEvents,
      }),
    },
  ),
);

/**
 * Derived progression — level, XP into level, progress to next.
 *
 * Memoised on `xp`. Zustand compares snapshots by reference, so a selector that
 * builds a fresh object every call re-renders forever; caching the last result
 * keeps the selector referentially stable between XP changes.
 */
let progressionCache = { xp: null, value: null };

export const selectProgression = (state) => {
  if (progressionCache.xp !== state.xp) {
    progressionCache = { xp: state.xp, value: resolveProgression(state.xp) };
  }
  return progressionCache.value;
};

export const selectCareerTitle = (state) => careerTitleForLevel(selectProgression(state).level);

