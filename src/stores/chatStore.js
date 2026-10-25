import { create } from 'zustand';
import * as chatService from '../services/chatService.js';
import { POLL_SECONDS } from '../services/chatService.js';

/**
 * Conversations, and the one that is open.
 *
 * POLLING LIVES HERE, AND ONLY WHILE A THREAD IS OPEN. A closed panel costs
 * nothing: there is no socket to keep alive and no interval running in the
 * background, which is the upside of the transport the heartbeat chose. The
 * poll asks for messages `since` the newest one it holds, so a quiet thread
 * costs an empty array every few seconds rather than the whole history.
 *
 * The timer is a module variable rather than store state because it is not
 * something anything renders, and putting it in state would re-render every
 * subscriber each time it was replaced.
 */
let pollTimer = null;

const stopPolling = () => {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
};

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

  /** Show a thread, load it, mark it read and start polling. */
  open: async (conversationId) => {
    stopPolling();
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
    pollTimer = setInterval(() => get().poll(), POLL_SECONDS * 1000);
  },

  /** Stop showing a thread. Called when the panel closes. */
  close: () => {
    stopPolling();
    set({ openId: null, messages: [], messagesStatus: 'idle', sendError: null });
  },

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
  reset: () => {
    stopPolling();
    set({
      conversations: [],
      status: 'idle',
      error: null,
      openId: null,
      messages: [],
      messagesStatus: 'idle',
      sendError: null,
      sending: false,
    });
  },
}));

/** Messages waiting across every thread — what a badge would show. */
export const selectUnreadMessages = (state) =>
  state.conversations.reduce((total, thread) => total + (thread.unread ?? 0), 0);
