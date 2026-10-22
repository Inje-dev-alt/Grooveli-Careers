/**
 * Courses, enrolments and certifications.
 * Backed by `GET /learning/courses`, `GET /learning/enrollments`,
 * `POST /learning/courses/:id/enrol`, `POST /learning/courses/:id/complete`.
 *
 * Enrolment state lives in the backend (`course_enrollments`) rather than in
 * a click: a course can only be completed once, the certification count is a
 * fact about the account, and the mission objective that listens for
 * `course.completed` cannot be farmed by re-clicking a card.
 */
import { apiClient, withMock } from './apiClient.js';
import { delay } from '../utils/delay.js';
import { courses as seedCourses } from '../mock/courses.js';
import { db, currentAccount, nextId } from './mockDb.js';
import { signedInCareerPathId } from './candidateService.js';

function enrollmentsForUser() {
  const id = currentAccount()?.id;
  if (!id) return [];
  return (db.enrollments[id] = db.enrollments[id] ?? []);
}

export function listCourses(filters = {}) {
  return withMock(
    async () => {
      await delay();
      const enrolled = enrollmentsForUser();
      const myPathId = filters.pathId ?? signedInCareerPathId();
      return seedCourses
        .filter((course) => !filters.skill || course.skill === filters.skill)
        .map((course) => {
          const enrolment = enrolled.find((e) => e.courseId === course.id);
          return { ...course, enrolled: Boolean(enrolment), completed: enrolment?.status === 'completed' };
        })
        // The Training Center recommends from the catalogue; the path a
        // candidate is on decides what they see first. Sort is stable, so
        // everything else keeps its catalogue order.
        .sort((a, b) => Number(b.pathIds?.includes(myPathId)) - Number(a.pathIds?.includes(myPathId)));
    },
    () => apiClient.get('/learning/courses', { params: filters }),
  );
}

/** @returns {Promise<{ courseId: string, status: string, completedAt: string | null }[]>} */
export function listEnrollments() {
  return withMock(
    async () => {
      await delay(120);
      return [...enrollmentsForUser()];
    },
    () => apiClient.get('/learning/enrollments'),
  );
}

/** Start a course. Idempotent - enrolling twice returns the existing row. */
export function enrolInCourse(courseId) {
  return withMock(
    async () => {
      await delay(240);
      const rows = enrollmentsForUser();
      const existing = rows.find((e) => e.courseId === courseId);
      if (existing) return { ...existing };
      const enrolment = { id: nextId('enr'), courseId, status: 'enrolled', enrolledAt: new Date().toISOString(), completedAt: null };
      rows.push(enrolment);
      return { ...enrolment };
    },
    () => apiClient.post(`/learning/courses/${courseId}/enrol`),
  );
}

/**
 * Complete a course. Completing twice is a no-op - the certification count
 * and the course.completed event must never double-count.
 *
 * @returns {Promise<{ courseId: string, alreadyCompleted: boolean, completedAt: string | null }>}
 */
export function completeCourse(courseId) {
  return withMock(
    async () => {
      await delay(800);
      const id = currentAccount()?.id;
      if (!id) throw new Error('Your session has expired. Sign in again.');
      const rows = enrollmentsForUser();
      let enrolment = rows.find((e) => e.courseId === courseId);
      if (enrolment?.status === 'completed') {
        return { courseId, alreadyCompleted: true, completedAt: enrolment.completedAt };
      }
      if (!enrolment) {
        enrolment = { id: nextId('enr'), courseId, status: 'enrolled', enrolledAt: new Date().toISOString(), completedAt: null };
        rows.push(enrolment);
      }
      const stamp = new Date().toISOString();
      enrolment.status = 'completed';
      enrolment.completedAt = stamp;
      db.careerStats[id] = { completedMissions: 0, certifications: 0, applications: 0, interviews: 0, offers: 0, jobsViewed: 0, locationsVisited: 0, ...(db.careerStats[id] ?? {}) };
      db.careerStats[id].certifications += 1;
      return { courseId, alreadyCompleted: false, completedAt: stamp };
    },
    () => apiClient.post(`/learning/courses/${courseId}/complete`),
  );
}