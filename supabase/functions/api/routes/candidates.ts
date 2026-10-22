import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { calculateCompleteness, loadProfile } from '../_shared/users.ts';

type ProfileRow = Record<string, unknown>;

/** Row to the normalised CandidateProfile JSON (§4.1). */
function toProfile(row: ProfileRow) {
  return {
    id: row.id,
    userId: row.user_id,
    gender: row.gender ?? null,
    careerPathId: row.career_path_id ?? null,
    headline: row.headline ?? '',
    summary: row.summary ?? '',
    location: row.location ?? '',
    yearsExperience: row.years_experience ?? 0,
    careerGoal: row.career_goal ?? '',
    careerInterests: row.career_interests ?? [],
    workTypes: row.work_types ?? [],
    openTo: row.open_to ?? [],
    salaryExpectation: {
      min: row.salary_min ?? 0,
      max: row.salary_max ?? 0,
      currency: row.currency ?? 'NGN',
    },
    industries: row.industries ?? [],
    skills: row.skills ?? [],
    experience: row.experience ?? [],
    education: row.education ?? [],
    cv: row.cv ?? { hasCv: false },
    completeness: row.completeness ?? 0,
  };
}

/** The signed-in candidate's profile row, or a §3 error before onboarding. */
async function myProfile(admin: ReturnType<typeof adminClient>, req: Request) {
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('candidate_profiles').select('*').eq('user_id', authUser.id).maybeSingle();
  if (!data) throw badRequest('No career profile on this account yet.');
  return { authUser, row: data as ProfileRow };
}

async function saveRow(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  patch: Record<string, unknown>,
): Promise<ProfileRow> {
  const { data, error } = await admin
    .from('candidate_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error || !data) {
    console.error('[candidates] save failed:', error?.message);
    throw serverError();
  }
  // Completeness is recomputed on the stored row with the frontend's exact
  // weighting - the two must agree (§4.1).
  const completeness = calculateCompleteness(data as ProfileRow);
  if (completeness !== (data as ProfileRow).completeness) {
    const { data: updated } = await admin
      .from('candidate_profiles')
      .update({ completeness })
      .eq('user_id', userId)
      .select('*')
      .single();
    return (updated as ProfileRow) ?? { ...data, completeness };
  }
  return data as ProfileRow;
}

/** camelCase patch to whitelisted snake columns; unknown keys are ignored. */
const GENDERS = ['female', 'male', 'non-binary', 'prefer-not-to-say'];
function columnsFromPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.gender !== undefined) {
    if (patch.gender !== null && !GENDERS.includes(String(patch.gender))) {
      throw badRequest('Choose one of the offered gender options.', { field: 'gender' });
    }
    out.gender = patch.gender;
  }
  if (patch.headline !== undefined) out.headline = String(patch.headline ?? '');
  if (patch.summary !== undefined) out.summary = String(patch.summary ?? '');
  if (patch.location !== undefined) out.location = String(patch.location ?? '');
  if (patch.yearsExperience !== undefined) out.years_experience = Number(patch.yearsExperience) || 0;
  if (patch.careerGoal !== undefined) out.career_goal = String(patch.careerGoal ?? '');
  if (patch.careerInterests !== undefined) out.career_interests = patch.careerInterests ?? [];
  if (patch.careerPathId !== undefined) out.career_path_id = patch.careerPathId || null;
  if (patch.workTypes !== undefined) out.work_types = patch.workTypes ?? [];
  if (patch.openTo !== undefined) out.open_to = patch.openTo ?? [];
  if (patch.industries !== undefined) out.industries = patch.industries ?? [];
  if (patch.skills !== undefined) out.skills = patch.skills ?? [];
  if (patch.experience !== undefined) out.experience = patch.experience ?? [];
  if (patch.education !== undefined) out.education = patch.education ?? [];
  if (patch.salaryExpectation !== undefined) {
    const s = patch.salaryExpectation as { min?: number; max?: number; currency?: string };
    out.salary_min = Number(s?.min) || 0;
    out.salary_max = Number(s?.max) || 0;
    out.currency = s?.currency || 'NGN';
  }
  return out;
}

// GET /candidates/me — the profile, with completeness the API owns (§4.1).
route('GET', '/candidates/me', async (req) => {
  const admin = adminClient();
  const { row } = await myProfile(admin, req);
  return { body: toProfile(row) };
});

// PATCH /candidates/me — partial update, whitelist-mapped; then recompute
// completeness against the stored row.
route('PATCH', '/candidates/me', async (req) => {
  const patch = await req.json().catch(() => null);
  if (!patch || typeof patch !== 'object') throw badRequest('Send the request as JSON.');
  const admin = adminClient();
  const { authUser, row } = await myProfile(admin, req);
  const columns = columnsFromPatch(patch as Record<string, unknown>);
  // Interests changed without an explicit path: keep §4.1's rule honest - the
  // first interest decides the home path when none is pinned yet.
  if (columns.career_interests !== undefined && columns.career_path_id === undefined) {
    const interests = columns.career_interests as string[];
    if (!row.career_path_id && interests?.length) {
      const { data: path } = await admin
        .from('career_paths').select('id').eq('title', interests[0]).maybeSingle();
      if (path) columns.career_path_id = path.id;
    }
  }
  return { body: toProfile(await saveRow(admin, authUser.id, columns)) };
});

// POST /candidates/me/cv — the prototype records the file reference only
// (§4.1 cv shape: { hasCv, fileName, updatedAt }).
route('POST', '/candidates/me/cv', async (req) => {
  const body = await req.json().catch(() => null);
  const fileName = String(body?.fileName ?? '').trim();
  if (!fileName) throw badRequest('Choose a file to upload.', { field: 'fileName' });
  const admin = adminClient();
  const { authUser } = await myProfile(admin, req);
  return {
    body: toProfile(await saveRow(admin, authUser.id, {
      cv: { hasCv: true, fileName, updatedAt: new Date().toISOString() },
    })),
  };
});

// POST /candidates/me/skills/verify — an unverified self-rating must never
// come back verified (§4.1); this endpoint is the evidence trail. Mirrors
// the prototype's numbers: existing skill gains verified+score and +4 level,
// a new skill lands at level 70.
route('POST', '/candidates/me/skills/verify', async (req) => {
  const body = await req.json().catch(() => null);
  const skillName = String(body?.skill ?? '').trim();
  if (!skillName) throw badRequest('Name the skill that was assessed.', { field: 'skill' });
  const score = Number(body?.score) || 90;
  const admin = adminClient();
  const { authUser, row } = await myProfile(admin, req);
  type Skill = { id?: string; name: string; level?: number; category?: string; verified?: boolean; score?: number };
  const skills: Skill[] = [...((row.skills as Skill[]) ?? [])];
  const existing = skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
  if (existing) {
    const index = skills.indexOf(existing);
    skills[index] = {
      ...existing,
      verified: true,
      score,
      level: Math.min(100, ((existing.level as number) ?? 50) + 4),
    };
  } else {
    skills.push({
      id: `skl-${skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: skillName,
      category: 'general',
      level: 70,
      verified: true,
      score,
    });
  }
  return { body: toProfile(await saveRow(admin, authUser.id, { skills })) };
});

// POST /candidates/me/experience — prepended, newest first, as the profile
// timeline renders it.
route('POST', '/candidates/me/experience', async (req) => {
  const entry = await req.json().catch(() => null);
  if (!entry || typeof entry !== 'object') throw badRequest('Send the request as JSON.');
  if (!String((entry as { title?: string }).title ?? '').trim()) {
    throw badRequest('An experience entry needs a job title.', { field: 'title' });
  }
  const admin = adminClient();
  const { authUser, row } = await myProfile(admin, req);
  const experience = [
    { id: `exp-${Date.now()}`, ...(entry as Record<string, unknown>) },
    ...((row.experience as unknown[]) ?? []),
  ];
  return { body: toProfile(await saveRow(admin, authUser.id, { experience })) };
});

