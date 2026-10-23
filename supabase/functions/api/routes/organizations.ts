/**
 * Organizations — the employer side of the marketplace (handoff §4.2).
 *
 * The thing worth understanding before reading further: **the pipeline an
 * employer moves is the same `applications` table the candidate reads.** One
 * table, two views, filtered by who is asking. A role published here is written
 * into the same `jobs` table the marketplace serves, tagged
 * `grooveli_employer`, and no screen on either side branches on which it is.
 * That crossover is the product; these endpoints exist to make it real rather
 * than mocked.
 *
 * What changes from the mock, beyond persistence:
 *
 * 1. **Membership is checked.** Every write, and every read of an
 *    organization's private data, goes through `requireMembership`. The
 *    prototype took `organizationId` from the browser and trusted it, so
 *    publishing a job for another company, or reading and moving its pipeline,
 *    was a matter of editing one string. See `_shared/organizations.ts`.
 * 2. **A published job's `industry` and `districtId` come from the
 *    organization**, not the draft, exactly as the mock did — a role belongs to
 *    the company's district, and letting the form choose would put a company's
 *    jobs in a district its profile says nothing about.
 * 3. **Analytics are computed from rows, never sampled.** An empty pipeline
 *    returns zeros and the panel renders honest empty states.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import {
  organizationJobIds,
  requireMembership,
  toOrganization,
  type OrganizationRow,
} from '../_shared/organizations.ts';
import { toJob, type JobRow } from '../_shared/jobs.ts';
import { candidateCards } from '../_shared/candidates.ts';

type Row = Record<string, unknown>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => String(v ?? '').trim();
const list = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s)) : []);

/** The employer's view of an application: the row plus who applied. */
function toInbound(row: Row, candidate: Row | null) {
  const job = row.job as Row | null;
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
    // Null when the applicant has no candidate profile. The screen renders the
    // row regardless: an application that cannot resolve a card is still a real
    // application, and hiding it would lose it.
    candidate,
  };
}

const INBOUND_SELECT = '*, job:jobs(title, organization_id, company_name)';

/** This organization's applications, newest activity first, with cards. */
async function inboundFor(admin: ReturnType<typeof adminClient>, organizationId: string) {
  const jobIds = await organizationJobIds(admin, organizationId);
  if (!jobIds.length) return [];

  const { data } = await admin
    .from('applications')
    .select(INBOUND_SELECT)
    .in('job_id', jobIds)
    .order('updated_at', { ascending: false });

  const rows = (data ?? []) as Row[];
  const cards = await candidateCards(admin, rows.map((r) => String(r.candidate_id)));
  return rows.map((row) => toInbound(row, cards.get(String(row.candidate_id)) ?? null));
}

/* -------------------------------------------------------------- reads --- */

/**
 * GET /organizations/active — the organization the signed-in employer acts for.
 *
 * Registered before `/organizations/:id`: the router matches in registration
 * order and both are two segments, so the literal has to win or `active` is
 * read as an organization id.
 *
 * Answers `null`, not 404, for an account with no membership — a candidate
 * asking this question is not an error, and the frontend's
 * `getActiveOrganization` is written to expect null.
 */
route('GET', '/organizations/active', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data } = await admin
    .from('organization_memberships')
    .select('organization_id, role, title, joined_at, organization:organizations(*)')
    .eq('user_id', authUser.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as Row | null;
  const organization = row?.organization as OrganizationRow | null;
  if (!row || !organization) return { body: null };

  return {
    body: {
      organization: toOrganization(organization),
      membership: {
        organizationId: row.organization_id,
        organizationName: organization.name,
        role: row.role,
        title: row.title,
        joinedAt: row.joined_at,
      },
    },
  };
});

/**
 * GET /organizations — the public company directory.
 *
 * No membership check: a company profile is public, and this is what the city's
 * district panels list. Filtered in TS as routes/jobs.ts does — the directory
 * is small and the two predicates read as one rule.
 */
route('GET', '/organizations', async (req) => {
  const url = new URL(req.url);
  const districtId = url.searchParams.get('districtId');
  const industry = url.searchParams.get('industry');

  const admin = adminClient();
  await requireUser(req);

  const { data, error } = await admin.from('organizations').select('*').order('name');
  if (error) {
    console.error('[organizations] list failed:', error.message);
    throw serverError();
  }

  const rows = ((data ?? []) as OrganizationRow[]).filter((row) => {
    if (districtId && row.district_id !== districtId) return false;
    if (industry && row.industry !== industry) return false;
    return true;
  });
  return { body: rows.map(toOrganization) };
});

/** GET /organizations/:id — one public company profile. */
route('GET', '/organizations/:id', async (req, params) => {
  const admin = adminClient();
  await requireUser(req);
  const { data } = await admin
    .from('organizations')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!data) throw notFound('That company profile does not exist anymore.');
  return { body: toOrganization(data as OrganizationRow) };
});

/**
 * GET /organizations/:id/jobs — every role this organization owns, newest
 * first, drafts and closed ones included.
 *
 * Membership required, because this is the only place unpublished roles are
 * readable. `GET /jobs` serves `published` only, so a draft must not leak
 * through a path that skips the check.
 */
route('GET', '/organizations/:id/jobs', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireMembership(admin, params.id, authUser.id);

  const { data, error } = await admin
    .from('jobs')
    .select('*')
    .eq('organization_id', params.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[organizations] jobs failed:', error.message);
    throw serverError();
  }
  return { body: ((data ?? []) as JobRow[]).map(toJob) };
});

/** GET /organizations/:id/applications — the pipeline. */
route('GET', '/organizations/:id/applications', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireMembership(admin, params.id, authUser.id);
  return { body: await inboundFor(admin, params.id) };
});

/** GET /organizations/:id/overview — the dashboard's headline numbers. */
route('GET', '/organizations/:id/overview', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireMembership(admin, params.id, authUser.id);

  const jobIds = await organizationJobIds(admin, params.id);
  const [{ data: jobs }, { data: apps }] = await Promise.all([
    admin.from('jobs').select('status').eq('organization_id', params.id),
    jobIds.length
      ? admin.from('applications').select('status').in('job_id', jobIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const jobRows = (jobs ?? []) as Row[];
  const appRows = (apps ?? []) as Row[];
  return {
    body: {
      openJobs: jobRows.filter((j) => j.status === 'published').length,
      totalJobs: jobRows.length,
      applications: appRows.length,
      shortlisted: appRows.filter((a) => a.status === 'shortlisted').length,
      interviews: appRows.filter((a) => a.status === 'interview').length,
    },
  };
});

/**
 * GET /organizations/:id/analytics — hiring as numbers.
 *
 * Every figure comes from the organization's own rows. `matchBuckets`
 * distributes applicants over fixed boundaries, and an applicant with no
 * resolvable card counts as `unscored` rather than as a zero — a candidate
 * whose profile says nothing is not a bad match, they are an unknown one, and
 * folding them into `0-39` would be inventing a judgement.
 */
route('GET', '/organizations/:id/analytics', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireMembership(admin, params.id, authUser.id);

  const inbound = await inboundFor(admin, params.id);
  const { data: jobs } = await admin
    .from('jobs')
    .select('source')
    .eq('organization_id', params.id);

  const byStage: Record<string, number> = {};
  for (const application of inbound) {
    const status = String(application.status);
    byStage[status] = (byStage[status] ?? 0) + 1;
  }

  const now = Date.now();
  const days = inbound.map((application) => {
    const entered = new Date(String(application.stageEnteredAt ?? application.updatedAt)).getTime();
    return Number.isFinite(entered) ? Math.max(0, (now - entered) / 86400000) : 0;
  });
  const avgDaysInStage = days.length === 0
    ? 0
    : Math.round((days.reduce((total, d) => total + d, 0) / days.length) * 10) / 10;

  const sourceMix: Record<string, number> = {};
  for (const job of (jobs ?? []) as Row[]) {
    const source = String(job.source ?? 'mock');
    sourceMix[source] = (sourceMix[source] ?? 0) + 1;
  }

  const matchBuckets = { '0-39': 0, '40-59': 0, '60-79': 0, '80-100': 0, unscored: 0 };
  for (const application of inbound) {
    const score = (application.candidate as Row | null)?.matchScore;
    if (typeof score !== 'number') matchBuckets.unscored += 1;
    else if (score < 40) matchBuckets['0-39'] += 1;
    else if (score < 60) matchBuckets['40-59'] += 1;
    else if (score < 80) matchBuckets['60-79'] += 1;
    else matchBuckets['80-100'] += 1;
  }

  return {
    body: { applications: inbound.length, byStage, avgDaysInStage, sourceMix, matchBuckets },
  };
});

/* ------------------------------------------------------------- writes --- */

/**
 * The company profile fields an employer may edit, mapped to their columns.
 *
 * Keyed by the names the frontend sends: `EmployerCompany`'s form posts
 * `{ name, tagline, description, industry, size, location, website }`, and
 * `size` is the Organization field for the `size_band` column (see
 * `toOrganization`).
 */
const EDITABLE: Record<string, string> = {
  name: 'name',
  tagline: 'tagline',
  description: 'description',
  industry: 'industry',
  size: 'size_band',
  location: 'location',
  website: 'website',
  districtId: 'district_id',
  logoColor: 'logo_color',
};

/**
 * PATCH /organizations/:id — edit the company profile.
 *
 * Only the keys in `EDITABLE` are written. `verified` and `followerCount` are
 * not among them: a company that could set its own verified badge has an
 * ornament rather than a verification, and a follower count it can type is not
 * a count. Both belong to the platform and to `/social/follows` respectively.
 */
route('PATCH', '/organizations/:id', async (req, params) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  if (!body || typeof body !== 'object') throw badRequest('Send the request as JSON.');

  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireMembership(admin, params.id, authUser.id);

  const patch: Row = {};
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (key in body) patch[column] = body[key];
  }
  if (!Object.keys(patch).length) {
    throw badRequest('Nothing in that request can be changed.', {
      editable: Object.keys(EDITABLE),
    });
  }

  const { data, error } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[organizations] update failed:', error?.message);
    throw serverError();
  }
  return { body: toOrganization(data as OrganizationRow) };
});

/**
 * POST /organizations/:id/jobs — publish a role.
 *
 * It lands in the same `jobs` table `GET /jobs` serves, tagged
 * `grooveli_employer`, and is immediately discoverable by candidates. That is
 * the whole marketplace relationship in one insert: employer → company → job →
 * candidate → application.
 *
 * `industry` and `districtId` are taken from the organization rather than the
 * draft, as the mock does. `status` is `published` because this endpoint is
 * what the publish button calls; a draft flow would send its own status, and
 * `PATCH /jobs/:id` is how a role is paused or closed afterwards.
 */
route('POST', '/organizations/:id/jobs', async (req, params) => {
  const draft = (await req.json().catch(() => null)) as Row | null;
  if (!draft || typeof draft !== 'object') throw badRequest('Send the request as JSON.');

  const title = str(draft.title);
  if (!title) throw badRequest('A role needs a title.', { field: 'title' });

  const admin = adminClient();
  const authUser = await requireUser(req);
  const { organization } = await requireMembership(admin, params.id, authUser.id);

  const salaryMin = num(Number(draft.salaryMin)) || 0;
  const salaryMax = num(Number(draft.salaryMax)) || 0;
  if (salaryMax && salaryMin && salaryMax < salaryMin) {
    throw badRequest('The top of the range cannot be below the bottom.', { field: 'salaryMax' });
  }

  const { data, error } = await admin
    .from('jobs')
    .insert({
      // Readable and deterministic, like the seeded ids (§4.3). `gen_random_uuid`
      // would work too, but every other job id in the table reads as `job-*`.
      id: `job-${crypto.randomUUID().slice(0, 12)}`,
      organization_id: organization.id,
      // Denormalised so a job list never needs a second request (§4.3).
      company_name: organization.name,
      title,
      description: str(draft.description),
      salary_min: salaryMin,
      salary_max: salaryMax,
      currency: str(draft.currency) || 'NGN',
      salary_period: str(draft.salaryPeriod) || 'month',
      location: str(draft.location),
      work_type: str(draft.workType) || 'onsite',
      employment_type: str(draft.employmentType) || 'full-time',
      experience_level: str(draft.experienceLevel) || 'mid',
      required_skills: list(draft.requiredSkills),
      preferred_skills: list(draft.preferredSkills),
      industry: organization.industry,
      district_id: organization.district_id,
      deadline: str(draft.deadline) || null,
      status: 'published',
      source: 'grooveli_employer',
      responsibilities: list(draft.responsibilities),
      requirements: list(draft.requirements),
      featured: false,
    })
    .select('*')
    .single();

  if (error || !data) {
    // A check-constraint violation is the client sending a value outside the
    // enum, which is its fault and worth saying so rather than a 500.
    if (error?.code === '23514') {
      throw badRequest('One of those values is not a choice we accept.', {
        detail: error.message,
      });
    }
    console.error('[organizations] publish failed:', error?.message);
    throw serverError();
  }
  return { status: 201, body: toJob(data as JobRow) };
});

/**
 * POST /organizations/:id/logo — record the company mark.
 *
 * Nothing is uploaded. As with the CV in §4.1 this stores a file name and the
 * file never leaves the browser; the real endpoint should take
 * `multipart/form-data` with a `file` part and return the profile with a signed
 * URL. Kept so the contract exists, and so `logo_url` is not written by
 * something that implies more than it does.
 */
route('POST', '/organizations/:id/logo', async (req, params) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  const fileName = str(body?.fileName);
  if (!fileName) throw badRequest('Which file?', { field: 'fileName' });

  const admin = adminClient();
  const authUser = await requireUser(req);
  await requireMembership(admin, params.id, authUser.id);

  const { data, error } = await admin
    .from('organizations')
    .update({ logo_url: fileName })
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[organizations] logo failed:', error?.message);
    throw serverError();
  }
  return { body: toOrganization(data as OrganizationRow) };
});
