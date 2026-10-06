/**
 * In-memory stand-in for the backend, for the duration of the prototype.
 *
 * This exists so the mock services can behave like a real API — an application
 * you submit shows up in the applications list afterwards, a saved job stays
 * saved — without the UI layer pretending to own business data. It is session
 * scoped on purpose: nothing here is persisted, because persistence is the
 * backend's job. The only thing the frontend persists locally is progression
 * (see `careerStore`), and that is explicitly flagged as temporary.
 *
 * Delete this file when the API lands.
 */
import { jobs as seedJobs } from '../mock/jobs.js';
import { companies as seedCompanies } from '../mock/companies.js';
import { applications as seedApplications, interviews as seedInterviews } from '../mock/applications.js';
import { notifications as seedNotifications } from '../mock/notifications.js';
import { missions as seedMissions } from '../mock/missions.js';
import { candidateProfile, careerStats, currentUser, achievements } from '../mock/users.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const db = {
  user: clone(currentUser),
  profile: clone(candidateProfile),
  stats: clone(careerStats),
  achievements: clone(achievements),
  jobs: clone(seedJobs),
  companies: clone(seedCompanies),
  missions: clone(seedMissions),
  applications: clone(seedApplications),
  interviews: clone(seedInterviews),
  notifications: clone(seedNotifications),
  savedJobIds: new Set(),
};

let sequence = 1000;
export function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}
