import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';
import { calculateCompleteness, loadProfile, userPayload } from '../_shared/users.ts';

async function readBody(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('Send the request as JSON.');
  return body as Record<string, unknown>;
}

// POST /candidates — finish candidate onboarding: create the profile, grant
// the candidate capability, and return the updated User (§2). Progression
// starts at zero everywhere; a handed-out level makes every number
// downstream meaningless.
route('POST', '/candidates', async (req) => {
  const draft = await readBody(req);
  const admin = adminClient();
  const authUser = await requireUser(req);

  const skills = ((draft.skills as string[]) ?? []).map((name, index) => ({
    id: `skl-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
    name,
    category: 'general',
    level: 55,
    verified: false,
  }));
  const education = draft.education
    ? [{
      id: 'edu-1',
      qualification: draft.education,
      institution: draft.institution ?? '',
      year: draft.graduationYear ?? '',
    }]
    : [];

  // §4.1: explicit careerPathId wins; otherwise the first interest decides.
  let careerPathId = (draft.careerPathId as string) ?? null;
  const firstInterest = ((draft.careerInterests as string[]) ?? [])[0];
  if (!careerPathId && firstInterest) {
    const { data } = await admin
      .from('career_paths').select('id').eq('title', firstInterest).maybeSingle();
    careerPathId = data?.id ?? null;
  }

  const row = {
    user_id: authUser.id,
    career_path_id: careerPathId,
    gender: draft.gender ?? null,
    headline: draft.headline ?? '',
    summary: draft.summary ?? '',
    location: draft.location ?? '',
    years_experience: Number(draft.yearsExperience) || 0,
    career_goal: draft.careerGoal ?? '',
    career_interests: draft.careerInterests ?? [],
    work_types: draft.workTypes ?? [],
    open_to: draft.openTo ?? [],
    salary_min: Number(draft.salaryMin) || 0,
    salary_max: Number(draft.salaryMax) || 0,
    currency: draft.currency ?? 'NGN',
    industries: draft.industries ?? [],
    skills,
    experience: [],
    education,
    cv: { hasCv: false },
  };

  const { data: saved, error } = await admin
    .from('candidate_profiles')
    .upsert({ ...row, completeness: calculateCompleteness(row) }, { onConflict: 'user_id' })
    .select('id')
    .single();
  if (error || !saved) {
    console.error('[candidates] save failed:', error?.message);
    throw serverError();
  }

  const profile = await loadProfile(admin, authUser.id);
  const roles = profile.roles ?? [];
  if (!roles.includes('candidate')) roles.push('candidate');
  await admin.from('profiles').update({
    roles,
    active_role: 'candidate',
    display_name: String(draft.name ?? '').trim() || profile.display_name || 'Candidate',
  }).eq('id', authUser.id);

  return { body: await userPayload(admin, authUser) };
});

// POST /organizations — finish employer onboarding: create the organization
// and the membership that connects this person to it (§2, §4.2).
route('POST', '/organizations', async (req) => {
  const draft = await readBody(req);
  const admin = adminClient();
  const authUser = await requireUser(req);
  const companyName = String(draft.companyName ?? '').trim();
  if (!companyName) throw badRequest('Your company needs a name.', { field: 'companyName' });

  const { data: org, error } = await admin
    .from('organizations')
    .insert({
      id: `org-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
      name: companyName,
      tagline: draft.tagline ?? '',
      description: draft.description ?? '',
      industry: draft.industry || 'Technology',
      size_band: draft.size || '1-10',
      location: draft.location ?? '',
      website: draft.website ?? '',
      district_id: draft.districtId || 'corporate-district',
      logo_color: draft.logoColor || '#6c8cff',
    })
    .select('*')
    .single();
  if (error || !org) {
    console.error('[organizations] create failed:', error?.message);
    throw serverError();
  }

  const { error: memberError } = await admin.from('organization_memberships').insert({
    organization_id: org.id,
    user_id: authUser.id,
    role: draft.role || 'owner',
    title: draft.title || 'Founder',
  });
  if (memberError) {
    console.error('[organizations] membership failed:', memberError.message);
    throw serverError();
  }

  const profile = await loadProfile(admin, authUser.id);
  const roles = profile.roles ?? [];
  if (!roles.includes('employer')) roles.push('employer');
  await admin.from('profiles').update({
    roles,
    active_role: 'employer',
    display_name: String(draft.name ?? '').trim() || profile.display_name || 'Employer',
  }).eq('id', authUser.id);

  return {
    status: 201,
    body: {
      user: await userPayload(admin, authUser),
      organization: {
        id: org.id,
        name: org.name,
        tagline: org.tagline,
        description: org.description,
        industry: org.industry,
        size: org.size_band,
        location: org.location,
        website: org.website,
        districtId: org.district_id,
        logoColor: org.logo_color,
        followerCount: org.follower_count,
        verified: org.verified,
        createdAt: new Date(org.created_at).toISOString(),
      },
    },
  };
});
