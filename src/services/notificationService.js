/**
 * Notifications.
 * Backed by `GET /notifications`, `POST /notifications/:id/read`,
 * `POST /notifications/read-all`.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';

function rows() {
  const id = currentAccount()?.id;
  if (!id) return [];
  return (db.notificationsByUser[id] = db.notificationsByUser[id] ?? []);
}

/** @returns {Promise<import('../models/index.js').Notification[]>} */
export function listNotifications() {
  return withMock(
    async () => {
      await delay(240);
      return [...rows()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    () => apiClient.get('/notifications'),
  );
}

export function markNotificationRead(notificationId) {
  return withMock(
    async () => {
      await delay(120);
      const notification = rows().find((n) => n.id === notificationId);
      if (notification) notification.read = true;
      return notification ? { ...notification } : null;
    },
    () => apiClient.post(`/notifications/${notificationId}/read`),
  );
}

export function markAllNotificationsRead() {
  return withMock(
    async () => {
      await delay(160);
      rows().forEach((n) => {
        n.read = true;
      });
      return [...rows()];
    },
    () => apiClient.post('/notifications/read-all'),
  );
}