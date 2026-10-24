/**
 * Shaping the feed.
 *
 * A Post carries its author as an object, its like count, whether *you* liked
 * it, and its comments — none of which live on the row. Assembling that per
 * post would be five queries each, so everything here works in batches: one
 * pass for the authors, one for the likes, one for the comments, whatever the
 * length of the feed.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type Row = Record<string, unknown>;

/** The accent a person's card and posts share. Organizations have their own. */
const PERSON_COLOR = '#5be3c8';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type Author = {
  id: string;
  kind: 'user' | 'organization';
  name: string;
  headline: string;
  color: string;
  verified?: boolean;
};

/**
 * Authors for a set of posts, by the id each post names.
 *
 * A person's headline comes from their candidate profile, which an employer
 * account does not have — hence the fallback. The prototype used the same one.
 */
export async function authorsFor(
  admin: SupabaseClient,
  userIds: string[],
  orgIds: string[],
): Promise<Map<string, Author>> {
  const authors = new Map<string, Author>();

  const [profiles, candidateProfiles, organizations] = await Promise.all([
    userIds.length
      ? admin.from('profiles').select('id, display_name').in('id', userIds)
      : Promise.resolve({ data: [] as Row[] }),
    userIds.length
      ? admin.from('candidate_profiles').select('user_id, headline').in('user_id', userIds)
      : Promise.resolve({ data: [] as Row[] }),
    orgIds.length
      ? admin
        .from('organizations')
        .select('id, name, tagline, logo_color, verified')
        .in('id', orgIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const headlineOf = new Map(
    ((candidateProfiles.data ?? []) as Row[]).map((r) => [String(r.user_id), str(r.headline)]),
  );

  for (const row of (profiles.data ?? []) as Row[]) {
    const id = String(row.id);
    authors.set(id, {
      id,
      kind: 'user',
      name: str(row.display_name) || 'Grooveli member',
      headline: headlineOf.get(id) || 'Building a career on Grooveli',
      color: PERSON_COLOR,
      verified: false,
    });
  }

  for (const row of (organizations.data ?? []) as Row[]) {
    const id = String(row.id);
    authors.set(id, {
      id,
      kind: 'organization',
      name: str(row.name),
      headline: str(row.tagline),
      color: str(row.logo_color) || '#6c8cff',
      verified: Boolean(row.verified),
    });
  }

  return authors;
}

/** The id a post names as its author, whichever column holds it. */
export const authorIdOf = (post: Row) =>
  String(post.author_user_id ?? post.author_org_id ?? '');

/**
 * Posts to the §4.8 Post JSON, with authors, like state and comments.
 *
 * `viewerId` decides `likedByMe`, so the same post reads differently for two
 * people — which is why a like count cannot simply be cached on the row.
 */
export async function toPosts(
  admin: SupabaseClient,
  rows: Row[],
  viewerId: string,
): Promise<Row[]> {
  if (!rows.length) return [];

  const postIds = rows.map((r) => String(r.id));
  const userIds = rows.map((r) => r.author_user_id).filter(Boolean).map(String);
  const orgIds = rows.map((r) => r.author_org_id).filter(Boolean).map(String);

  const [likes, comments] = await Promise.all([
    admin.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    admin
      .from('post_comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true }),
  ]);

  const likeRows = (likes.data ?? []) as Row[];
  const commentRows = (comments.data ?? []) as Row[];

  // Comment authors are people, and may not have posted anything themselves,
  // so they are resolved alongside the post authors rather than assumed.
  const commentAuthorIds = commentRows.map((r) => String(r.author_user_id));
  const authors = await authorsFor(admin, [...userIds, ...commentAuthorIds], orgIds);

  const likeCount = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const like of likeRows) {
    const postId = String(like.post_id);
    likeCount.set(postId, (likeCount.get(postId) ?? 0) + 1);
    if (String(like.user_id) === viewerId) likedByMe.add(postId);
  }

  const commentsByPost = new Map<string, Row[]>();
  for (const row of commentRows) {
    const postId = String(row.post_id);
    const held = commentsByPost.get(postId) ?? [];
    held.push({
      id: row.id,
      postId,
      author: authors.get(String(row.author_user_id)) ?? null,
      body: row.body,
      createdAt: row.created_at,
    });
    commentsByPost.set(postId, held);
  }

  return rows.map((row) => {
    const id = String(row.id);
    return {
      id,
      author: authors.get(authorIdOf(row)) ?? null,
      type: row.type,
      body: row.body,
      attachment: row.attachment ?? undefined,
      likeCount: likeCount.get(id) ?? 0,
      likedByMe: likedByMe.has(id),
      comments: commentsByPost.get(id) ?? [],
      createdAt: row.created_at,
    };
  });
}

/** Author ids this account has blocked. */
export async function blockedBy(admin: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await admin
    .from('blocked_authors')
    .select('author_id')
    .eq('user_id', userId);
  return new Set(((data ?? []) as Row[]).map((r) => String(r.author_id)));
}

/**
 * The other person in a connection row.
 *
 * A connection is stored once, from whoever asked. Both sides have to read it
 * as "my connection to them", so the id that is not yours is the one that
 * matters.
 */
export const otherSide = (row: Row, me: string) =>
  String(row.requester_id) === me ? String(row.addressee_id) : String(row.requester_id);
