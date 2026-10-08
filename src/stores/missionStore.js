import { create } from 'zustand';
import * as missionService from '../services/missionService.js';
import { useCareerStore } from './careerStore.js';

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
   * Advance every objective across every mission that listens for `event`.
   *
   * @param {string} event
   * @param {number} [amount]
   * @returns {{ mission: import('../models/index.js').Mission, justCompleted: boolean }[]}
   */
  advanceByEvent: (event, amount = 1) => {
    const { missions, progress } = get();
    const touched = [];
    const nextProgress = { ...progress };

    missions.forEach((mission) => {
      const listening = mission.objectives.filter((o) => o.event === event);
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

    // Completion is both an XP award and a write the backend needs to know about.
    touched
      .filter((t) => t.justCompleted)
      .forEach(({ mission }) => {
        useCareerStore.getState().awardMissionXp(mission.title, mission.xpReward);
        missionService.completeMission(mission.id).catch(() => {
          /* the local award stands; the backend reconciles on next load */
        });
      });

    return touched;
  },

  /** Directly mark one objective done — used by in-panel activities. */
  completeObjective: (missionId, objectiveId) => {
    const mission = get().missions.find((m) => m.id === missionId);
    const objective = mission?.objectives.find((o) => o.id === objectiveId);
    if (!objective) return [];
    return get().advanceByEvent(objective.event, objective.target);
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
