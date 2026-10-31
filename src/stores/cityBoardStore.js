import { create } from 'zustand';
import { countOpenRolesByDistrict } from '../services/jobService.js';

/**
 * What the city's notice boards are showing.
 *
 * The world never calls a service directly — Phaser reads stores and React
 * fills them. Keeping that direction means the boards work the same whether
 * the numbers came from the mock layer or from a live backend, and the scene
 * has no opinion about which.
 *
 * A failed load leaves `openRoles` empty rather than throwing. A notice board
 * with no number on it is a board that has not been updated, which is a thing
 * that happens to real notice boards; an exception here would take the whole
 * city down for the sake of one integer.
 */
export const useCityBoardStore = create((set) => ({
  /** @type {Record<string, number>} */
  openRoles: {},
  status: 'idle',

  load: async () => {
    set({ status: 'loading' });
    try {
      set({ openRoles: await countOpenRolesByDistrict(), status: 'ready' });
    } catch {
      set({ openRoles: {}, status: 'error' });
    }
  },
}));
