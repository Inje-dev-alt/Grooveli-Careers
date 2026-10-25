import { create } from 'zustand';
import * as chatService from '../services/chatService.js';

/**
 * Conversations, and the one that is open.
 *
 * POLLING IS THE PANEL'S, NOT THIS STORE'S. `poll()` fetches once; the
 * interval that calls it lives in `ChatPanel`'s own effect, so it starts when
 * a thread is on screen and is cleared when it is not. A closed panel costs
 * nothing — no socket, no background timer — which is the upside of the
 * transport presence chose.
 *
 * This used to be a module-level timer here, which meant `open()` started it
 * and the panel's unmount cleanup stopped it. That cleanup also cleared
 * `openId`, and in StrictMode React runs an effect's cleanup once DURING mount
 * before running the effect again — so opening a thread immediately closed it.
 * A cleanup that mutates shared state is not safe for that reason, and the fix
 * is not to special-case StrictMode but to let the component own only its own
 * timer: clearing and restarting an interval is idempotent, where clearing
 * somebody else's state is not.
 */

export const useChatStore = create((set, get) => ({
  /** @type {object[]} threads, newest activity first */
  conversations: [],
  status: 'idle',
  error: null,

  /** The thread the panel is showing, or null. */
  openId: null,
  /** Messages of the open thread, oldest first. */
  messages: [],
  messagesStatus: 'idle',
  /** Set when the server refuses a send — the one-message invite, or a block. */
  sendError: null,
  sending: false,

  loadConversations: async () => {
    set({ status: 'loading', error: null });
    try {
      set({ conversations: await chatService.listConversations(), status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not load your conversations.' });
    }
  },

  /**
   * Open a thread with someone, creating it if there is not one yet.
   *
   * Returns the thread so a caller can tell whether it worked without reading
   * the store back.
   */
  startWith: async (userId, { metScene = null, metLocationId = null } = {}) => {
    try {
      const thread = await chatService.openConversation(userId, { metScene, metLocationId });
      set((state) => ({
        conversations: [thread, ...state.conversations.filter((t) => t.id !== thread.id)],
      }));
      await get().open(thread.id);
      return thread;
    } catch (error) {
      set({ error: error.message || 'Could not start that conversation.' });
      return null;
    }
  },

  /** Show a thread, load it and mark it read. The panel starts its own poll. */
  open: async (conversationId) => {
    set({ openId: conversationId, messages: [], messagesStatus: 'loading', sendError: null });

    try {
      const messages = await chatService.listMessages(conversationId);
      // A late reply to a thread that has since been closed must not paint
      // itself over whatever is open now.
      if (get().openId !== conversationId) return;
      set({ messages, messagesStatus: 'ready' });
    } catch (error) {
      if (get().openId !== conversationId) return;
      set({ messagesStatus: 'error', error: error.message || 'Could not open that conversation.' });
      return;
    }

    get().markRead(conversationId);
  },

  /**
   * Stop showing a thread and go back to the list.
   *
   * An explicit action, never an unmount cleanup: it is called by the back
   * button and by whichever control opens the inbox, both of which are things
   * a person did.
   */
  close: () => set({ openId: null, messages: [], messagesStatus: 'idle', sendError: null }),

  /**
   * Ask for anything new in the open thread.
   *
   * Silent on failure: a dropped poll means the thread is a few seconds stale
   * and the next one fixes it, and an error banner over a conversation every
   * time the network hiccups would be worse than the staleness.
   */
  poll: async () => {
    const { openId, messages } = get();
    if (!openId) return;
    const since = messages.length ? messages[messages.length - 1].createdAt : null;

    try {
      const fresh = await chatService.listMessages(openId, { since });
      if (!fresh.length || get().openId !== openId) return;
      set((state) => {
        // `since` is exclusive server-side, but de-duplicating by id here
        // means a clock skew or a retry cannot double a message on screen.
        const seen = new Set(state.messages.map((m) => m.id));
        const added = fresh.filter((m) => !seen.has(m.id));
        return added.length ? { messages: [...state.messages, ...added] } : {};
      });
      get().markRead(openId);
    } catch {
      // Intentionally silent — see above.
    }
  },

  send: async (body) => {
    const { openId } = get();
    const text = body.trim();
    if (!openId || !text) return false;

    set({ sending: true, sendError: null });
    try {
      const message = await chatService.sendMessage(openId, text);
      set((state) => ({
        messages: state.messages.some((m) => m.id === message.id)
          ? state.messages
          : [...state.messages, message],
        sending: false,
      }));
      // The inbox's last-message line and ordering both change, and the thread
      // list is cheap next to getting them wrong.
      get().loadConversations();
      return true;
    } catch (error) {
      // Shown, not swallowed. A refusal here is the product talking — the
      // one-message invite, the rate limit or a block — and each has something
      // the sender needs to read.
      set({ sending: false, sendError: error.message || 'That message was not sent.' });
      return false;
    }
  },

  markRead: async (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((t) =>
        t.id === conversationId ? { ...t, unread: 0 } : t,
      ),
    }));
    await chatService.markConversationRead(conversationId).catch(() => {});
  },

  report: async (reason) => {
    const { openId } = get();
    if (!openId) return false;
    try {
      await chatService.reportConversation(openId, reason);
      return true;
    } catch (error) {
      set({ sendError: error.message || 'Could not send that report.' });
      return false;
    }
  },

  /** Clear on sign-out, so the next account does not read a stranger's messages. */
  reset: () =>
    set({
      conversations: [],
      status: 'idle',
      error: null,
      openId: null,
      messages: [],
      messagesStatus: 'idle',
      sendError: null,
      sending: false,
    }),
}));

/** Messages waiting across every thread — what a badge would show. */
export const selectUnreadMessages = (state) =>
  state.conversations.reduce((total, thread) => total + (thread.unread ?? 0), 0);
