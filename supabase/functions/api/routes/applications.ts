import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';

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

// PATCH /applications/:id — the only transition the candidate drives alone:
// withdraw. Anything else needs the employer or the simulation.
route('PATCH', '/applications/:id', async (req, params) => {
  const body = await req.json().catch(() => null);
  if (String((body as { status?: string })?.status ?? '') !== 'withdrawn') {
    throw badRequest('That status change is not yours to make.', { field: 'status' });
  }
  const admin = adminClient();
  const { row } = await myApplication(admin, req, params.id);
  const from = row.status as string;
  const { data, error } = await admin
    .from('applications')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(APP_SELECT)
    .single();
  if (error || !data) {
    console.error('[applications] withdraw failed:', error?.message);
    throw serverError();
  }
  await appendEvent(admin, params.id, from, 'withdrawn', 'candidate', null);
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
