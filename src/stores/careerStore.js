import { create } from 'zustand';
import * as careerService from '../services/careerService.js';
import { EVENT_LABELS, ONE_SHOT_EVENTS } from '../utils/careerEvents.js';
import { resolveProgression, careerTitleForLevel } from '../utils/progression.js';

/**
 * Career progression.
 *
 * XP and reputation are separate numbers on purpose. XP measures progression -
 * what you have done. Reputation measures credibility - what an employer can
 * trust, and it only moves on work someone else could verify. Collapsing them
 * would make both meaningless.
 *
 * ## This store does no arithmetic
 *
 * It used to. `recordEvent` read the XP table, added the reward to the total,
 * wrote the ledger row itself and sent the new total up with `saveProgress` -
 * which meant the browser decided what it had earned, and the server wrote down
 * whatever it was told. The whole of that is gone. `recordEvent` now sends the
 * event, waits, and sets the totals to the ones that came back. There is no
 * code path left in the browser that can increase XP.
 *
 * The cost is that an award is no longer instant: a toast waits for the round
 * trip. That is the right trade here. XP is a credential a candidate shows an
 * employer, not a number that needs to feel responsive, and the alternative -
 * showing an optimistic figure and correcting it a moment later - means
 * sometimes showing one that was never earned.
 *
 * The store holds no seed data: progression is hydrated for the signed-in
 * account and a new account starts at zero. A career level that was handed out
 * rather than earned makes every number downstream a lie.
 */
const EMPTY = { xp: 0, reputation: 0 };
const LEDGER_LIMIT = 60;

/**
 * What a progression reply actually awarded, which is nothing unless it applied.
 *
 * `status` is the only trustworthy signal here, so it is read rather than the
 * amounts. An early version of `apply_career_event` reported the *original*
 * award on a replay — meaning a repeated skill challenge came back as
 * `xpAwarded: 100` having paid nothing, and the toast said "+100 XP" for XP
 * nobody earned. The server was fixed, but deriving the award from the status
 * costs nothing and means this store cannot be lied to by a deployment that
 * predates the fix, or by whatever the next such field turns out to mean.
 *
 * Totals were never at risk: they come from `progress` in the same reply.
 */
function awardOf(result) {
  if (result?.status !== 'applied') return { xp: 0, reputation: 0 };
  return { xp: result.xpAwarded ?? 0, reputation: result.reputationAwarded ?? 0 };
}

export const useCareerStore = create((set, get) => ({
  xp: 0,
  reputation: 0,
  /** @type {{ id: string, event: string, label: string, xp: number, at: string }[]} */
  ledger: [],
  /** Events the server has already counted once and will not count again. */
  oneTimeEvents: [],
  hydrated: false,
  /** Set when progression could not be loaded, so the HUD can say so. */
  error: null,

  /**
   * Load progression for the signed-in account.
   *
   * A failure is recorded rather than swallowed. This used to `catch {}` into
   * zeros, which with the API switched on and `/career/*` unreachable showed a
   * signed-in candidate level 1 and 0 XP, then "lost" the XP again on every
   * reload - with no error anywhere. Silent data loss costs more trust than a
   * visible outage, so the failure is now something the interface can report.
   */
  hydrate: async () => {
    try {
      const [progress, oneTimeEvents, ledger] = await Promise.all([
        careerService.getProgress(),
        careerService.getOneTimeEvents(),
        careerService.getLedger(),
      ]);
      set({
        xp: progress.xp ?? 0,
        reputation: progress.reputation ?? 0,
        oneTimeEvents,
        ledger,
        hydrated: true,
        error: null,
      });
      return progress;
    } catch (error) {
      set({
        ...EMPTY,
        oneTimeEvents: [],
        ledger: [],
        hydrated: true,
        error: error.message || 'Could not load your career progress.',
      });
      return null;
    }
  },

  /** Clear on sign-out so the next account does not inherit a stranger's career. */
  reset: () =>
    set({ ...EMPTY, ledger: [], oneTimeEvents: [], hydrated: false, error: null }),

  /**
   * Record a career activity and read back what it was worth.
   *
   * @param {string} event one of CAREER_EVENTS
   * @param {{ once?: boolean, label?: string, context?: Record<string, unknown> }} [options]
   * @returns {Promise<{ xp: number, reputation: number, levelledUp: boolean,
   *   level: number, status: string, awardedAchievements: object[], reason?: string }>}
   */
  recordEvent: async (event, options = {}) => {
    const before = resolveProgression(get().xp);

    // A one-shot event the account has already had counted is not worth a
    // request: the server would refuse it and answer `already_counted`. This is
    // a shortcut, not the guard - the guard is a unique index.
    if (ONE_SHOT_EVENTS.has(event) && get().oneTimeEvents.includes(event)) {
      return {
        xp: 0, reputation: 0, levelledUp: false, level: before.level,
        status: 'already_counted', awardedAchievements: [], reason: 'already-counted',
      };
    }

    let result;
    try {
      result = await careerService.recordEvent({ event, context: options.context ?? {} });
    } catch (error) {
      // Nothing was awarded, so nothing changes here. The caller decides
      // whether this is worth saying out loud - for a silent background event
      // it is not.
      return {
        xp: 0, reputation: 0, levelledUp: false, level: before.level,
        status: 'failed', awardedAchievements: [], reason: 'request-failed',
        error: error.message,
      };
    }

    get().absorb(result, { event, label: options.label });

    const after = resolveProgression(get().xp);
    const awarded = awardOf(result);
    return {
      xp: awarded.xp,
      reputation: awarded.reputation,
      levelledUp: after.level > before.level,
      level: after.level,
      status: result.status,
      awardedAchievements: result.awardedAchievements ?? [],
      stats: result.stats,
      reason:
        result.status !== 'applied'
          ? 'already-counted'
          : awarded.xp === 0
            ? 'no-xp-for-event'
            : undefined,
    };
  },

  /**
   * Take the totals from a progression reply and make them the store's.
   *
   * Shared by `recordEvent` and by the mission store, because
   * `POST /missions/:id/complete` pays a mission's own reward and returns the
   * same `progress` shape. Both arrive here so there is one place where
   * progression changes, and so a mission award cannot be applied by a
   * different rule than a career award.
   *
   * The ledger row is prepended from the server's own numbers rather than
   * refetched, so the drawer updates without a second round trip. `label` is
   * the contextual line the screen wanted to show ("Applied for Senior
   * Developer"); the server stores the generic one for the event, so after a
   * reload the ledger reads `Applied to a suitable role`. That is a known
   * cosmetic divergence, noted in the handoff - the alternative is accepting a
   * display string from the browser into a record of awards.
   *
   * @param {{ status: string, progress?: object, xpAwarded?: number, occurredAt?: string }} result
   * @param {{ event: string, label?: string }} meta
   */
  absorb: (result, meta) => {
    const progress = result?.progress;
    const xpAwarded = awardOf(result).xp;
    const applied = result?.status === 'applied';

    set((state) => {
      const logged = applied && xpAwarded !== 0;
      return {
        xp: progress?.xp ?? state.xp,
        reputation: progress?.reputation ?? state.reputation,
        ledger: logged
          ? [
              {
                id: `led-${result.eventId ?? Date.now()}`,
                event: meta.event,
                label: meta.label || EVENT_LABELS[meta.event] || meta.event,
                xp: xpAwarded,
                at: result.occurredAt ?? new Date().toISOString(),
              },
              ...state.ledger,
            ].slice(0, LEDGER_LIMIT)
          : state.ledger,
        oneTimeEvents:
          applied && ONE_SHOT_EVENTS.has(meta.event) && !state.oneTimeEvents.includes(meta.event)
            ? [...state.oneTimeEvents, meta.event]
            : state.oneTimeEvents,
      };
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
