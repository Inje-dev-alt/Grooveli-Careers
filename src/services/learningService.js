/**
 * Courses and certifications.
 * Backed by `GET /learning/courses`, `POST /learning/courses/:id/complete`.
 */
import { apiClient, withMock } from './apiClient.js';
import { delay } from '../utils/delay.js';
import { courses as seedCourses } from '../mock/courses.js';
import { db } from './mockDb.js';

export function listCourses(filters = {}) {
  return withMock(
    async () => {
      await delay();
      return seedCourses.filter((course) => !filters.skill || course.skill === filters.skill);
    },
    () => apiClient.get('/learning/courses', { params: filters }),
  );
}

/**
 * Complete a course. The backend awards the certification and the XP; here it
 * updates the session statistics so the profile stays consistent.
 */
export function completeCourse(courseId) {
  return withMock(
    async () => {
      await delay(800);
      db.stats.certifications += 1;
      return { courseId, completedAt: new Date().toISOString() };
    },
    () => apiClient.post(`/learning/courses/${courseId}/complete`),
  );
}
