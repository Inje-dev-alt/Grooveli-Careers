import { useCareerStore } from './careerStore.js';
import { useMissionStore } from './missionStore.js';
import { useUiStore } from './uiStore.js';
import { useNotificationStore } from './notificationStore.js';
import * as careerService from '../services/careerService.js';
import {
  CAREER_EVENTS,
  EVENT_LABELS,
  XP_REWARDS,
  isSuitableApplication,
} from '../utils/careerEvents.js';

/**
 * The one function the rest of the app calls when someone does something that
 * matters to their career.
 *
 * It fans a single event out to XP, reputation, missions, achievements, the
 * activity stream and the notice surface. That keeps those systems unaware of
 * each other, and keeps every feature from having to remember all six. Screens
 * call this; they never award XP directly.
 *
 * @param {string} event one of CAREER_EVENTS
 * @param {{ once?: boolean, label?: string, silent?: boolean, ledger?: boolean, shareable?: boolean }} [options]
 */
export function recordCareerEvent(event, options = {}) {
  const result = useCareerStore.getState().recordEvent(event, options);
  const touched = useMissionStore.getState().advanceByEvent(event);
  const ui = useUiStore.getState();
  const label = options.label || EVENT_LABELS[event] || event;

  if (!options.silent && result.xp > 0) {
    ui.pushToast({ title: label, xp: result.xp, tone: 'success' });
  }

  if (result.levelledUp) {
    ui.pushToast({
      title: `Career level ${result.level}`,
      body: 'Your profile now ranks higher with employers in Grooveli City.',
      tone: 'info',
      duration: 5600,
    });
  }

  // Anything worth XP is career work, so it belongs in the activity stream —
  // which is what the network later turns into social proof.
  if (result.xp > 0 || options.shareable) {
    careerService
      .recordActivity({ type: event, label, xp: result.xp, shareable: true })
      .catch(() => {});
  }

  // Achievements listen to the same vocabulary as missions.
  careerService
    .awardAchievementsFor(event)
    .then((won) => {
      won.forEach((achievement) => {
        ui.pushToast({
          title: `Achievement — ${achievement.name}`,
          body: achievement.description,
          tone: 'success',
          duration: 5200,
        });
        useNotificationStore.getState().push({
          type: 'mission',
          title: `Achievement unlocked — ${achievement.name}`,
          body: achievement.description,
          route: '/profile',
        });
      });
    })
    .catch(() => {});

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
      careerService.bumpStat('completedMissions').catch(() => {});
      recordCareerEvent(CAREER_EVENTS.MISSION_COMPLETED, {
        label: `Completed ${mission.title}`,
        silent: true,
        shareable: true,
      });
    });

  return { ...result, missions: touched };
}

/**
 * Applying is the one career event whose value depends on the job.
 *
 * Routing it through here keeps the "no XP for volume applications" rule in one
 * place rather than in every screen that can trigger an application.
 *
 * @param {import('../models/index.js').Job} job
 */
export function recordApplication(job) {
  const suitable = isSuitableApplication(job);
  careerService.bumpStat('applications').catch(() => {});

  return recordCareerEvent(
    suitable ? CAREER_EVENTS.SUITABLE_JOB_APPLIED : CAREER_EVENTS.UNSUITABLE_JOB_APPLIED,
    {
      label: suitable
        ? `Applied for ${job.title}`
        : `Applied for ${job.title} — below your match range, no XP`,
      silent: !suitable,
      // Logged either way: the candidate should see that an application was
      // made, and why it earned nothing.
      ledger: true,
    },
  );
}

/** What an event is worth, for interfaces that want to say so in advance. */
export function xpFor(event) {
  return XP_REWARDS[event] ?? 0;
}
