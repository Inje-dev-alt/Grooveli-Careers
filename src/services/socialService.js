/**
 * The Grooveli Network.
 * Backed by `GET /social/posts`, `POST /social/posts`, `POST /social/posts/:id/like`,
 * `POST /social/posts/:id/comments`, `GET /social/connections`, `POST /social/follows`.
 *
 * Deliberately small. The hypothesis is narrow — does career activity become
 * something worth sharing, and does seeing other people's make opportunities
 * easier to find — so this implements a feed, a post, a like, a comment, a
 * follow and a connection, and nothing else.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { suggestedPeople } from '../mock/social.js';

/** The signed-in person as a post author. */
function selfAuthor() {
  const account = currentAccount();
  const profile = account?.candidateProfileId ? db.profiles[account.candidateProfileId] : null;
  return {
    id: account?.id ?? 'anonymous',
    kind: 'user',
    name: account?.displayName || 'You',
    headline: profile?.headline || 'Building a career on Grooveli',
    color: '#5be3c8',
  };
}

/** @returns {Promise<import('../models/index.js').Post[]>} */
export function listFeed(filters = {}) {
  return withMock(
    async () => {
      await delay();
      let posts = [...db.posts];
      if (filters.type && filters.type !== 'all') posts = posts.filter((p) => p.type === filters.type);
      if (filters.authorId) posts = posts.filter((p) => p.author.id === filters.authorId);
      return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    () => apiClient.get('/social/posts', { params: filters }),
  );
}

/**
 * Publish a post.
 * @param {{ body: string, type?: string, attachment?: object }} draft
 */
export function createPost(draft) {
  return withMock(
    async () => {
      await delay(560);
      if (!draft.body?.trim()) throw new Error('A post needs something in it.');

      /** @type {import('../models/index.js').Post} */
      const post = {
        id: nextId('post'),
        author: selfAuthor(),
        type: draft.type || 'insight',
        body: draft.body.trim(),
        attachment: draft.attachment,
        likeCount: 0,
        likedByMe: false,
        comments: [],
        createdAt: new Date().toISOString(),
      };

      db.posts.unshift(post);
      return { ...post };
    },
    () => apiClient.post('/social/posts', draft),
  );
}

export function toggleLike(postId) {
  return withMock(
    async () => {
      await delay(140);
      const post = db.posts.find((p) => p.id === postId);
      if (!post) throw new Error('That post is no longer available.');
      post.likedByMe = !post.likedByMe;
      post.likeCount += post.likedByMe ? 1 : -1;
      return { ...post };
    },
    async () => {
      const result = await apiClient.post(`/social/posts/${postId}/like`);
      return result;
    },
  );
}

export function addComment(postId, body) {
  return withMock(
    async () => {
      await delay(360);
      const post = db.posts.find((p) => p.id === postId);
      if (!post) throw new Error('That post is no longer available.');
      const comment = {
        id: nextId('cmt'),
        postId,
        author: selfAuthor(),
        body: body.trim(),
        createdAt: new Date().toISOString(),
      };
      post.comments.push(comment);
      return comment;
    },
    () => apiClient.post(`/social/posts/${postId}/comments`, { body }),
  );
}

/** People worth connecting with, annotated with the current relationship. */
export function listSuggestedPeople() {
  return withMock(
    async () => {
      await delay(260);
      return suggestedPeople.map((person) => ({
        ...person,
        status: db.connections.find((c) => c.userId === person.id)?.status ?? null,
      }));
    },
    () => apiClient.get('/social/connections/suggestions'),
  );
}

/**
 * Request a connection.
 *
 * Connections are mutual and follows are not — keeping them separate now means
 * the social graph does not have to be rebuilt when either side grows.
 */
export function connect(userId) {
  return withMock(
    async () => {
      await delay(320);
      const existing = db.connections.find((c) => c.userId === userId);
      if (existing) return { ...existing };
      const connection = {
        id: nextId('con'),
        userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      db.connections.push(connection);
      return connection;
    },
    () => apiClient.post('/social/connections', { userId }),
  );
}

export function listFollowedOrganizations() {
  return withMock(
    async () => {
      await delay(180);
      return [...db.followedOrganizationIds];
    },
    async () => {
      const result = await apiClient.get('/social/follows');
      return result?.organizationIds ?? [];
    },
  );
}

export function toggleFollowOrganization(organizationId) {
  return withMock(
    async () => {
      await delay(200);
      const index = db.followedOrganizationIds.indexOf(organizationId);
      const organization = db.organizations.find((o) => o.id === organizationId);

      if (index >= 0) {
        db.followedOrganizationIds.splice(index, 1);
        if (organization) organization.followerCount = Math.max(0, organization.followerCount - 1);
      } else {
        db.followedOrganizationIds.push(organizationId);
        if (organization) organization.followerCount += 1;
      }
      return [...db.followedOrganizationIds];
    },
    async () => {
      const result = await apiClient.post('/social/follows', { organizationId });
      return result?.organizationIds ?? [];
    },
  );
}

/** Posts published by one organization, for its company profile. */
export function listOrganizationPosts(organizationId) {
  return withMock(
    async () => {
      await delay(240);
      return db.posts.filter((p) => p.author.kind === 'organization' && p.author.id === organizationId);
    },
    () => apiClient.get(`/social/posts`, { params: { authorId: organizationId } }),
  );
}

/** Post type options offered in the composer. */
export const POST_TYPES = [
  { id: 'achievement', label: 'Achievement' },
  { id: 'skill', label: 'Skill' },
  { id: 'advice', label: 'Advice' },
  { id: 'insight', label: 'Insight' },
  { id: 'opportunity', label: 'Opportunity' },
];
