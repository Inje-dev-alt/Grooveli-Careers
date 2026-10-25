/**
 * Applications, interviews and the living pipeline. Candidate side.
 * Backed by `POST /jobs/:id/apply`, `GET /applications`, `GET /interviews`,
 * `POST /applications/:id/respond`.
 *
 * Two product ideas live here:
 *
 * 1. THE PIPELINE MOVES WITHOUT YOU. On mock and partner jobs - every job in
 *    the prototype that is not published by a real employer - applications
 *    advance on a timer: review, then shortlist or rejection, then interview,
 *    then offer or a no with feedback. Real `grooveli_employer` jobs are never
 *    simulated: a live employer owns their timeline. In the prototype these
 *    windows are seconds so a demo can watch the city breathe; the backend
 *    contract documents them in days.
 *
 * 2. AN APPLICATION IS A STAGE MACHINE WITH A HISTORY. Every transition is
 *    appended to `application_events` - who moved it, from where, to where and
 *    why. That history is what the candidate sees as a timeline and what the
 *    rejection feedback hangs off.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId, currentAccount, currentUserId } from './mockDb.js';
import { delay } from '../utils/delay.js';

function candidateId() {
  return currentAccount()?.id ?? 'anonymous';
}

const now = () => new Date().toISOString();

/** Append a stage transition. One row per move, like the backend's table. */
export function recordStageChange(application, fromStatus, toStatus, actor, note) {
  const list = (db.applicationEvents[application.id] = db.applicationEvents[application.id] ?? []);
  list.push({
    id: nextId('ae'),
    applicationId: application.id,
    fromStatus,
    toStatus,
    actor,
    note: note ?? null,
    at: now(),
  });
}

/** Raise a notification for a real account (pool candidates have no inbox). */
export function notifyUser(userId, notification) {
  if (!userId || !userId.startsWith('usr-')) return;
  const rows = (db.notificationsByUser[userId] = db.notificationsByUser[userId] ?? []);
  rows.unshift({
    id: nextId('ntf'),
    userId,
    read: false,
    createdAt: now(),
    route: '/profile',
    ...notification,
  });
}

/* ------------------------------------------------- the simulation --- */

/** Prototype windows. The API contract expresses these in days. */
const SIM = {
  applied: { afterMs: 45_000, to: 'under-review' },
  'under-review': { afterMs: 90_000, decide: true },
  shortlisted: { afterMs: 60_000, to: 'interview' },
  interview: { afterMs: 120_000, decideFinal: true },
};

/** Deterministic 0-9 from the id, so an application's fate is stable. */
function fate(applicationId) {
  let hash = 0;
  for (let i = 0; i < applicationId.length; i += 1) {
    hash = (hash * 31 + applicationId.charCodeAt(i)) >>> 0;
  }
  return hash % 10;
}

const MID_FEEDBACK = [
  'Strong background for the role, but two other candidates carried deeper domain experience in the final trade-off.',
  'Good profile and clear application. The team went with someone who had already done this exact job twice.',
  'Screened positively; the panel wanted sharper examples on the assessment section. Worth another application next cycle.',
];

const FINAL_FEEDBACK = [
  'Reached the final round. Interview answers needed a number in each example - name the scale you worked at.',
  'Made the shortlist and interviewed well. The offer went to a candidate with a certification we had listed as essential.',
  'Close call. Structure was there; the follow-up questions exposed depth we needed on the technical side.',
];

/** Advance one application if its window has elapsed. Mutates in place. */
function simulateStep(application) {
  if (application.seeded) return;
  const job = db.jobs.find((j) => j.id === application.jobId);
  if (!job || (job.source !== 'mock' && job.source !== 'partner')) return;
  const step = SIM[application.status];
  if (!step) return;

  const entered = new Date(application.stageEnteredAt ?? application.updatedAt).getTime();
  if (Number.isNaN(entered) || Date.now() - entered < step.afterMs) return;

  const from = application.status;
  let to;
  let note;

  if (step.to) {
    to = step.to;
  } else if (step.decide) {
    const roll = fate(application.id);
    to = roll < 6 ? 'shortlisted' : 'rejected';
    if (to === 'rejected') note = MID_FEEDBACK[roll % MID_FEEDBACK.length];
  } else if (step.decideFinal) {
    const roll = fate(application.id);
    to = roll < 4 ? 'offer' : 'rejected';
    if (to === 'rejected') note = FINAL_FEEDBACK[roll % FINAL_FEEDBACK.length];
  }
  if (!to || to === from) return;

  application.status = to;
  application.stageEnteredAt = now();
  application.updatedAt = application.stageEnteredAt;
  if (note) {
    application.feedback = note;
    application.rejectionAcknowledged = false;
  }
  recordStageChange(application, from, to, 'system', note);

  const userId = application.candidateId;
  const notice = stageNotice(to, application.jobTitle, application.companyName);
  if (notice) notifyUser(userId, notice);

  if (userId === currentUserId()) {
    if (to === 'interview') bumpStatQuiet('interviews');
    else if (to === 'offer') bumpStatQuiet('offers');
  }
}

/**
 * What the candidate is told when their application reaches a stage.
 *
 * One table for both paths. The simulation had this copy per stage while
 * `organizationService.setApplicationStatus` wrote a flatter "moved to
 * shortlisted" for the same move made by a real employer — so a candidate got
 * a worse message when a person was behind it than when the timer was. The
 * server's `_shared/notify.ts` holds the same table and must not drift.
 *
 * `null` means no notice. `applied` is the candidate's own action, and
 * `withdrawn`, `declined` and `hired` are decisions they just made themselves.
 *
 * @param {string} status
 * @param {string} jobTitle
 * @param {string} companyName
 * @returns {{ type: string, title: string, body: string, route?: string } | null}
 */
export function stageNotice(status, jobTitle, companyName) {
  switch (status) {
    case 'under-review':
      return {
        type: 'application',
        title: `${companyName} is reviewing`,
        body: `${jobTitle} - your application moved from submitted to in review.`,
        route: '/profile',
      };
    case 'shortlisted':
      return {
        type: 'application',
        title: `Shortlisted - ${jobTitle}`,
        body: `${companyName} shortlisted you. The next stage is an interview.`,
        route: '/profile',
      };
    case 'interview':
      return {
        type: 'interview',
        title: `Interview stage - ${jobTitle}`,
        body: `${companyName} wants to interview you. Practise in the AI Career Center.`,
        route: '/ai',
      };
    case 'assessment':
      return {
        type: 'application',
        title: `Assessment stage - ${jobTitle}`,
        body: `${companyName} has sent you an assessment. Open your applications to start it.`,
        route: '/profile',
      };
    case 'offer':
      return {
        type: 'application',
        title: `Offer received - ${jobTitle}`,
        body: `${companyName} made you an offer. Open your applications to accept or decline.`,
        route: '/profile',
      };
    case 'rejected':
      return {
        type: 'application',
        title: `${companyName} decided not to progress`,
        body: `${jobTitle} - feedback is on your application. Rejections are data, not a verdict.`,
        route: '/profile',
      };
    default:
      return null;
  }
}

/**
 * The two career statistics no career event advances.
 *
 * `interviews` and `offers` move on application *stage* transitions, which the
 * pipeline drives — not on anything a candidate's browser can fire. They are
 * therefore deliberately absent from `STAT_FOR_EVENT`, and written here, where
 * the stage changes. On the real backend the pipeline does the same thing in
 * the same place; this is not a client-side counter standing in for one.
 */
function bumpStatQuiet(key) {
  const id = currentUserId();
  if (!id) return;
  db.careerStats[id] = { completedMissions: 0, certifications: 0, applications: 0, interviews: 0, offers: 0, jobsViewed: 0, locationsVisited: 0, ...(db.careerStats[id] ?? {}) };
  db.careerStats[id][key] = (db.careerStats[id][key] ?? 0) + 1;
}

/** Run every pending step for the signed-in candidate's applications. */
function simulatePipeline() {
  const me = candidateId();
  db.applications
    .filter((a) => a.candidateId === me)
    .forEach(simulateStep);
}

/* ----------------------------------------------------- endpoints --- */

/** @returns {Promise<import('../models/index.js').Application[]>} */
export function listApplications() {
  return withMock(
    async () => {
      await delay();
      simulatePipeline();
      const me = candidateId();
      return db.applications
        .filter((a) => a.candidateId === me)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    () => apiClient.get('/applications'),
  );
}

/**
 * Submit an application.
 *
 * Re-applying returns the existing record rather than creating a duplicate,
 * which is also the behaviour the backend should implement. The UI confirms
 * before calling this - applying is consequential and should never be a side
 * effect of a click somewhere else.
 *
 * @returns {Promise<import('../models/index.js').Application>}
 */
export function applyToJob(jobId, payload = {}) {
  return withMock(
    async () => {
      await delay(520);
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error('That role is no longer listed.');

      const me = candidateId();
      const existing = db.applications.find((a) => a.jobId === jobId && a.candidateId === me);
      if (existing) return { ...existing };

      const stamp = now();
      /** @type {import('../models/index.js').Application} */
      const application = {
        id: nextId('app'),
        jobId: job.id,
        jobTitle: job.title,
        organizationId: job.organizationId,
        companyName: job.companyName,
        candidateId: me,
        status: 'applied',
        appliedAt: stamp,
        updatedAt: stamp,
        stageEnteredAt: stamp,
        note: payload.note,
      };

      db.applications.unshift(application);
      recordStageChange(application, null, 'applied', 'candidate', payload.note);
      return { ...application };
    },
    () => apiClient.post(`/jobs/${jobId}/apply`, payload),
  );
}

export function withdrawApplication(applicationId) {
  return withMock(
    async () => {
      await delay(300);
      const application = db.applications.find((a) => a.id === applicationId);
      if (!application) throw new Error('That application no longer exists.');
      const from = application.status;
      application.status = 'withdrawn';
      application.updatedAt = now();
      recordStageChange(application, from, 'withdrawn', 'candidate');
      return { ...application };
    },
    () => apiClient.patch(`/applications/${applicationId}`, { status: 'withdrawn' }),
  );
}

/**
 * Accept or decline an offer. The XP award belongs to the caller - services
 * never award progression; the screen decides what the action was worth.
 *
 * @param {string} applicationId
 * @param {'accept' | 'decline'} decision
 * @returns {Promise<import('../models/index.js').Application>}
 */
export function respondToOffer(applicationId, decision) {
  return withMock(
    async () => {
      await delay(420);
      const application = db.applications.find((a) => a.id === applicationId);
      if (!application) throw new Error('That application no longer exists.');
      if (application.status !== 'offer') throw new Error('This offer is no longer open.');

      const from = application.status;
      application.status = decision === 'accept' ? 'hired' : 'declined';
      application.updatedAt = now();
      application.stageEnteredAt = application.updatedAt;
      recordStageChange(
        application,
        from,
        application.status,
        'candidate',
        decision === 'accept' ? 'Offer accepted.' : 'Offer declined by candidate.',
      );
      return { ...application };
    },
    () => apiClient.post(`/applications/${applicationId}/respond`, { decision }),
  );
}

/** Stop the rejection event from firing twice - the candidate has seen it. */
export function acknowledgeRejection(applicationId) {
  return withMock(
    async () => {
      const application = db.applications.find((a) => a.id === applicationId);
      if (application) application.rejectionAcknowledged = true;
      return application ? { ...application } : null;
    },
    () => apiClient.post(`/applications/${applicationId}/acknowledge`),
  );
}

/** The stage history behind one application, oldest first. */
export function listApplicationEvents(applicationId) {
  return withMock(
    async () => [...(db.applicationEvents[applicationId] ?? [])].sort((a, b) => new Date(a.at) - new Date(b.at)),
    () => apiClient.get(`/applications/${applicationId}/events`),
  );
}

/* ---------------------------------------------------- interviews --- */

/** @returns {Promise<import('../models/index.js').Interview[]>} */
export function listInterviews() {
  return withMock(
    async () => {
      await delay(240);
      const me = candidateId();
      return db.interviews
        .filter((i) => i.userId === me)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    },
    () => apiClient.get('/interviews'),
  );
}

/**
 * Record a completed interview simulation. The score comes from the AI service;
 * the frontend only reports completion.
 */
export function recordInterviewSimulation({ jobTitle, companyName, score }) {
  return withMock(
    async () => {
      await delay(300);
      const interview = {
        id: nextId('int'),
        userId: candidateId(),
        applicationId: '',
        companyName: companyName || 'Grooveli AI',
        jobTitle: jobTitle || 'Interview simulation',
        type: 'simulation',
        scheduledAt: now(),
        status: 'completed',
        score,
      };
      db.interviews.push(interview);
      return interview;
    },
    () => apiClient.post('/interviews/simulations', { jobTitle, companyName, score }),
  );
}