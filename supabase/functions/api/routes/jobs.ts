import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { scoreJobForProfile, type MatchProfile } from '../_shared/matching.ts';
import { toJob, toMatchProfile, type JobRow, type CandidateProfileRow } from '../_shared/jobs.ts';
import { requireMembership } from '../_shared/organizations.ts';

/** Mirrors the `jobs.status` check constraint (§4.3). */
const JOB_STATUSES = new Set(['draft', 'published', 'paused', 'closed']);

type Scored = ReturnType<typeof toJob> & {
  matchScore?: number;
  matchReasons: string[];
  skillGaps: string[];
};

/** The caller's match profile, or null for employers and new accounts. */
async function callerProfile(admin: ReturnType<typeof adminClient>, req: Request) {
  try {
    const authUser = await requireUser(req);
    const { data } = await admin
      .from('candidate_profiles')
      .select('skills, work_types, salary_min, industries, location, years_experience')
      .eq('user_id', authUser.id)
      .maybeSingle();
    return { authUser, matchProfile: toMatchProfile((data as CandidateProfileRow | null) ?? null) };
  } catch {
    // Jobs are browsable without a resolvable profile; saved lists are not.
    return { authUser: null, matchProfile: null };
  }
}

/** Honest per-candidate match; omitted (not zero) when there is nothing to score. */
function withMatch(row: JobRow, profile: MatchProfile | null): Scored {
  const job = toJob(row);
  const result = scoreJobForProfile(job, profile);
  if (!result) return { ...job, matchReasons: [], skillGaps: [] };
  return { ...job, ...result };
}

// GET /jobs — published only; filters, matching and sorting are the backend's
// job (§4.3), mirroring the mock semantics the UI was built against.
route('GET', '/jobs', async (req) => {
  const url = new URL(req.url);
  const p = url.searchParams;
  const admin = adminClient();
  const { matchProfile } = await callerProfile(admin, req);

  const search = p.get('search')?.trim().toLowerCase();
  const districtId = p.get('districtId');
  // A company's own published roles, for the office a candidate walks into.
  // Distinct from GET /organizations/:id/jobs, which requires membership and
  // serves drafts and closed roles too — a visitor sees only what is open.
  const organizationId = p.get('organizationId');
  const location = p.get('location')?.toLowerCase();
  const industry = p.get('industry');
  const employmentTypes = p.getAll('employmentTypes');
  const workTypes = p.getAll('workTypes');
  const experienceLevels = p.getAll('experienceLevels');
  const skills = p.getAll('skills').map((s) => s.toLowerCase());
  const minSalary = Number(p.get('minSalary') ?? 0);
  const minMatch = Number(p.get('minMatch') ?? 0);
  const sort = p.get('sort') ?? 'match';

  const { data } = await admin
    .from('jobs')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as JobRow[];

  let jobs = rows
    .map((row) => withMatch(row, matchProfile))
    .filter((job) => {
      if (organizationId && job.organizationId !== organizationId) return false;
      if (districtId && job.districtId !== districtId) return false;
      if (industry && job.industry !== industry) return false;
      if (location && !job.location.toLowerCase().includes(location)) return false;
      if (employmentTypes.length && !employmentTypes.includes(job.employmentType)) return false;
      if (workTypes.length && !workTypes.includes(job.workType)) return false;
      if (experienceLevels.length && !experienceLevels.includes(job.experienceLevel)) return false;
      if (job.salaryMax < minSalary) return false;
      if (minMatch > 0 && (job.matchScore ?? 0) < minMatch) return false;
      if (skills.length) {
        const have = [...job.requiredSkills, ...job.preferredSkills].map((s) => s.toLowerCase());
        if (!skills.some((s) => have.includes(s))) return false;
      }
      if (search) {
        const haystack = [job.title, job.companyName, job.location, job.description, job.industry, ...job.requiredSkills, ...job.preferredSkills]
          .join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

  if (sort === 'recent') jobs = jobs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  else if (sort === 'salary') jobs = jobs.sort((a, b) => b.salaryMax - a.salaryMax);
  else jobs = jobs.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  return { body: jobs };
});

// Specific paths before /jobs/:id — the router matches in registration order.
route('GET', '/jobs/recommended', async (req) => {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') ?? 4)));
  const admin = adminClient();
  const { matchProfile } = await callerProfile(admin, req);
  const { data } = await admin.from('jobs').select('*').eq('status', 'published');
  const jobs = ((data ?? []) as JobRow[])
    .map((row) => withMatch(row, matchProfile))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, limit);
  return { body: jobs };
});

route('GET', '/jobs/facets', async () => {
  const { data } = await adminClient().from('jobs').select('*').eq('status', 'published');
  const rows = (data ?? []) as JobRow[];
  return {
    body: {
      industries: [...new Set(rows.map((j) => j.industry))].sort(),
      skills: [...new Set(rows.flatMap((j) => [...(j.required_skills ?? []), ...(j.preferred_skills ?? [])]))].sort(),
    },
  };
});

async function savedIds(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await admin.from('saved_jobs').select('job_id').eq('user_id', userId);
  return (data ?? []).map((r: { job_id: string }) => r.job_id);
}

route('GET', '/jobs/saved', async (req) => {
  const admin = adminClient();
  const { authUser } = await callerProfile(admin, req);
  if (!authUser) throw notFound('Sign in to see saved roles.');
  return { body: { savedJobIds: await savedIds(admin, authUser.id) } };
});

route('POST', '/jobs/:id/save', async (req, params) => {
  const admin = adminClient();
  const { authUser } = await callerProfile(admin, req);
  if (!authUser) throw notFound('Sign in to save roles.');
  const { data: job } = await admin.from('jobs').select('id').eq('id', params.id).maybeSingle();
  if (!job) throw notFound('That role is not available.');
  await admin.from('saved_jobs').upsert(
    { user_id: authUser.id, job_id: params.id },
    { onConflict: 'user_id,job_id' },
  );
  return { body: { savedJobIds: await savedIds(admin, authUser.id) } };
});

route('DELETE', '/jobs/:id/save', async (req, params) => {
  const admin = adminClient();
  const { authUser } = await callerProfile(admin, req);
  if (!authUser) throw notFound('Sign in to save roles.');
  await admin.from('saved_jobs').delete().eq('user_id', authUser.id).eq('job_id', params.id);
  return { body: { savedJobIds: await savedIds(admin, authUser.id) } };
});

// GET /jobs/:id — only published roles are visible; drafts belong to the
// employer who owns them (§4.3), so anything else is a 404.
route('GET', '/jobs/:id', async (req, params) => {
  const admin = adminClient();
  const { matchProfile } = await callerProfile(admin, req);
  const { data } = await admin
    .from('jobs').select('*').eq('id', params.id).eq('status', 'published').maybeSingle();
  if (!data) throw notFound('That role is not available.');
  return { body: withMatch(data as JobRow, matchProfile) };
});

/**
 * PATCH /jobs/:id — pause, close, publish or return a role to draft.
 *
 * The employer's counterpart to `POST /organizations/:id/jobs`. Status is the
 * only field it takes: the rest of a role is edited through the publish form,
 * and a partial edit endpoint that could rewrite salary or skills under live
 * applications is a bigger decision than this batch.
 *
 * Membership is resolved from the job's own organization, so the caller never
 * names one — the thing being changed decides who is allowed to change it.
 */
route('PATCH', '/jobs/:id', async (req, params) => {
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  const status = String(body?.status ?? '').trim();
  if (!JOB_STATUSES.has(status)) {
    throw badRequest('That is not a status a role can be in.', {
      field: 'status',
      allowed: [...JOB_STATUSES],
    });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: existing } = await admin
    .from('jobs')
    .select('organization_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!existing) throw notFound('That role no longer exists.');

  await requireMembership(admin, String((existing as { organization_id: string }).organization_id), authUser.id);

  const { data, error } = await admin
    .from('jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[jobs] status change failed:', error?.message);
    throw serverError();
  }
  return { body: toJob(data as JobRow) };
});
