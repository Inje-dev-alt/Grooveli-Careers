import { create } from 'zustand';
import * as socialService from '../services/socialService.js';

/**
 * The Grooveli Network.
 *
 * Holds the feed and the small amount of relationship state the UI needs to
 * render it. Connections and follows are tracked separately because they are
 * different relationships — a candidate follows a company, and connects with a
 * person.
 */
export const useSocialStore = create((set, get) => ({
  /** @type {import('../models/index.js').Post[]} */
  posts: [],
  people: [],
  followedOrganizationIds: [],
  status: 'idle',
  error: null,
  posting: false,

  load: async (filters = {}) => {
    set({ status: 'loading', error: null });
    try {
      const [posts, people, followedOrganizationIds] = await Promise.all([
        socialService.listFeed(filters),
        socialService.listSuggestedPeople().catch(() => []),
        socialService.listFollowedOrganizations().catch(() => []),
      ]);
      set({ posts, people, followedOrganizationIds, status: 'ready' });
    } catch (error) {
      set({ status: 'error', error: error.message || 'Could not load the network.' });
    }
  },

  reset: () => set({ posts: [], people: [], followedOrganizationIds: [], status: 'idle', error: null }),

  publish: async (draft) => {
    set({ posting: true });
    try {
      const post = await socialService.createPost(draft);
      set((state) => ({ posts: [post, ...state.posts] }));
      return post;
    } finally {
      set({ posting: false });
    }
  },

  /** Optimistic: a like is cheap and reversible, and the feed should not lag. */
  toggleLike: async (postId) => {
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p,
      ),
    }));
    try {
      const updated = await socialService.toggleLike(postId);
      set((state) => ({ posts: state.posts.map((p) => (p.id === postId ? updated : p)) }));
    } catch {
      set((state) => ({
        posts: state.posts.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
            : p,
        ),
      }));
    }
  },

  comment: async (postId, body) => {
    const comment = await socialService.addComment(postId, body);
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, comments: [...p.comments, comment] } : p,
      ),
    }));
    return comment;
  },

  connect: async (userId) => {
    const connection = await socialService.connect(userId);
    set((state) => ({
      people: state.people.map((p) => (p.id === userId ? { ...p, status: connection.status } : p)),
    }));
    return connection;
  },

  toggleFollow: async (organizationId) => {
    const followedOrganizationIds = await socialService.toggleFollowOrganization(organizationId);
    set({ followedOrganizationIds });
    return followedOrganizationIds;
  },

  isFollowing: (organizationId) => get().followedOrganizationIds.includes(organizationId),
}));
