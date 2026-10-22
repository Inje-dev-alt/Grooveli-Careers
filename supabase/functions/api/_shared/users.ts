import type { SupabaseClient, User } from 'jsr:@supabase/supabase-js@2';

export type ProfileRow = {
  id: string;
  display_name: string;
  roles: string[] | null;
  active_role: 'candidate' | 'employer' | null;
  avatar_url: string | null;
  created_at: string;
};

export type MembershipRow = {
  organization_id: string;
  role: string;
  title: string;
  joined_at: string;
  organization: { name: string } | null;
};

/** The §2 User JSON the frontend consumes - camelCase, opaque ids. */
export function toUser(
  authUser: User,
  profile: ProfileRow,
  memberships: MembershipRow[],
  candidateProfileId: string | null,
) {
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    displayName: profile.display_name,
    roles: profile.roles ?? [],
    activeRole: profile.active_role,
    createdAt: new Date(authUser.created_at).toISOString(),
    candidateProfileId,
    organizationMemberships: memberships.map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organization?.name ?? '',
      role: m.role,
      title: m.title,
      joinedAt: new Date(m.joined_at).toISOString(),
    })),
  };
}

/**
 * Fetch the profiles row, healing if missing: an auth user without a row
 * would be signed in but unrecognised, so create it rather than strand them.
 */
export async function loadProfile(admin: SupabaseClient, userId: string): Promise<ProfileRow> {
  const { data } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (data) return data as ProfileRow;

  const authUser = await admin.auth.admin.getUserById(userId);
  const displayName = (authUser.data.user?.user_metadata?.display_name as string) ?? '';
  const { data: created, error: createError } = await admin
    .from('profiles')
    .insert({ id: userId, display_name: displayName })
    .select('*')
    .single();
  if (createError || !created) {
    console.error('[users] profile heal failed:', createError?.message);
    throw new Error('Could not load this account.');
  }
  return created as ProfileRow;
}

export async function loadMemberships(admin: SupabaseClient, userId: string): Promise<MembershipRow[]> {
  const { data } = await admin
    .from('organization_memberships')
    .select('organization_id, role, title, joined_at, organization:organizations(name)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });
  return (data ?? []) as unknown as MembershipRow[];
}

export async function loadCandidateProfileId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('candidate_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Full §2 payload for /users/me and every onboarding response. */
export async function userPayload(admin: SupabaseClient, authUser: User) {
  const [profile, memberships, candidateProfileId] = await Promise.all([
    loadProfile(admin, authUser.id),
    loadMemberships(admin, authUser.id),
    loadCandidateProfileId(admin, authUser.id),
  ]);
  return toUser(authUser, profile, memberships, candidateProfileId);
}

/**
 * Completeness 0-100 with the exact weighting of the frontend's
 * candidateService.calculateCompleteness - the two must agree (§4.1).
 */
export function calculateCompleteness(row: Record<string, unknown>): number {
  let total = 0;
  if (String(row.headline ?? '').trim()) total += 12;
  if (String(row.summary ?? '').trim().length > 40) total += 12;
  if (String(row.location ?? '').trim()) total += 8;
  if ((row.skills as unknown[] ?? []).length >= 5) total += 18;
  if ((row.experience as unknown[] ?? []).length >= 1) total += 14;
  if ((row.education as unknown[] ?? []).length >= 1) total += 8;
  if (String(row.career_goal ?? '').trim()) total += 8;
  if (Number(row.salary_min ?? 0) > 0) total += 8;
  if ((row.cv as { hasCv?: boolean } | null)?.hasCv) total += 12;
  return total;
}
