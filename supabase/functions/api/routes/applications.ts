import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { isMember } from '../_shared/organizations.ts';
import { notify, stageNotice } from '../_shared/notify.ts';

type AppRow = Record<string, unknown>;

/** Row (+ joined job) to the normalised Application JSON (§4.4). */
function toApplication(row: AppRow) {
  const job = row.job as Record<string, unknown> | null;
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: job?.title ?? '',
    organizationId: job?.organization_id ?? '',
    companyName: job?.company_name ?? '',
    candidateId: row.candidate_id,
    status: row.status,
    note: row.note ?? null,
    feedback: row.feedback ?? null,
    rejectionAcknowledged: row.rejection_acknowledged ?? false,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
    stageEnteredAt: row.stage_entered_at ?? row.applied_at,
  };
}

function toEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    applicationId: row.application_id,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status,
    actor: row.actor,
    note: row.note ?? null,
    at: row.at,
  };
}

const APP_SELECT = '*, job:jobs(title, organization_id, company_name)';

async function appendEvent(
  admin: ReturnType<typeof adminClient>,
  applicationId: string,
  fromStatus: string | null,
  toStatus: string,
  actor: string,
  note: string | null,
) {
  await admin.from('application_events').insert({
    application_id: applicationId,
    from_status: fromStatus,
    to_status: toStatus,
    actor,
    note,
  });
}

/** The caller's own application row, or a §3 404 (never leak existence). */
async function myApplication(admin: ReturnType<typeof adminClient>, req: Request, id: string) {
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('applications').select(APP_SELECT).eq('id', id).maybeSingle();
  if (!data || (data as AppRow).candidate_id !== authUser.id) {
    throw notFound('That application no longer exists.');
  }
  return { authUser, row: data as AppRow };
}

// GET /applications — this account's applications, newest activity first.
route('GET', '/applications', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('applications')
    .select(APP_SELECT)
    .eq('candidate_id', authUser.id)
    .order('updated_at', { ascending: false });
  return { body: ((data ?? []) as AppRow[]).map(toApplication) };
});

// POST /jobs/:id/apply — re-applying returns the existing record rather than
// creating a duplicate (§3: 409 is treated as already-done; the mock returns
// it with 200 and so do we).
route('POST', '/jobs/:id/apply', async (req, params) => {
  const body = await req.json().catch(() => ({}));
  const note = String((body as { note?: string })?.note ?? '').trim() || null;
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: job } = await admin
    .from('jobs')
    .select('id, title, organization_id, company_name, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!job || (job as { status: string }).status !== 'published') {
    throw notFound('That role is no longer listed.');
  }

  const { data: existing } = await admin
    .from('applications')
    .select(APP_SELECT)
    .eq('job_id', params.id)
    .eq('candidate_id', authUser.id)
    .maybeSingle();
  if (existing) return { body: toApplication(existing as AppRow) };

  const { data: created, error } = await admin
    .from('applications')
    .insert({ job_id: params.id, candidate_id: authUser.id, status: 'applied', note })
    .select(APP_SELECT)
    .single();
  if (error || !created) {
    // Unique race: another request inserted first - return that record.
    if (error?.code === '23505') {
      const { data: raced } = await admin
        .from('applications').select(APP_SELECT)
        .eq('job_id', params.id).eq('candidate_id', authUser.id).maybeSingle();
      if (raced) return { body: toApplication(raced as AppRow) };
    }
    console.error('[applications] create failed:', error?.message);
    throw serverError();
  }
  await appendEvent(admin, (created as AppRow).id as string, null, 'applied', 'candidate', note);
  return { status: 201, body: toApplication(created as AppRow) };
});

/**
 * The stage moves an employer drives.
 *
 * `applied` is absent because it is how a row begins. `withdrawn` and
 * `declined` belong to the candidate, and `hired` is reached by accepting an
 * offer through `POST /applications/:id/respond` — an employer who could set
 * `hired` directly would be recording somebody else's decision.
 */
const EMPLOYER_STATUSES = new Set([
  'under-review', 'shortlisted', 'interview', 'assessment', 'offer', 'rejected',
]);

/**
 * PATCH /applications/:id — one path, two authorities.
 *
 * The same row means different things to the two sides of the marketplace, so
 * what the caller may do is decided by their relationship to it rather than by
 * a flag in the request:
 *
 *   the candidate who applied  → `withdrawn`, and nothing else
 *   a member of the hiring org → the stage moves in EMPLOYER_STATUSES
 *   anyone else                → 404, never 403
 *
 * The 404 for a stranger is the §3 rule: a 403 would confirm that this
 * application exists and that somebody is in that pipeline.
 *
 * This route previously refused anything but `withdrawn` before it even looked
 * at the row, which is why the employer pipeline was mocked — `setApplicationStatus`
 * had no endpoint that would accept it.
 */
route('PATCH', '/applications/:id', async (req, params) => {
  const body = (await req.json().catch(() => null)) as { status?: string; feedback?: string } | null;
  const status = String(body?.status ?? '').trim();
  if (!status) throw badRequest('Which status?', { field: 'status' });

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: existing } = await admin
    .from('applications').select(APP_SELECT).eq('id', params.id).maybeSingle();
  if (!existing) throw notFound('That application no longer exists.');

  const row = existing as AppRow;
  const job = row.job as Record<string, unknown> | null;
  const isCandidate = row.candidate_id === authUser.id;
  const isEmployer = job?.organization_id
    ? await isMember(admin, String(job.organization_id), authUser.id)
    : false;

  if (!isCandidate && !isEmployer) throw notFound('That application no longer exists.');

  const from = String(row.status);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  let actor: 'candidate' | 'employer';
  let note: string | null = null;

  if (isEmployer && EMPLOYER_STATUSES.has(status)) {
    actor = 'employer';
    note = String(body?.feedback ?? '').trim() || null;

    // A no with no reason teaches nothing, and the candidate-side Bounce Back
    // mission turns the reason into the next move. The mock filled this in with
    // canned text when the employer left it blank; the server will not author
    // feedback on an employer's behalf and sends them back to write it.
    if (status === 'rejected' && !note) {
      throw badRequest('A rejection needs a reason the candidate can act on.', {
        field: 'feedback',
      });
    }
    if (status === 'rejected') {
      patch.feedback = note;
      // A new rejection is unread, even if an earlier one on this row was read.
      patch.rejection_acknowledged = false;
    }
    patch.stage_entered_at = now;
  } else if (isCandidate && status === 'withdrawn') {
    actor = 'candidate';
  } else {
    throw badRequest('That status change is not yours to make.', { field: 'status' });
  }

  const { data, error } = await admin
    .from('applications')
    .update(patch)
    .eq('id', params.id)
    .select(APP_SELECT)
    .single();
  if (error || !data) {
    console.error('[applications] status change failed:', error?.message);
    throw serverError();
  }

  await appendEvent(admin, params.id, from, status, actor, note);

  // The candidate is told the pipeline moved. Only for an employer's move:
  // `withdrawn` is the candidate's own action, and telling someone what they
  // just did themselves is noise.
  //
  // Raised after the update, never inside it: the stage change is already
  // durable, and `notify` swallows its own failure so a bell that did not ring
  // cannot report the move as failed.
  if (actor === 'employer') {
    const notice = stageNotice(
      status,
      String(job?.title ?? 'your application'),
      String(job?.company_name ?? 'The company'),
    );
    if (notice) await notify(admin, String(row.candidate_id), notice);
  }

  return { body: toApplication(data as AppRow) };
});

// POST /applications/:id/respond — accept or decline an offer. The XP award
// belongs to the caller: services never award progression (§4.5).
route('POST', '/applications/:id/respond', async (req, params) => {
  const body = await req.json().catch(() => null);
  const decision = String((body as { decision?: string })?.decision ?? '');
  if (decision !== 'accept' && decision !== 'decline') {
    throw badRequest('Answer with accept or decline.', { field: 'decision' });
  }
  const admin = adminClient();
  const { row } = await myApplication(admin, req, params.id);
  if (row.status !== 'offer') throw badRequest('This offer is no longer open.');

  const to = decision === 'accept' ? 'hired' : 'declined';
  const note = decision === 'accept' ? 'Offer accepted.' : 'Offer declined by candidate.';
  const { data, error } = await admin
    .from('applications')
    .update({ status: to, updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(APP_SELECT)
    .single();
  if (error || !data) {
    console.error('[applications] respond failed:', error?.message);
    throw serverError();
  }
  await appendEvent(admin, params.id, 'offer', to, 'candidate', note);
  return { body: toApplication(data as AppRow) };
});

// POST /applications/:id/acknowledge — the candidate has seen the rejection;
// stop the event from firing twice.
route('POST', '/applications/:id/acknowledge', async (req, params) => {
  const admin = adminClient();
  await myApplication(admin, req, params.id);
  const { data, error } = await admin
    .from('applications')
    .update({ rejection_acknowledged: true })
    .eq('id', params.id)
    .select(APP_SELECT)
    .single();
  if (error || !data) {
    console.error('[applications] acknowledge failed:', error?.message);
    throw serverError();
  }
  return { body: toApplication(data as AppRow) };
});

// GET /applications/:id/events — the stage history, oldest first.
route('GET', '/applications/:id/events', async (req, params) => {
  const admin = adminClient();
  await myApplication(admin, req, params.id);
  const { data } = await admin
    .from('application_events')
    .select('*')
    .eq('application_id', params.id)
    .order('at', { ascending: true });
  return { body: ((data ?? []) as Record<string, unknown>[]).map(toEvent) };
});
