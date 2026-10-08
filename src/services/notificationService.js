/**
 * Notifications.
 * Backed by `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db } from './mockDb.js';
import { delay } from '../utils/delay.js';

/** @returns {Promise<import('../models/index.js').Notification[]>} */
export function listNotifications() {
  return withMock(
    async () => {
      await delay(240);
      return [...db.notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    () => apiClient.get('/notifications'),
  );
}

export function markNotificationRead(notificationId) {
  return withMock(
    async () => {
      await delay(120);
      const notification = db.notifications.find((n) => n.id === notificationId);
      if (notification) notification.read = true;
      return { ...notification };
    },
    () => apiClient.post(`/notifications/${notificationId}/read`),
  );
}

export function markAllNotificationsRead() {
  return withMock(
    async () => {
      await delay(160);
      db.notifications.forEach((n) => {
        n.read = true;
      });
      return [...db.notifications];
    },
    () => apiClient.post('/notifications/read-all'),
  );
}
