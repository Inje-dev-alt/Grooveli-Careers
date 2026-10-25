/**
 * Learning (handoff §5) — the Training Centre's catalogue and enrolments.
 *
 * The rule this exists to keep: **a course completes once.** The certification
 * count is a fact about the account, and the mission objective listening for
 * `course.completed` must not be farmable by re-clicking a card. So completion
 * is a row transition, and completing an already-completed course answers
 * `alreadyCompleted: true` rather than doing it again.
 *
 * Note what this endpoint does **not** do: it does not award XP, and it does
 * not touch the `certifications` statistic. Both belong to the career event
 * the client fires afterwards — `course.completed` is worth 200 XP and maps to
 * `certifications` in `STAT_FOR_EVENT`, applied inside
 * `apply_career_event`. The prototype's mock bumped the counter here *as well*,
 * so finishing one course certified you twice.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';

type Row = Record<string, unknown>;

const str = (v: unknown) => String(v ?? '').trim();

function toCourse(row: Row, enrolment: Row | undefined) {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider ?? '',
    description: row.description ?? '',
    skill: row.skill ?? '',
    pathIds: row.path_ids ?? [],
    weeks: row.weeks ?? 0,
    level: row.level ?? 'Beginner',
    certification: row.certification ?? true,
    xpReward: row.xp_reward ?? 0,
    enrolled: Boolean(enrolment),
    completed: enrolment?.status === 'completed',
  };
}

function toEnrolment(row: Row) {
  return {
    id: row.id,
    courseId: row.course_id,
    status: row.status,
    enrolledAt: row.enrolled_at,
    completedAt: row.completed_at ?? null,
  };
}

/** This account's enrolments, by course id. */
async function enrolmentsOf(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data } = await admin.from('course_enrollments').select('*').eq('user_id', userId);
  const byCourse = new Map<string, Row>();
  for (const row of (data ?? []) as Row[]) byCourse.set(String(row.course_id), row);
  return byCourse;
}

/**
 * GET /learning/courses — the catalogue, annotated with this account's state.
 *
 * Sorted so the candidate's own path comes first and everything else keeps
 * catalogue order, which is what the Training Centre renders.
 */
route('GET', '/learning/courses', async (req) => {
  const url = new URL(req.url);
  const skill = str(url.searchParams.get('skill'));
  const askedPath = str(url.searchParams.get('pathId'));

  const admin = adminClient();
  const authUser = await requireUser(req);

  let myPath = askedPath;
  if (!myPath) {
    const { data } = await admin
      .from('candidate_profiles')
      .select('career_path_id')
      .eq('user_id', authUser.id)
      .maybeSingle();
    myPath = str((data as Row | null)?.career_path_id);
  }

  const { data, error } = await admin
    .from('courses')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[learning] catalogue failed:', error.message);
    throw serverError();
  }

  const enrolments = await enrolmentsOf(admin, authUser.id);
  const rows = ((data ?? []) as Row[]).filter((row) => !skill || row.skill === skill);

  // Stable: only the recommended ones move, and they keep their order among
  // themselves.
  const recommended = (row: Row) =>
    Boolean(myPath) && ((row.path_ids ?? []) as string[]).includes(myPath);
  const sorted = [
    ...rows.filter(recommended),
    ...rows.filter((row) => !recommended(row)),
  ];

  return { body: sorted.map((row) => toCourse(row, enrolments.get(String(row.id)))) };
});

/** GET /learning/enrollments — this account's rows. */
route('GET', '/learning/enrollments', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('course_enrollments')
    .select('*')
    .eq('user_id', authUser.id)
    .order('enrolled_at', { ascending: false });
  return { body: ((data ?? []) as Row[]).map(toEnrolment) };
});

/** POST /learning/courses/:id/enrol — idempotent; enrolling twice returns the row. */
route('POST', '/learning/courses/:id/enrol', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: course } = await admin
    .from('courses').select('id').eq('id', params.id).maybeSingle();
  if (!course) throw notFound('That course is no longer offered.');

  const { data: existing } = await admin
    .from('course_enrollments')
    .select('*')
    .eq('user_id', authUser.id)
    .eq('course_id', params.id)
    .maybeSingle();
  if (existing) return { body: toEnrolment(existing as Row) };

  const { data, error } = await admin
    .from('course_enrollments')
    .insert({
      id: `enr-${crypto.randomUUID().slice(0, 12)}`,
      user_id: authUser.id,
      course_id: params.id,
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[learning] enrol failed:', error?.message);
    throw serverError();
  }
  return { status: 201, body: toEnrolment(data as Row) };
});

/**
 * POST /learning/courses/:id/complete — finish it.
 *
 * `alreadyCompleted` is the whole contract: the client only fires
 * `course.completed` when this answers false, so the 200 XP and the
 * certification are claimed once however many times the button is pressed.
 * The career event is keyed on `courseId` as well, so even a client that
 * ignored this would be refused by the event itself.
 *
 * Enrols on the way through if the account never did — finishing a course you
 * started elsewhere should not require pressing enrol first.
 */
route('POST', '/learning/courses/:id/complete', async (req, params) => {
  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: course } = await admin
    .from('courses').select('id').eq('id', params.id).maybeSingle();
  if (!course) throw notFound('That course is no longer offered.');

  const { data: existing } = await admin
    .from('course_enrollments')
    .select('*')
    .eq('user_id', authUser.id)
    .eq('course_id', params.id)
    .maybeSingle();

  const enrolment = existing as Row | null;
  if (enrolment?.status === 'completed') {
    return {
      body: {
        courseId: params.id,
        alreadyCompleted: true,
        completedAt: enrolment.completed_at ?? null,
      },
    };
  }

  const completedAt = new Date().toISOString();
  const { error } = await admin
    .from('course_enrollments')
    .upsert(
      {
        id: enrolment ? enrolment.id : `enr-${crypto.randomUUID().slice(0, 12)}`,
        user_id: authUser.id,
        course_id: params.id,
        status: 'completed',
        enrolled_at: enrolment?.enrolled_at ?? completedAt,
        completed_at: completedAt,
      },
      { onConflict: 'user_id,course_id' },
    );
  if (error) {
    console.error('[learning] complete failed:', error.message);
    throw serverError();
  }

  return { body: { courseId: params.id, alreadyCompleted: false, completedAt } };
});
