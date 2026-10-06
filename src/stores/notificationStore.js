import { create } from 'zustand';
import * as notificationService from '../services/notificationService.js';

/** Notification feed for the HUD bell and the apartment phone. */
export const useNotificationStore = create((set, get) => ({
  /** @type {import('../models/index.js').Notification[]} */
  items: [],
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const items = await notificationService.listNotifications();
      set({ items, status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not load notifications.' });
    }
  },

  unreadCount: () => get().items.filter((n) => !n.read).length,

  markRead: async (id) => {
    set((state) => ({
      items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
    await notificationService.markNotificationRead(id).catch(() => {});
  },

  markAllRead: async () => {
    set((state) => ({ items: state.items.map((n) => ({ ...n, read: true })) }));
    await notificationService.markAllNotificationsRead().catch(() => {});
  },

  /** Locally raised notice — e.g. a mission completing while the player plays. */
  push: (notification) =>
    set((state) => ({
      items: [
        {
          id: `ntf-local-${Date.now()}`,
          createdAt: new Date().toISOString(),
          read: false,
          type: 'system',
          ...notification,
        },
        ...state.items,
      ],
    })),
}));
