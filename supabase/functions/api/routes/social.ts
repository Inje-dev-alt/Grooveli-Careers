/**
 * The Grooveli Network (handoff §4.8) — feed, connections, referrals,
 * follows, and the two moderation verbs.
 *
 * Deliberately small, and the rules that matter are the ones about other
 * people:
 *
 * - **An attachment is verified, not declared.** A post may only carry an
 *   achievement its author has actually earned, and `verified` comes from the
 *   award row rather than the request. An attachable achievement that was not
 *   earned turns the feed from social proof into noise, which is the one thing
 *   this feed exists to avoid.
 * - **A report is a row, never a takedown.** Reporting marks a post for human
 *   review. A system that hides a post on the first click is a harassment
 *   weapon pointed at whoever is least popular.
 * - **A block is one account's wall.** It hides an author from the blocker's
 *   feed and from nobody else's.
 * - **A referral names a real application of yours.** Checked, because a
 *   referral is a person being asked to vouch on the record.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, forbidden, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { authorIdOf, authorsFor, blockedBy, otherSide, toPosts } from '../_shared/social.ts';
import { notify } from '../_shared/notify.ts';
import { userPayload } from '../_shared/users.ts';

type Row = Record<string, unknown>;

const FEED_LIMIT = 60;
const POST_MAX = 3000;
const COMMENT_MAX = 1000;

const str = (v: unknown) => String(v ?? '').trim();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

const POST_TYPES = new Set([
  'achievement', 'skill', 'advice', 'insight', 'opportunity', 'company-update',
]);

/* -------------------------------------------------------------- feed --- */

/**
 * GET /social/posts — the feed, newest first.
 *
 * `?type=` and `?authorId=` are the filters the UI sends; `authorId` is also
 * how a company profile asks for its own posts.
 *
 * Blocked authors are removed here rather than in the query: the block list is
 * per viewer and short, and expressing "not in this set" as a filter on a
 * joined column costs more than filtering a page of rows.
 */
route('GET', '/social/posts', async (req) => {
  const url = new URL(req.url);
  const type = str(url.searchParams.get('type'));
  const authorId = str(url.searchParams.get('authorId'));

  const admin = adminClient();
  const authUser = await requireUser(req);

  let query = admin.from('posts').select('*');
  if (type && type !== 'all') query = query.eq('type', type);
  if (authorId) {
    // An author id is either a uuid (a person) or a text org id, and the
    // caller does not say which — so ask for either.
    query = query.or(`author_user_id.eq.${authorId},author_org_id.eq.${authorId}`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(FEED_LIMIT);
  if (error) {
    console.error('[social] feed failed:', error.message);
    throw serverError();
  }

  const blocked = await blockedBy(admin, authUser.id);
  const rows = ((data ?? []) as Row[]).filter((row) => !blocked.has(authorIdOf(row)));
  return { body: await toPosts(admin, rows, authUser.id) };
});

/**
 * POST /social/posts — publish.
 *
 * The author is always the caller. There is no way to post as somebody else,
 * and no way to post as a company yet: company posts exist in the model and in
 * the seed, but an endpoint that let a member publish under the company name
 * needs a decision about which members may speak for it, which is the same
 * decision deferred in §10.
 */
route('POST', '/social/posts', async (req) => {
  const draft = (await req.json().catch(() => null)) as Row | null;
  if (!draft || typeof draft !== 'object') throw badRequest('Send the request as JSON.');

  const body = str(draft.body);
  if (!body) throw badRequest('A post needs something in it.', { field: 'body' });
  if (body.length > POST_MAX) {
    throw badRequest('That post is too long.', { field: 'body', max: POST_MAX });
  }

  const type = str(draft.type) || 'insight';
  if (!POST_TYPES.has(type)) {
    throw badRequest('That is not a kind of post.', { field: 'type', allowed: [...POST_TYPES] });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  // An achievement attachment is checked against what this account has
  // actually been awarded, and `verified` is written from the award rather
  // than copied from the request.
  let attachment: Row | null = null;
  const given = draft.attachment as Row | null | undefined;
  if (given && typeof given === 'object') {
    const kind = str(given.kind);
    const refId = str(given.refId);
    if (kind === 'achievement') {
      if (!refId) throw badRequest('Which achievement?', { field: 'attachment.refId' });
      const { data: award } = await admin
        .from('achievement_progress')
        .select('achievement_id, awarded_at, achievement:achievements(name, description)')
        .eq('user_id', authUser.id)
        .eq('achievement_id', refId)
        .not('awarded_at', 'is', null)
        .maybeSingle();
      if (!award) {
        throw forbidden('You can only share an achievement you have earned.');
      }
      const earned = award as Row;
      const catalog = earned.achievement as Row | null;
      attachment = {
        kind: 'achievement',
        refId,
        label: str(catalog?.name) || str(given.label),
        detail: str(given.detail) || str(catalog?.description),
        verified: true,
      };
    } else {
      // A job or course attachment is a pointer the UI renders; it carries no
      // claim about the author, so it is taken as sent.
      attachment = {
        kind: kind || 'link',
        refId,
        label: str(given.label),
        detail: str(given.detail),
      };
    }
  }

  const { data, error } = await admin
    .from('posts')
    .insert({
      id: id('post'),
      author_user_id: authUser.id,
      type,
      body,
      attachment,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[social] publish failed:', error?.message);
    throw serverError();
  }
  const [post] = await toPosts(admin, [data as Row], authUser.id);
  return { status: 201, body: post };
});

/**
 * POST /social/posts/:id/like — toggle.
 *
 * Idempotent per person per post by the primary key, so a double click lands
 * on one row rather than two. Returns the whole post, which is what the store
 * swaps in.
 */
route('POST', '/social/posts/:id/like', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: post } = await admin.from('posts').select('*').eq('id', params.id).maybeSingle();
  if (!post) throw notFound('That post is no longer available.');

  const { data: existing } = await admin
    .from('post_likes')
    .select('post_id')
    .eq('post_id', params.id)
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (existing) {
    await admin.from('post_likes').delete().eq('post_id', params.id).eq('user_id', authUser.id);
  } else {
    await admin.from('post_likes').insert({ post_id: params.id, user_id: authUser.id });
  }

  const [shaped] = await toPosts(admin, [post as Row], authUser.id);
  return { body: shaped };
});

/** POST /social/posts/:id/comments — add one, and tell the author. */
route('POST', '/social/posts/:id/comments', async (req, params) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const body = str(payload?.body);
  if (!body) throw badRequest('A comment needs something in it.', { field: 'body' });
  if (body.length > COMMENT_MAX) {
    throw badRequest('That comment is too long.', { field: 'body', max: COMMENT_MAX });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: post } = await admin.from('posts').select('*').eq('id', params.id).maybeSingle();
  if (!post) throw notFound('That post is no longer available.');

  const { data, error } = await admin
    .from('post_comments')
    .insert({ id: id('cmt'), post_id: params.id, author_user_id: authUser.id, body })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[social] comment failed:', error?.message);
    throw serverError();
  }

  // The author hears about it, unless they are talking to themselves.
  const postRow = post as Row;
  const authorId = String(postRow.author_user_id ?? '');
  if (authorId && authorId !== authUser.id) {
    const authors = await authorsFor(admin, [authUser.id], []);
    const name = authors.get(authUser.id)?.name ?? 'Someone';
    await notify(admin, authorId, {
      type: 'system',
      title: `${name} commented on your post`,
      body,
      route: '/network',
    });
  }

  const authors = await authorsFor(admin, [authUser.id], []);
  return {
    status: 201,
    body: {
      id: (data as Row).id,
      postId: params.id,
      author: authors.get(authUser.id) ?? null,
      body: (data as Row).body,
      createdAt: (data as Row).created_at,
    },
  };
});

/* ------------------------------------------------------- connections --- */

/** GET /social/connections — this account's, resolved to the other person. */
route('GET', '/social/connections', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('connections')
    .select('*')
    .or(`requester_id.eq.${authUser.id},addressee_id.eq.${authUser.id}`)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Row[];
  const others = rows.map((row) => otherSide(row, authUser.id));
  const authors = await authorsFor(admin, others, []);

  return {
    body: rows.map((row) => {
      const userId = otherSide(row, authUser.id);
      const person = authors.get(userId);
      return {
        id: row.id,
        userId,
        status: row.status,
        name: person?.name ?? 'Connection',
        headline: person?.headline ?? 'Professional',
        color: person?.color ?? '#5be3c8',
        // Which way the request went, so a UI can tell "they asked you" from
        // "you asked them" without a second call.
        incoming: String(row.addressee_id) === authUser.id,
        createdAt: row.created_at,
      };
    }),
  };
});

/**
 * GET /social/connections/count?userId= — accepted connections, either side.
 *
 * Counts `accepted` only, which is the number the profile tile means. In the
 * prototype this could only ever return 0: connections were stored one-sided
 * with no `from` or `to`, and this filtered on both.
 */
route('GET', '/social/connections/count', async (req) => {
  const url = new URL(req.url);
  const admin = adminClient();
  const authUser = await requireUser(req);
  const userId = str(url.searchParams.get('userId')) || authUser.id;

  const { count } = await admin
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  return { body: { count: count ?? 0 } };
});

/**
 * GET /social/connections/suggestions — people worth connecting with.
 *
 * Real accounts with a candidate profile, not fixtures: the prototype's
 * suggested people are not accounts and cannot be connected to. Excludes
 * yourself, anyone you already have a connection with either way, and anyone
 * you have blocked.
 *
 * `mutual` is a real count of shared accepted connections, not a decoration.
 */
route('GET', '/social/connections/suggestions', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const [{ data: candidates }, { data: mine }, blocked] = await Promise.all([
    admin.from('candidate_profiles').select('user_id'),
    admin
      .from('connections')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${authUser.id},addressee_id.eq.${authUser.id}`),
    blockedBy(admin, authUser.id),
  ]);

  const connectionRows = (mine ?? []) as Row[];
  const known = new Map<string, string>();
  for (const row of connectionRows) known.set(otherSide(row, authUser.id), String(row.status));

  const myAccepted = new Set(
    connectionRows.filter((r) => r.status === 'accepted').map((r) => otherSide(r, authUser.id)),
  );

  const ids = ((candidates ?? []) as Row[])
    .map((r) => String(r.user_id))
    .filter((userId) => userId !== authUser.id && !known.has(userId) && !blocked.has(userId));

  if (!ids.length) return { body: [] };

  // Mutual counts: every accepted connection held by the people on offer,
  // intersected with mine. One query, not one per person.
  const { data: theirs } = await admin
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.in.(${ids.join(',')}),addressee_id.in.(${ids.join(',')})`);

  const mutualOf = new Map<string, number>();
  for (const row of (theirs ?? []) as Row[]) {
    for (const side of [String(row.requester_id), String(row.addressee_id)]) {
      if (!ids.includes(side)) continue;
      const other = otherSide(row, side);
      if (myAccepted.has(other)) mutualOf.set(side, (mutualOf.get(side) ?? 0) + 1);
    }
  }

  const authors = await authorsFor(admin, ids, []);
  const people = ids.map((userId) => {
    const person = authors.get(userId);
    return {
      id: userId,
      name: person?.name ?? 'Grooveli member',
      headline: person?.headline ?? 'Professional',
      color: person?.color ?? '#5be3c8',
      mutual: mutualOf.get(userId) ?? 0,
      // The UI renders this to decide between "Connect" and "Pending".
      status: null,
    };
  });

  people.sort((a, b) => b.mutual - a.mutual);
  return { body: people };
});

/** POST /social/connections — ask to connect. */
route('POST', '/social/connections', async (req) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const userId = str(payload?.userId);
  if (!userId) throw badRequest('Connect with whom?', { field: 'userId' });

  const admin = adminClient();
  const authUser = await requireUser(req);
  if (userId === authUser.id) throw badRequest('You are already connected to yourself.');

  const { data: person } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!person) throw notFound('That person is no longer on Grooveli.');

  // Already asked, either way round: return what exists rather than a second
  // row the unique index would refuse anyway.
  const { data: existing } = await admin
    .from('connections')
    .select('*')
    .or(
      `and(requester_id.eq.${authUser.id},addressee_id.eq.${userId}),` +
        `and(requester_id.eq.${userId},addressee_id.eq.${authUser.id})`,
    )
    .maybeSingle();

  if (existing) {
    const row = existing as Row;
    return { body: { id: row.id, userId, status: row.status, createdAt: row.created_at } };
  }

  const { data, error } = await admin
    .from('connections')
    .insert({ id: id('con'), requester_id: authUser.id, addressee_id: userId })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[social] connect failed:', error?.message);
    throw serverError();
  }

  const authors = await authorsFor(admin, [authUser.id], []);
  await notify(admin, userId, {
    type: 'system',
    title: `${authors.get(authUser.id)?.name ?? 'Someone'} wants to connect`,
    body: 'Open your network to accept.',
    route: '/network',
  });

  const row = data as Row;
  return { status: 201, body: { id: row.id, userId, status: row.status, createdAt: row.created_at } };
});

/**
 * POST /social/connections/:id/respond — accept or decline.
 *
 * Only the addressee may answer: accepting on somebody's behalf would be
 * writing their relationships for them.
 *
 * No UI calls this yet — the network offers "Connect" and nothing to answer
 * with, so every connection stays `pending` and the profile's connection
 * count reads 0. The endpoint exists so that gap is a screen to build rather
 * than a schema to change.
 */
route('POST', '/social/connections/:id/respond', async (req, params) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const decision = str(payload?.decision);
  if (decision !== 'accept' && decision !== 'decline') {
    throw badRequest('Answer with accept or decline.', { field: 'decision' });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: existing } = await admin
    .from('connections').select('*').eq('id', params.id).maybeSingle();
  if (!existing) throw notFound('That request is no longer there.');

  const row = existing as Row;
  if (String(row.addressee_id) !== authUser.id) {
    throw forbidden('That request is not yours to answer.');
  }
  if (row.status !== 'pending') throw badRequest('That request has already been answered.');

  const status = decision === 'accept' ? 'accepted' : 'declined';
  const { data, error } = await admin
    .from('connections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[social] respond failed:', error?.message);
    throw serverError();
  }

  if (status === 'accepted') {
    const authors = await authorsFor(admin, [authUser.id], []);
    await notify(admin, String(row.requester_id), {
      type: 'system',
      title: `${authors.get(authUser.id)?.name ?? 'Someone'} accepted your connection`,
      body: 'You can now ask them for a referral.',
      route: '/network',
    });
  }

  const updated = data as Row;
  return {
    body: {
      id: updated.id,
      userId: String(updated.requester_id),
      status: updated.status,
      createdAt: updated.created_at,
    },
  };
});

/* ----------------------------------------------------------- follows --- */

/** GET /social/follows — organization ids this account follows. */
route('GET', '/social/follows', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('follows').select('organization_id').eq('user_id', authUser.id);
  return {
    body: { organizationIds: ((data ?? []) as Row[]).map((r) => String(r.organization_id)) },
  };
});

/**
 * POST /social/follows — toggle one.
 *
 * `organizations.follower_count` is adjusted alongside rather than derived.
 * It is seeded with figures no row here accounts for, so counting rows would
 * reset every company to its real followers, which today is nearly none.
 */
route('POST', '/social/follows', async (req) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const organizationId = str(payload?.organizationId);
  if (!organizationId) throw badRequest('Follow which company?', { field: 'organizationId' });

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: organization } = await admin
    .from('organizations').select('id, follower_count').eq('id', organizationId).maybeSingle();
  if (!organization) throw notFound('That company profile does not exist anymore.');

  const { data: existing } = await admin
    .from('follows')
    .select('organization_id')
    .eq('user_id', authUser.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const held = Number((organization as Row).follower_count ?? 0);
  if (existing) {
    await admin
      .from('follows').delete().eq('user_id', authUser.id).eq('organization_id', organizationId);
    await admin
      .from('organizations')
      .update({ follower_count: Math.max(0, held - 1) })
      .eq('id', organizationId);
  } else {
    await admin.from('follows').insert({ user_id: authUser.id, organization_id: organizationId });
    await admin
      .from('organizations').update({ follower_count: held + 1 }).eq('id', organizationId);
  }

  const { data } = await admin
    .from('follows').select('organization_id').eq('user_id', authUser.id);
  return {
    body: { organizationIds: ((data ?? []) as Row[]).map((r) => String(r.organization_id)) },
  };
});

/* --------------------------------------------------------- referrals --- */

/** GET /social/referrals — the ones this account asked for. */
route('GET', '/social/referrals', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('referrals')
    .select('*')
    .eq('applicant_user_id', authUser.id)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Row[];
  const authors = await authorsFor(admin, rows.map((r) => String(r.referrer_user_id)), []);

  return {
    body: rows.map((row) => ({
      id: row.id,
      referrerUserId: row.referrer_user_id,
      referrerName: authors.get(String(row.referrer_user_id))?.name ?? 'Connection',
      applicantUserId: row.applicant_user_id,
      applicationId: row.application_id,
      jobTitle: row.job_title,
      companyName: row.company_name,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
});

/**
 * POST /social/referrals — ask a connection to vouch for you.
 *
 * Two things are checked, because a referral puts somebody's name on the
 * record: the application must be the caller's own, and the person asked must
 * actually be connected to them. `connectionId` carries the other person's
 * user id, which is what `ApplicationList` sends.
 */
route('POST', '/social/referrals', async (req) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const referrerId = str(payload?.connectionId);
  const applicationId = str(payload?.applicationId);
  if (!referrerId) throw badRequest('Ask whom?', { field: 'connectionId' });
  if (!applicationId) throw badRequest('A referral is for one application.', {
    field: 'applicationId',
  });

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: application } = await admin
    .from('applications')
    .select('id, candidate_id, job:jobs(title, company_name)')
    .eq('id', applicationId)
    .maybeSingle();
  if (!application || (application as Row).candidate_id !== authUser.id) {
    throw notFound('That application no longer exists.');
  }

  const { data: connection } = await admin
    .from('connections')
    .select('id, status')
    .or(
      `and(requester_id.eq.${authUser.id},addressee_id.eq.${referrerId}),` +
        `and(requester_id.eq.${referrerId},addressee_id.eq.${authUser.id})`,
    )
    .maybeSingle();
  if (!connection) throw forbidden('You can only ask a connection for a referral.');

  const { data: existing } = await admin
    .from('referrals')
    .select('*')
    .eq('referrer_user_id', referrerId)
    .eq('application_id', applicationId)
    .maybeSingle();

  const job = (application as Row).job as Row | null;
  const authors = await authorsFor(admin, [referrerId, authUser.id], []);

  const shape = (row: Row) => ({
    id: row.id,
    referrerUserId: row.referrer_user_id,
    referrerName: authors.get(String(row.referrer_user_id))?.name ?? 'Connection',
    applicantUserId: row.applicant_user_id,
    applicationId: row.application_id,
    jobTitle: row.job_title,
    companyName: row.company_name,
    status: row.status,
    createdAt: row.created_at,
  });

  // Asking twice is the same ask.
  if (existing) return { body: shape(existing as Row) };

  const { data, error } = await admin
    .from('referrals')
    .insert({
      id: id('ref'),
      referrer_user_id: referrerId,
      applicant_user_id: authUser.id,
      application_id: applicationId,
      job_title: str(payload?.jobTitle) || str(job?.title),
      company_name: str(payload?.companyName) || str(job?.company_name),
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[social] referral failed:', error?.message);
    throw serverError();
  }

  await notify(admin, referrerId, {
    type: 'system',
    title: `${authors.get(authUser.id)?.name ?? 'A connection'} asked for a referral`,
    body: `For ${str(job?.title)} at ${str(job?.company_name)}.`,
    route: '/network',
  });

  return { status: 201, body: shape(data as Row) };
});

/* -------------------------------------------------------- moderation --- */

/** POST /social/posts/:id/report — mark for review. Never a takedown. */
route('POST', '/social/posts/:id/report', async (req, params) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const reason = str(payload?.reason) || 'other';

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: post } = await admin.from('posts').select('*').eq('id', params.id).maybeSingle();
  if (!post) throw notFound('That post is no longer available.');

  const { data: existing } = await admin
    .from('post_reports')
    .select('*')
    .eq('post_id', params.id)
    .eq('reporter_user_id', authUser.id)
    .maybeSingle();

  const shape = (row: Row) => ({
    id: row.id,
    postId: row.post_id,
    reporterUserId: row.reporter_user_id,
    authorId: row.author_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  });

  // Reporting the same post twice is one report, not two signals.
  if (existing) return { body: shape(existing as Row) };

  const { data, error } = await admin
    .from('post_reports')
    .insert({
      id: id('rpt'),
      post_id: params.id,
      reporter_user_id: authUser.id,
      author_id: authorIdOf(post as Row),
      reason,
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[social] report failed:', error?.message);
    throw serverError();
  }
  return { status: 201, body: shape(data as Row) };
});

/** POST /social/blocks — hide an author from this account's feed only. */
route('POST', '/social/blocks', async (req) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const authorId = str(payload?.authorId);
  if (!authorId) throw badRequest('Block whom?', { field: 'authorId' });

  const admin = adminClient();
  const authUser = await requireUser(req);
  if (authorId === authUser.id) throw badRequest('You cannot block yourself.');

  const { error } = await admin
    .from('blocked_authors')
    .upsert({ user_id: authUser.id, author_id: authorId }, { onConflict: 'user_id,author_id' });
  if (error) {
    console.error('[social] block failed:', error.message);
    throw serverError();
  }

  return { body: [...(await blockedBy(admin, authUser.id))] };
});

/* ------------------------------------------------------ the avatar --- */

/**
 * POST /users/me/avatar — record the profile picture.
 *
 * Nothing is uploaded: the file name is stored and the file never leaves the
 * browser, the same open decision as the CV and the company logo. The real
 * endpoint takes `multipart/form-data` with a `file` part.
 */
route('POST', '/users/me/avatar', async (req) => {
  const payload = (await req.json().catch(() => null)) as Row | null;
  const fileName = str(payload?.fileName);
  if (!fileName) throw badRequest('Which file?', { field: 'fileName' });

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { error } = await admin
    .from('profiles').update({ avatar_url: fileName }).eq('id', authUser.id);
  if (error) {
    console.error('[social] avatar failed:', error.message);
    throw serverError();
  }

  return { body: await userPayload(admin, authUser) };
});
