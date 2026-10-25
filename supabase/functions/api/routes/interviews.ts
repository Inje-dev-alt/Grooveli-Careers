/**
 * Interview simulation (handoff §4.7) — a real exam, not a random score.
 *
 * **The pass rule is binary and enforced here:** the interview plays until one
 * side reaches two. Two correct answers pass; two wrong answers end it. No
 * partial credit and no participation award — an exam everyone passes
 * certifies nothing, and only a pass is worth XP and the Interview Ready
 * badge.
 *
 * **The answer key never leaves this module.** The prototype shipped every
 * `answerIndex` and rationale in `src/data/interviewQuestions.js`, so the exam
 * was open-book to anyone who opened devtools — and the badge it awarded was
 * worth exactly that. A question is served with its options and nothing else;
 * the rationale rides back with the grade, because the point of a practice
 * interview is the feedback rather than the score.
 *
 * **The paper is drawn once, at the start.** `question_ids` is fixed when the
 * attempt begins, so a candidate cannot reroll into easier questions by
 * retrying the same attempt.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { badRequest, notFound, serverError } from '../_shared/errors.ts';
import { requireUser } from '../_shared/auth.ts';

type Row = Record<string, unknown>;

/** Four questions a paper, first to two decides it. Mirrors §4.7. */
const QUESTIONS_PER_ATTEMPT = 4;
const PASS_AT = 2;
const FAIL_AT = 2;
const RULE = 'Two correct answers pass. Two wrong answers end the interview.';

const str = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** What a candidate may see: the question and its options, never the key. */
function presentQuestion(row: Row) {
  return { id: row.id, question: row.question, options: row.options ?? [] };
}

/** An attempt without its paper — the drawn ids are not the candidate's. */
function presentAttempt(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    pathId: row.path_id ?? null,
    pathTitle: row.path_title ?? '',
    jobTitle: row.job_title ?? '',
    answers: (row.answers ?? []) as unknown[],
    correctCount: num(row.correct_count),
    wrongCount: num(row.wrong_count),
    status: row.status,
    passed: row.passed ?? null,
    score: row.score ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
  };
}

function toInterview(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id ?? null,
    companyName: row.company_name ?? '',
    jobTitle: row.job_title ?? '',
    type: row.type,
    scheduledAt: row.scheduled_at,
    status: row.status,
    score: row.score ?? null,
  };
}

/**
 * The path this attempt sits, and the bank it draws from.
 *
 * Defaults to the account's **explicit** `career_path_id`, which is also what
 * gates which path missions it is served — so the default simulation is always
 * the one a path mission's objective is asking for.
 *
 * A caller may name another path, and that is honoured: practising another
 * field's questions is a legitimate thing to want. It is recorded on the
 * attempt, so an objective keyed to a path counts only simulations actually
 * sat for it. Practising Software does not finish an HR mission, which is
 * what the objective's own words already say.
 */
async function resolvePath(admin: ReturnType<typeof adminClient>, userId: string, asked: string) {
  let pathId = asked;
  if (!pathId) {
    const { data } = await admin
      .from('candidate_profiles')
      .select('career_path_id')
      .eq('user_id', userId)
      .maybeSingle();
    pathId = str((data as Row | null)?.career_path_id);
  }

  if (!pathId) return { pathId: null, pathTitle: 'General', bankId: 'bank-general' };

  const { data } = await admin
    .from('career_paths')
    .select('id, title, interview_bank_id')
    .eq('id', pathId)
    .maybeSingle();
  const path = data as Row | null;
  if (!path) return { pathId: null, pathTitle: 'General', bankId: 'bank-general' };

  return {
    pathId: String(path.id),
    pathTitle: str(path.title),
    bankId: str(path.interview_bank_id) || 'bank-general',
  };
}

/** Fisher-Yates. Variety, not security — the paper is not a secret, the key is. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* -------------------------------------------------------------- start --- */

route('POST', '/interviews/start', async (req) => {
  const body = (await req.json().catch(() => null)) as Row | null;

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { pathId, pathTitle, bankId } = await resolvePath(admin, authUser.id, str(body?.pathId));

  const { data: bank } = await admin
    .from('interview_questions')
    .select('*')
    .eq('bank_id', bankId)
    .order('sort_order', { ascending: true });

  let questions = (bank ?? []) as Row[];
  if (!questions.length) {
    // A path whose bank was never seeded would otherwise serve an empty exam.
    const { data: general } = await admin
      .from('interview_questions')
      .select('*')
      .eq('bank_id', 'bank-general')
      .order('sort_order', { ascending: true });
    questions = (general ?? []) as Row[];
  }
  if (!questions.length) {
    console.error('[interviews] no questions in any bank');
    throw serverError();
  }

  const drawn = shuffle(questions).slice(0, QUESTIONS_PER_ATTEMPT);

  const { data, error } = await admin
    .from('interview_attempts')
    .insert({
      id: `iva-${crypto.randomUUID().slice(0, 12)}`,
      user_id: authUser.id,
      path_id: pathId,
      path_title: pathTitle,
      job_title: str(body?.jobTitle) || `${pathTitle} interview`,
      question_ids: drawn.map((q) => String(q.id)),
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[interviews] start failed:', error?.message);
    throw serverError();
  }

  return {
    status: 201,
    body: {
      attempt: presentAttempt(data as Row),
      question: presentQuestion(drawn[0]),
      questionNumber: 1,
      total: Math.min(QUESTIONS_PER_ATTEMPT, drawn.length),
      rule: RULE,
    },
  };
});

/* ------------------------------------------------------------- answer --- */

/**
 * POST /interviews/:id/answer — grade one, and end the attempt the moment
 * either side reaches two.
 *
 * The question must be the one actually in front of the candidate: its id has
 * to match the next unanswered slot of this attempt's own paper. Without that
 * check a caller could answer the easiest question in their paper four times,
 * or answer one they were never served.
 */
route('POST', '/interviews/:id/answer', async (req, params) => {
  const body = (await req.json().catch(() => null)) as Row | null;
  const questionId = str(body?.questionId);
  const optionIndex = Number(body?.optionIndex);
  if (!questionId) throw badRequest('Which question?', { field: 'questionId' });
  if (!Number.isInteger(optionIndex) || optionIndex < 0) {
    throw badRequest('Answer with the index of an option.', { field: 'optionIndex' });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: found } = await admin
    .from('interview_attempts')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', authUser.id)
    .maybeSingle();
  if (!found) throw notFound('That interview no longer exists.');

  const attempt = found as Row;
  if (attempt.status !== 'in-progress') {
    throw badRequest('This interview is already finished.');
  }

  const paper = ((attempt.question_ids ?? []) as unknown[]).map(String);
  const answers = ((attempt.answers ?? []) as Row[]).slice();
  const expected = paper[answers.length];
  if (questionId !== expected) {
    throw badRequest('That is not the question in front of you.', { field: 'questionId' });
  }

  const { data: questionRow } = await admin
    .from('interview_questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle();
  if (!questionRow) {
    console.error('[interviews] paper names a question that is gone:', questionId);
    throw serverError();
  }

  const question = questionRow as Row;
  const correct = optionIndex === num(question.answer_index);

  answers.push({ questionId, optionIndex, correct, at: new Date().toISOString() });
  const correctCount = num(attempt.correct_count) + (correct ? 1 : 0);
  const wrongCount = num(attempt.wrong_count) + (correct ? 0 : 1);

  const finished =
    correctCount >= PASS_AT || wrongCount >= FAIL_AT || answers.length >= paper.length;
  const passed = finished ? correctCount >= PASS_AT : null;
  // Scored on answers actually given: 2-0 is 100, 2-1 is 67.
  const score = finished ? Math.round((correctCount / answers.length) * 100) : null;

  const patch: Row = {
    answers,
    correct_count: correctCount,
    wrong_count: wrongCount,
  };
  if (finished) {
    patch.status = passed ? 'passed' : 'failed';
    patch.passed = passed;
    patch.score = score;
    patch.completed_at = new Date().toISOString();
  }

  const { data: updated, error } = await admin
    .from('interview_attempts')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !updated) {
    console.error('[interviews] answer failed:', error?.message);
    throw serverError();
  }

  let nextQuestion: Row | null = null;
  if (!finished) {
    const nextId = paper[answers.length];
    const { data: next } = await admin
      .from('interview_questions').select('*').eq('id', nextId).maybeSingle();
    nextQuestion = next as Row | null;
  }

  return {
    body: {
      correct,
      // Released with the grade, not before: this is the feedback the exam is
      // for, and by now the answer has already been committed.
      correctOptionIndex: num(question.answer_index),
      rationale: question.rationale,
      correctCount,
      wrongCount,
      finished,
      passed,
      score,
      questionNumber: answers.length + 1,
      nextQuestion: nextQuestion ? presentQuestion(nextQuestion) : null,
      attempt: presentAttempt(updated as Row),
    },
  };
});

/* -------------------------------------------------------------- reads --- */

/** GET /interviews/attempts — this account's, newest first. */
route('GET', '/interviews/attempts', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('interview_attempts')
    .select('*')
    .eq('user_id', authUser.id)
    .order('started_at', { ascending: false });
  return { body: ((data ?? []) as Row[]).map(presentAttempt) };
});

/**
 * GET /interviews/pass-rate — across completed attempts.
 *
 * `rate` is null rather than 0 when nothing has been sat: a candidate who has
 * never tried has no pass rate, and showing 0% would read as having failed.
 */
route('GET', '/interviews/pass-rate', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('interview_attempts')
    .select('status')
    .eq('user_id', authUser.id)
    .in('status', ['passed', 'failed']);

  const rows = (data ?? []) as Row[];
  if (!rows.length) return { body: { attempts: 0, passed: 0, rate: null } };
  const passed = rows.filter((r) => r.status === 'passed').length;
  return {
    body: { attempts: rows.length, passed, rate: Math.round((passed / rows.length) * 100) },
  };
});

/** GET /interviews — scheduled and completed interviews, soonest first. */
route('GET', '/interviews', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('interviews')
    .select('*')
    .eq('user_id', authUser.id)
    .order('scheduled_at', { ascending: true });
  return { body: ((data ?? []) as Row[]).map(toInterview) };
});

/**
 * POST /interviews/simulations — record a completed simulation on the
 * candidate's interview list.
 *
 * The score is not taken on trust: it is read from the caller's own most
 * recent passed attempt. The frontend reports that a simulation finished; what
 * it was worth is already in `interview_attempts`, and accepting a number here
 * would be a second, softer way to claim a result.
 */
route('POST', '/interviews/simulations', async (req) => {
  const body = (await req.json().catch(() => null)) as Row | null;

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { data: latest } = await admin
    .from('interview_attempts')
    .select('*')
    .eq('user_id', authUser.id)
    .eq('status', 'passed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const attempt = latest as Row | null;
  if (!attempt) {
    throw badRequest('There is no passed simulation to record.');
  }

  const { data, error } = await admin
    .from('interviews')
    .insert({
      id: `int-${crypto.randomUUID().slice(0, 12)}`,
      user_id: authUser.id,
      company_name: str(body?.companyName) || 'Grooveli AI',
      job_title: str(body?.jobTitle) || str(attempt.job_title) || 'Interview simulation',
      type: 'simulation',
      scheduled_at: attempt.completed_at ?? new Date().toISOString(),
      status: 'completed',
      score: attempt.score ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[interviews] record simulation failed:', error?.message);
    throw serverError();
  }
  return { status: 201, body: toInterview(data as Row) };
});
