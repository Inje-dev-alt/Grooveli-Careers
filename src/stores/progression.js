import { useCareerStore } from './careerStore.js';
import { useMissionStore } from './missionStore.js';
import { useUiStore } from './uiStore.js';
import { useNotificationStore } from './notificationStore.js';
import {
  CAREER_EVENTS,
  EVENT_CONTEXT_KEY,
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
 * ## It is asynchronous, and the ordering is the point
 *
 * The event is recorded first and awaited, because every consequence is decided
 * by the backend's reply: the XP, the statistic, the ledger row and any
 * achievement all come back from one transaction. Missions are advanced *after*
 * it returns, because a mission's completion is re-derived from the events the
 * backend has recorded — asking it to pay before its event has landed gets a
 * refusal.
 *
 * Callers that do not need the result can leave the promise unawaited; it never
 * rejects. A failed event is reported in the result rather than thrown, because
 * most call sites fire from a `useEffect` where there is nobody to catch it, and
 * because the action the user took has usually already succeeded — only the
 * progression for it did not.
 *
 * `options` no longer includes `ledger` or `shareable`. Both were the browser
 * deciding what went on the record: the backend now writes a ledger row for
 * anything that paid and an activity row for every event, so the zero-XP ones a
 * candidate still needs to see — an application below the match range, a
 * rejection, a declined offer — appear in their career activity rather than in a
 * ledger of awards.
 *
 * @param {string} event one of CAREER_EVENTS
 * @param {{ once?: boolean, label?: string, silent?: boolean,
 *   context?: Record<string, unknown> }} [options]
 */
export async function recordCareerEvent(event, options = {}) {
  warnIfUnkeyed(event, options.context);

  const result = await useCareerStore.getState().recordEvent(event, options);
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

  // Achievements are decided in the same transaction as the award, so they
  // arrive with it rather than being evaluated by a second request.
  result.awardedAchievements.forEach((achievement) => {
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

  // Nothing was recorded, so nothing downstream can have advanced either.
  if (result.status === 'failed') return { ...result, missions: [] };

  // The context goes with the event: it decides which objectives listening for
  // it actually advance, the same way it decides what the award is keyed on.
  const touched = await useMissionStore.getState().advanceByEvent(event, 1, options.context ?? {});

  touched
    .filter((t) => t.justCompleted)
    .forEach(({ mission, xpAwarded, awardedAchievements = [] }) => {
      ui.pushToast({
        title: `Mission complete — ${mission.title}`,
        body: mission.reward,
        // The reward the backend actually paid, not the catalog's figure.
        xp: xpAwarded,
        tone: 'success',
        duration: 5600,
      });
      useNotificationStore.getState().push({
        type: 'mission',
        title: `Mission complete — ${mission.title}`,
        body: `You earned ${xpAwarded} XP.${mission.reward ? ` ${mission.reward}.` : ''}`,
        route: '/missions',
      });

      // A mission's own achievements come back from the mission endpoint, which
      // pays it through the same transaction a career event uses.
      awardedAchievements.forEach((achievement) => {
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
    });

  return { ...result, missions: touched };
}

/**
 * Applying is the one career event whose value depends on the job.
 *
 * Routing it through here keeps the "no XP for volume applications" rule in one
 * place rather than in every screen that can trigger an application. The
 * backend applies the same threshold to the same matching function; this decides
 * which event to send, and the backend decides what that event is worth.
 *
 * @param {import('../models/index.js').Job} job
 * @param {string} applicationId the row the application created - what the
 *        award is keyed on, so one application counts once however many times
 *        the button is pressed
 */
export function recordApplication(job, applicationId) {
  const suitable = isSuitableApplication(job);

  return recordCareerEvent(
    suitable ? CAREER_EVENTS.SUITABLE_JOB_APPLIED : CAREER_EVENTS.UNSUITABLE_JOB_APPLIED,
    {
      label: suitable
        ? `Applied for ${job.title}`
        : `Applied for ${job.title} — below your match range, no XP`,
      silent: !suitable,
      context: { applicationId, jobId: job.id },
    },
  );
}

/** What an event is worth, for interfaces that want to say so in advance. */
export function xpFor(event) {
  return XP_REWARDS[event] ?? 0;
}

/**
 * Shout in development when an event is fired without the field it is keyed on.
 *
 * Getting this wrong is quiet and expensive. The backend keys each award on the
 * thing the event was about, so a missing field means either a 400 (for an
 * XP-bearing event) or an award that is no longer distinct — "visit five
 * districts" silently becoming "visit one district five times". Neither shows
 * up as a broken screen, so the warning is here rather than in a code review.
 */
function warnIfUnkeyed(event, context) {
  if (!import.meta.env?.DEV) return;
  const field = EVENT_CONTEXT_KEY[event];
  if (!field) return;
  if (context && String(context[field] ?? '').trim()) return;
  console.warn(
    `[progression] ${event} fired without context.${field}. The award cannot be keyed to ` +
      'what it was about, so it will either be refused or stop being counted once per thing. ' +
      'See EVENT_CONTEXT_KEY in src/utils/careerEvents.js.',
  );
}
