/**
 * Organizations: shaping, and the membership check every employer write runs.
 *
 * The one rule this file exists to enforce: **an employer may only act on an
 * organization they belong to.** The prototype had no such check — the browser
 * passed an `organizationId` and the mock trusted it — so publishing a job or
 * moving somebody else's pipeline was a matter of changing one string in a
 * request. `organization_memberships` has always been the table that answers
 * this; nothing was asking it.
 *
 * Permission *levels* are deliberately not enforced. `role` is recorded
 * (`owner` | `admin` | `recruiter` | `hiring-manager`) and returned, so the UI
 * can show it, but every member may do every employer action for now. The
 * handoff lists organization permission enforcement as out of scope, and a
 * half-built permission model reads as a guarantee while being none.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { forbidden, notFound } from './errors.ts';

export type OrganizationRow = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  industry: string;
  size_band: string;
  location: string;
  website: string;
  district_id: string;
  logo_color: string;
  logo_url: string | null;
  follower_count: number;
  verified: boolean;
  created_at: string;
};

/** Row to the §4.2 Organization JSON. */
export function toOrganization(row: OrganizationRow) {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    industry: row.industry,
    // `size`, not `sizeBand`: the column is `size_band` but the frontend's
    // Organization has always called this `size` — five screens render
    // `{organization.size} people` and the company form posts `size` back.
    // `POST /organizations` in routes/onboarding.ts already answers `size`, so
    // naming it after the column here would have made the create response and
    // every later read disagree.
    size: row.size_band,
    location: row.location,
    website: row.website,
    districtId: row.district_id,
    logoColor: row.logo_color,
    logoUrl: row.logo_url ?? null,
    followerCount: row.follower_count,
    verified: row.verified,
    createdAt: row.created_at,
  };
}

/**
 * The caller's membership of this organization, or a refusal.
 *
 * 404 rather than 403 when the organization does not exist, and 403 only once
 * it is established that it does and the caller is outside it — the §3 rule
 * about not leaking whether a thing exists applies to a candidate's private
 * rows, not to companies, which are public objects with public profiles.
 */
export async function requireMembership(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
) {
  const { data: organization } = await admin
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle();
  if (!organization) throw notFound('That company profile does not exist anymore.');

  const { data: membership } = await admin
    .from('organization_memberships')
    .select('organization_id, role, title, joined_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) throw forbidden('You do not have access to that company.');

  return {
    organization: organization as OrganizationRow,
    membership: membership as Record<string, unknown>,
  };
}

/**
 * Does this account belong to that organization?
 *
 * The predicate form, for a caller that has to decide *which* authority it is
 * acting under rather than assert one — `PATCH /applications/:id` serves both
 * the candidate who applied and the hiring employer, so it asks before it
 * refuses.
 */
export async function isMember(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('organization_memberships')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

/** Every organization id the caller belongs to. */
export async function membershipIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await admin
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId);
  return ((data ?? []) as { organization_id: string }[]).map((r) => r.organization_id);
}

/** The job ids belonging to one organization. */
export async function organizationJobIds(
  admin: SupabaseClient,
  organizationId: string,
): Promise<string[]> {
  const { data } = await admin.from('jobs').select('id').eq('organization_id', organizationId);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}
