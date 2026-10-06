import { create } from 'zustand';

/**
 * Interface shell state: the modal stack, transient toasts and the shared
 * viewport flag. Deliberately holds no business data.
 *
 * Panels are a stack rather than a single value so the world can open a
 * location panel, which opens a job list, which opens a job detail, and ESC
 * still unwinds one layer at a time.
 */
let toastSequence = 0;

export const useUiStore = create((set, get) => ({
  /** @type {{ id: string, type: string, props: object }[]} */
  modalStack: [],
  toasts: [],
  menuOpen: false,
  isCompact: false,
  worldReady: false,

  openModal: (type, props = {}) =>
    set((state) => ({
      modalStack: [...state.modalStack, { id: `${type}-${Date.now()}-${state.modalStack.length}`, type, props }],
      menuOpen: false,
    })),

  /** Replace the top of the stack — used when one panel hands off to another. */
  replaceModal: (type, props = {}) =>
    set((state) => ({
      modalStack: [
        ...state.modalStack.slice(0, -1),
        { id: `${type}-${Date.now()}`, type, props },
      ],
    })),

  closeModal: () => set((state) => ({ modalStack: state.modalStack.slice(0, -1) })),
  closeAllModals: () => set({ modalStack: [] }),

  setMenuOpen: (menuOpen) => set({ menuOpen }),
  toggleMenu: () => set((state) => ({ menuOpen: !state.menuOpen })),
  setCompact: (isCompact) => set({ isCompact }),
  setWorldReady: (worldReady) => set({ worldReady }),

  /**
   * @param {{ title: string, body?: string, tone?: 'info'|'success'|'warning'|'danger', xp?: number, duration?: number }} toast
   */
  pushToast: (toast) => {
    toastSequence += 1;
    const id = `toast-${toastSequence}`;
    const duration = toast.duration ?? 4200;
    set((state) => ({ toasts: [...state.toasts, { id, tone: 'info', ...toast }] }));
    if (duration > 0) {
      setTimeout(() => get().dismissToast(id), duration);
    }
    return id;
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** True when any panel is open — the world uses it to release keyboard input. */
export const selectIsModalOpen = (state) => state.modalStack.length > 0;
export const selectTopModal = (state) => state.modalStack[state.modalStack.length - 1] ?? null;
