import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { requireUser } from '../_shared/auth.ts';
import { membershipIds } from '../_shared/organizations.ts';
import { badRequest, forbidden, notFound } from '../_shared/errors.ts';

/**
 * The employer half of the dual-sided leaderboard (plan item 6).
 *
 * The candidate half lives in `leaderboard.ts` and ranks reputation. This
 * ranks companies on how they treat the people who apply to them — the
 * Hiring Responsiveness Score, defined once in the `employer_responsiveness`
 * view so that the board and an employer's own breakdown cannot disagree.
 *
 * TOP PERFORMERS ONLY, NOT A FULL TABLE. Publishing a bottom-of-table would
 * put a named small company at the foot of a public list on the strength of a
 * handful of applications and one bad month, which is a reputational
 * consequence out of all proportion to the evidence. The incentive the plan
 * wants — rewarding teams that communicate — is carried entirely by the top
 * of the board and the badge. Every employer can always read their own score
 * in full, because asking people to improve against a number you will not
 * show them is not a system, it is a rumour.
 */

type Row = Record<string, unknown>;

/** How many companies the public board shows. */
const BOARD_LIMIT = 20;

/**
 * Closed applications an employer needs before they can be ranked publicly.
 *
 * Without this a company that answered its only applicant within the hour
 * sits at number one on a sample of one, which is both unfair to everyone
 * below it and obviously wrong to anybody reading. They still see their own
 * score; they are simply not ranked against others yet.
 */
const MIN_CLOSED = 5;

/** The score a company must beat to carry the badge. */
const BADGE_THRESHOLD = 0.75;

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/** Round for transport: a public score with 15 decimals invites false precision. */
const pct = (v: unknown) => Math.round(num(v) * 1000) / 10;

function present(row: Row) {
  return {
    id: String(row.organization_id),
    name: String(row.organization_name ?? 'A company'),
    hrs: pct(row.hrs),
    responseSpeed: pct(row.response_speed),
    feedbackRate: pct(row.feedback_rate),
    // Null, not zero, when nobody has rated them — the score renormalises
    // around the gap rather than scoring it, and the UI must be able to say
    // "not rated yet" instead of "rated nought".
    experienceRating: row.experience_rating === null ? null : pct(row.experience_rating),
    ratingCount: num(row.rating_count),
    closedCount: num(row.closed_count),
    quickResponder: num(row.hrs) >= BADGE_THRESHOLD && num(row.closed_count) >= MIN_CLOSED,
  };
}

/**
 * GET /leaderboard/employers — the companies that answer people.
 *
 * Signed in only, like the candidate board: this names real companies and
 * scores them, and is not something to serve to anyone who finds the URL.
 */
route('GET', '/leaderboard/employers', async (req) => {
  const admin = adminClient();
  await requireUser(req);

  const [{ data: scores }, { data: optedOut }] = await Promise.all([
    admin.from('employer_responsiveness').select('*').gte('closed_count', MIN_CLOSED),
    admin.from('organization_opt_out').select('organization_id'),
  ]);

  // Excluded before ranks are assigned, so the board runs 1..n with no gap
  // where an opted-out company used to be — the same rule the candidate
  // board follows.
  const hidden = new Set(((optedOut ?? []) as Row[]).map((r) => String(r.organization_id)));

  const board = ((scores ?? []) as Row[])
    .filter((row) => !hidden.has(String(row.organization_id)))
    .map(present)
    .sort((a, b) => b.hrs - a.hrs || b.closedCount - a.closedCount)
    .slice(0, BOARD_LIMIT)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { body: board };
});

/**
 * GET /employer/responsiveness/:organizationId — a company's own breakdown.
 *
 * Members only, and unconditional: shown whatever the score is, whether or
 * not there is enough volume to rank, and whether or not they have opted out.
 * `ranked` says which of those applies so the screen can explain itself
 * rather than leaving somebody to guess why they are not on the board.
 */
route('GET', '/employer/responsiveness/:organizationId', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const organizationId = params.organizationId;

  const mine = await membershipIds(admin, authUser.id);
  if (!mine.includes(organizationId)) {
    throw forbidden('You do not have access to that company.');
  }

  const [{ data: score }, { data: optOut }] = await Promise.all([
    admin
      .from('employer_responsiveness')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    admin
      .from('organization_opt_out')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (!score) throw notFound('That company profile does not exist anymore.');

  const body = present(score as Row);
  return {
    body: {
      ...body,
      optedOut: Boolean(optOut),
      ranked: body.closedCount >= MIN_CLOSED && !optOut,
      minimumClosed: MIN_CLOSED,
      badgeThreshold: BADGE_THRESHOLD * 100,
    },
  };
});

/**
 * POST /employer/opt-out/:organizationId — `{ optedOut }`.
 *
 * Presence is the state, as with the candidate opt-out: opting out inserts a
 * row and opting back in deletes it.
 */
route('POST', '/employer/opt-out/:organizationId', async (req, params) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  const optedOut = Boolean(body?.optedOut);

  const admin = adminClient();
  const authUser = await requireUser(req);
  const organizationId = params.organizationId;

  const mine = await membershipIds(admin, authUser.id);
  if (!mine.includes(organizationId)) {
    throw forbidden('You do not have access to that company.');
  }

  if (optedOut) {
    await admin
      .from('organization_opt_out')
      .upsert({ organization_id: organizationId }, { onConflict: 'organization_id' });
  } else {
    await admin.from('organization_opt_out').delete().eq('organization_id', organizationId);
  }

  return { body: optedOut };
});

/** Outcomes a candidate may rate. */
const RATEABLE = new Set(['rejected', 'hired', 'declined', 'withdrawn']);

/**
 * PUT /applications/:id/rating — `{ rating }`, 1 to 5.
 *
 * The candidate's own application, and only once it is over. Asking somebody
 * to rate a process they are still inside would make the answer part of the
 * process, and a candidate who suspects the rating is read before a decision
 * cannot answer it honestly.
 *
 * PUT rather than POST because the row is keyed on the application: sending
 * it twice corrects the rating rather than stuffing the ballot.
 *
 * `withdrawn` is rateable even though the candidate ended it — often they
 * withdrew precisely because nobody answered, and that is the single most
 * useful rating this score could collect.
 */
route('PUT', '/applications/:id/rating', async (req, params) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  const rating = Number(body?.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw badRequest('A rating is a whole number from 1 to 5.');
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: application } = await admin
    .from('applications')
    .select('id, candidate_id, status, job_id')
    .eq('id', params.id)
    .maybeSingle();

  // 404 rather than 403 for somebody else's application: whether a given
  // application exists is not something to confirm to a stranger (§3).
  if (!application || String((application as Row).candidate_id) !== authUser.id) {
    throw notFound('That application does not exist anymore.');
  }

  const status = String((application as Row).status);
  if (!RATEABLE.has(status)) {
    throw badRequest('You can rate a company once your application has been decided.');
  }

  const { data: job } = await admin
    .from('jobs')
    .select('organization_id')
    .eq('id', String((application as Row).job_id))
    .maybeSingle();

  if (!job) throw notFound('That role is no longer listed.');

  const { error } = await admin.from('employer_ratings').upsert(
    {
      application_id: params.id,
      organization_id: String((job as Row).organization_id),
      candidate_id: authUser.id,
      rating,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'application_id' },
  );

  if (error) throw badRequest('That rating could not be saved.');

  return { body: { rating } };
});

/** GET /applications/:id/rating — what this candidate already said, or null. */
route('GET', '/applications/:id/rating', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('employer_ratings')
    .select('rating, candidate_id')
    .eq('application_id', params.id)
    .maybeSingle();

  if (!data || String((data as Row).candidate_id) !== authUser.id) return { body: null };
  return { body: { rating: num((data as Row).rating) } };
});
