/**
 * The candidate as an employer sees them.
 *
 * A port of `candidateFromAccount` in src/services/candidateService.js, which
 * is the shape `EmployerCandidates` and every pipeline row render. It is
 * deliberately *not* the candidate's own profile: no summary, no salary
 * expectation, no education, no CV, no contact details, no career goal. An
 * employer discovering talent sees evidence of work, and nothing a candidate
 * did not put forward as evidence.
 *
 * Built in a batch rather than per candidate. A card draws on five tables
 * (`profiles`, `candidate_profiles`, `career_progress`, `achievement_progress`
 * joined to `achievements`, and `career_activity`), so building one card per
 * row would be five queries times the length of the list.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { resolveProgression } from './progression.ts';

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Cards for `userIds`, in no particular order. Ids without a candidate profile
 * are simply absent: an employer account, or one that has not finished
 * onboarding, is not a candidate and must not be rendered as an empty one.
 */
export async function candidateCards(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Row>> {
  const cards = new Map<string, Row>();
  if (!userIds.length) return cards;

  const ids = [...new Set(userIds)];

  const [profiles, candidateProfiles, progress, awarded, activity] = await Promise.all([
    admin.from('profiles').select('id, display_name').in('id', ids),
    admin.from('candidate_profiles').select('*').in('user_id', ids),
    admin.from('career_progress').select('user_id, xp, reputation').in('user_id', ids),
    admin
      .from('achievement_progress')
      .select('user_id, awarded_at, achievement:achievements(name, sort_order)')
      .in('user_id', ids)
      .not('awarded_at', 'is', null),
    admin
      .from('career_activity')
      .select('user_id, label, created_at')
      .in('user_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  const nameOf = new Map(
    ((profiles.data ?? []) as Row[]).map((r) => [String(r.id), str(r.display_name)]),
  );
  const progressOf = new Map(((progress.data ?? []) as Row[]).map((r) => [String(r.user_id), r]));

  const achievementsOf = new Map<string, string[]>();
  for (const row of (awarded.data ?? []) as Row[]) {
    const key = String(row.user_id);
    const name = str((row.achievement as Row | null)?.name);
    if (!name) continue;
    achievementsOf.set(key, [...(achievementsOf.get(key) ?? []), name]);
  }

  // Three most recent, matching the mock's `.slice(0, 3)`.
  const activityOf = new Map<string, string[]>();
  for (const row of (activity.data ?? []) as Row[]) {
    const key = String(row.user_id);
    const held = activityOf.get(key) ?? [];
    if (held.length >= 3) continue;
    activityOf.set(key, [...held, str(row.label)]);
  }

  for (const profile of (candidateProfiles.data ?? []) as Row[]) {
    const userId = String(profile.user_id);
    const own = progressOf.get(userId);
    const level = resolveProgression(num(own?.xp)).level;
    const reputation = num(own?.reputation);

    cards.set(userId, {
      id: userId,
      name: nameOf.get(userId) ?? '',
      headline: str(profile.headline) || 'Grooveli candidate',
      location: str(profile.location) || 'Location not set',
      careerLevel: level,
      reputation,
      // A fixed accent, as the mock has it: a real account has no brand colour
      // and inventing one per person would read as data it is not.
      color: '#5be3c8',
      skills: arr(profile.skills).map((s) => {
        const skill = s as Row;
        return {
          name: str(skill.name),
          level: skill.level ?? null,
          verified: Boolean(skill.verified),
          score: skill.score ?? null,
        };
      }),
      experience: arr(profile.experience).map((e) => {
        const entry = e as Row;
        return {
          title: str(entry.title),
          organization: str(entry.organization),
          years: entry.endDate
            ? `${str(entry.startDate)} - ${str(entry.endDate)}`
            : `${str(entry.startDate)} - present`,
        };
      }),
      achievements: achievementsOf.get(userId) ?? [],
      activity: activityOf.get(userId) ?? [],
      openTo: arr(profile.open_to),
      workTypes: arr(profile.work_types),
      // Employer discovery orders by proven strength, which is reputation
      // first. This is NOT the candidate-facing job match score: that is a
      // (job, profile) function and means something else entirely. The mock
      // uses the same formula; the comment there says the same thing.
      matchScore: reputation + Math.min(20, level),
    });
  }

  return cards;
}

/** One card, or null when that account is not a candidate. */
export async function candidateCard(admin: SupabaseClient, userId: string): Promise<Row | null> {
  const cards = await candidateCards(admin, [userId]);
  return cards.get(userId) ?? null;
}
