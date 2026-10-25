import { create } from 'zustand';
import * as missionService from '../services/missionService.js';
import { useCareerStore } from './careerStore.js';
import { CAREER_EVENTS, contextSatisfies } from '../utils/careerEvents.js';

/**
 * Mission state.
 *
 * Definitions are loaded from the service layer; progress is derived from
 * career events. A mission never listens for a specific action — it declares
 * which event advances each objective, and `advanceByEvent` matches. Adding a
 * mission is therefore a data change, not a code change.
 *
 * Progress comes from the service too, so it belongs to the account rather than
 * to the browser: switching accounts must not inherit a stranger's half-finished
 * missions.
 *
 * ## What this store no longer does
 *
 * `advanceByEvent` used to award the mission's XP itself — it read
 * `mission.xpReward` from the catalog it had been served and passed it to
 * `careerStore.awardMissionXp`. Both halves of that were wrong: the number came
 * from data the browser was holding, and the award happened whether or not the
 * backend agreed the mission was finished.
 *
 * Now the local counts are a **projection**, kept so a part-finished mission
 * draws correctly and survives a reload, and completion is a request. The
 * backend recounts the objectives against the career events it recorded, pays
 * the reward from its own catalog row, and answers with the new totals. If it
 * disagrees — the projection ran ahead, or the events were never recorded — it
 * answers 409 and the mission is put back the way the backend sees it.
 */
export const useMissionStore = create((set, get) => ({
  /** @type {import('../models/index.js').Mission[]} */
  missions: [],
  /** @type {Record<string, import('../models/index.js').MissionProgress>} */
  progress: {},
  status: 'idle',
  error: null,

  loadMissions: async () => {
    if (get().status === 'loading') return get().missions;
    set({ status: 'loading', error: null });
    try {
      const [missions, progress] = await Promise.all([
        missionService.listMissions(),
        missionService.getMissionProgress().catch(() => ({})),
      ]);
      set({ missions, progress, status: 'ready' });
      return missions;
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not load missions.' });
      return [];
    }
  },

  /** Clear on sign-out. */
  reset: () => set({ missions: [], progress: {}, status: 'idle', error: null }),

  /** @returns {import('../models/index.js').MissionProgress} */
  getProgress: (missionId) =>
    get().progress[missionId] ?? { missionId, status: 'available', objectiveCounts: {} },

  completedObjectiveCount: (mission) => {
    const counts = get().getProgress(mission.id).objectiveCounts;
    return mission.objectives.filter((o) => (counts[o.id] ?? 0) >= o.target).length;
  },

  isComplete: (mission) =>
    mission.objectives.length > 0 &&
    get().completedObjectiveCount(mission) === mission.objectives.length,

  /**
   * Advance every objective across every mission that listens for `event`, and
   * ask the backend to pay anything that finished.
   *
   * Call this *after* the career event itself has been recorded: completion is
   * checked against the events the backend holds, so a mission asked for before
   * its event has landed is refused.
   *
   * `context` is the event's own context, and it decides *which* objectives
   * listening for that event advance. Four skill missions listen for
   * `skill.challenge` and each names its own skill, so without it one pass
   * would draw a full bar on all four and the server would then refuse three —
   * visible as three missions completing and un-completing.
   *
   * @param {string} event
   * @param {number} [amount]
   * @param {Record<string, unknown>} [context]
   * @returns {Promise<{ mission: import('../models/index.js').Mission,
   *   justCompleted: boolean, xpAwarded?: number, awardedAchievements?: object[],
   *   outstanding?: object[] }[]>}
   */
  advanceByEvent: async (event, amount = 1, context = {}) => {
    const { missions, progress } = get();
    const touched = [];
    const nextProgress = { ...progress };

    missions.forEach((mission) => {
      const listening = mission.objectives.filter(
        (o) => o.event === event && contextSatisfies(o.context, context),
      );
      if (listening.length === 0) return;

      const current = nextProgress[mission.id] ?? {
        missionId: mission.id,
        status: 'active',
        objectiveCounts: {},
      };
      if (current.status === 'completed') return;

      const counts = { ...current.objectiveCounts };
      let changed = false;

      listening.forEach((objective) => {
        const value = counts[objective.id] ?? 0;
        if (value >= objective.target) return;
        counts[objective.id] = Math.min(objective.target, value + amount);
        changed = true;
      });

      if (!changed) return;

      const allDone = mission.objectives.every((o) => (counts[o.id] ?? 0) >= o.target);
      nextProgress[mission.id] = {
        ...current,
        status: allDone ? 'completed' : 'active',
        objectiveCounts: counts,
        completedAt: allDone ? new Date().toISOString() : current.completedAt,
      };
      touched.push({ mission, justCompleted: allDone });
    });

    if (touched.length === 0) return [];

    set({ progress: nextProgress });
    missionService.saveMissionProgress(nextProgress).catch(() => {});

    const finished = touched.filter((t) => t.justCompleted);
    if (finished.length === 0) return touched;

    // One request per finished mission, because each is paid from its own
    // catalog row. Settled rather than awaited in turn so one refusal does not
    // hide another mission's award.
    const paid = await Promise.all(
      finished.map(async (entry) => {
        try {
          const result = await missionService.completeMission(entry.mission.id);
          // The reward reaches the career store as the backend's own totals,
          // through the same path a career event takes.
          useCareerStore.getState().absorb(result, {
            event: CAREER_EVENTS.MISSION_COMPLETED,
            label: `Mission complete - ${entry.mission.title}`,
          });
          const applied = result.status === 'applied';
          return {
            ...entry,
            justCompleted: applied,
            // Read from the status, not the amount: a replay reports what the
            // mission was once worth on some server versions, and a toast
            // claiming XP nobody just earned is worse than no toast. See
            // `awardOf` in careerStore.js.
            xpAwarded: applied ? result.xpAwarded ?? 0 : 0,
            awardedAchievements: result.awardedAchievements ?? [],
          };
        } catch (error) {
          get().reconcile(entry.mission, error);
          return { ...entry, justCompleted: false, outstanding: error.details?.outstanding };
        }
      }),
    );

    const byId = new Map(paid.map((entry) => [entry.mission.id, entry]));
    return touched.map((entry) => byId.get(entry.mission.id) ?? entry);
  },

  /**
   * Put a mission back the way the backend sees it after a refused completion.
   *
   * A 409 means the projection was ahead of the record — the objectives are not
   * met by the events the backend holds. Leaving the mission marked complete
   * would show a finished mission that was never paid, which is the one state
   * worse than showing it unfinished. Any other failure (offline, 500) leaves
   * the counts alone: the work was done, and the next load will reconcile.
   */
  reconcile: (mission, error) => {
    if (error?.status !== 409) return;

    const outstanding = error.details?.outstanding ?? [];
    const byObjective = new Map(outstanding.map((o) => [o.id, o]));

    set((state) => {
      const current = state.progress[mission.id];
      if (!current) return state;

      const counts = { ...current.objectiveCounts };
      mission.objectives.forEach((objective) => {
        const told = byObjective.get(objective.id);
        if (told) counts[objective.id] = told.done;
      });

      return {
        progress: {
          ...state.progress,
          [mission.id]: {
            ...current,
            status: 'active',
            objectiveCounts: counts,
            completedAt: undefined,
          },
        },
      };
    });

    missionService.saveMissionProgress(get().progress).catch(() => {});
  },

  /**
   * Advance one objective to its target.
   *
   * It cannot *grant* an objective, whatever the name suggests, and has no
   * callers today. All it moves is the local projection; the backend still
   * recounts the objective against the career events it recorded, so calling
   * this for work that was never done ends in a 409 and a rollback. Use it only
   * to catch the projection up with an event that has already been recorded —
   * and prefer `recordCareerEvent`, which does both in the right order.
   */
  completeObjective: (missionId, objectiveId) => {
    const mission = get().missions.find((m) => m.id === missionId);
    const objective = mission?.objectives.find((o) => o.id === objectiveId);
    if (!objective) return Promise.resolve([]);
    // Its own context, or an objective carrying a discriminator would filter
    // itself out of the advance it just asked for.
    const context = objective.context ? { [objective.context.key]: objective.context.value } : {};
    return get().advanceByEvent(objective.event, objective.target, context);
  },
}));

/**
 * Open missions. Memoised on the two inputs it derives from: a selector that
 * builds a fresh array every call would re-render without end.
 */
let activeCache = { missions: null, progress: null, value: [] };

export const selectActiveMissions = (state) => {
  if (activeCache.missions !== state.missions || activeCache.progress !== state.progress) {
    activeCache = {
      missions: state.missions,
      progress: state.progress,
      value: state.missions.filter((m) => state.progress[m.id]?.status !== 'completed'),
    };
  }
  return activeCache.value;
};

export const selectCompletedMissionCount = (state) =>
  Object.values(state.progress).filter((p) => p.status === 'completed').length;
