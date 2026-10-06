import { useCareerStore } from './careerStore.js';
import { useMissionStore } from './missionStore.js';
import { useUiStore } from './uiStore.js';
import { useNotificationStore } from './notificationStore.js';
import { CAREER_EVENTS, EVENT_LABELS, isSuitableApplication } from '../utils/careerEvents.js';

/**
 * The one function the rest of the app calls when the player does something
 * that matters to their career.
 *
 * It fans a single event out to XP, missions and the notice surface, which
 * keeps those three systems unaware of each other and keeps every feature from
 * having to remember all three. Screens call this; they never award XP directly.
 *
 * @param {string} event one of CAREER_EVENTS
 * @param {{ once?: boolean, label?: string, silent?: boolean, reputation?: number }} [options]
 */
export function recordCareerEvent(event, options = {}) {
  const result = useCareerStore.getState().recordEvent(event, options);
  const touched = useMissionStore.getState().advanceByEvent(event);
  const ui = useUiStore.getState();

  if (!options.silent && result.xp > 0) {
    ui.pushToast({
      title: options.label || EVENT_LABELS[event] || 'Career activity recorded',
      xp: result.xp,
      tone: 'success',
    });
  }

  if (result.levelledUp) {
    ui.pushToast({
      title: `Career level ${result.level}`,
      body: 'Your profile now ranks higher with employers in Grooveli City.',
      tone: 'info',
      duration: 5600,
    });
  }

  touched
    .filter((t) => t.justCompleted)
    .forEach(({ mission }) => {
      ui.pushToast({
        title: `Mission complete — ${mission.title}`,
        body: mission.reward,
        xp: mission.xpReward,
        tone: 'success',
        duration: 5600,
      });
      useNotificationStore.getState().push({
        type: 'mission',
        title: `Mission complete — ${mission.title}`,
        body: `You earned ${mission.xpReward} XP.${mission.reward ? ` ${mission.reward}.` : ''}`,
        route: '/missions',
      });
    });

  return { ...result, missions: touched };
}

/**
 * Applying to a job is the one career event whose value depends on the job.
 * Routing it through here keeps the "no XP for spam applications" rule in one
 * place instead of in every screen that can trigger an application.
 *
 * @param {import('../models/index.js').Job} job
 */
export function recordApplication(job) {
  const suitable = isSuitableApplication(job);
  return recordCareerEvent(
    suitable ? CAREER_EVENTS.SUITABLE_JOB_APPLIED : CAREER_EVENTS.UNSUITABLE_JOB_APPLIED,
    {
      label: suitable
        ? `Applied to ${job.title}`
        : `Applied to ${job.title} — below your match range, no XP`,
      silent: !suitable,
      // Logged either way: the candidate should be able to see that an
      // application was made and why it earned nothing.
      ledger: true,
    },
  );
}
