/**
 * Interview simulation: a real exam, not a random score.
 * Backed by `POST /interviews/start`, `POST /interviews/:id/answer`,
 * `GET /interviews/attempts`.
 *
 * THE PASS RULE, and it is deliberately binary: the interview plays until one
 * side reaches two. Two correct answers and you pass; two wrong answers and
 * you fail. There is no partial credit and no participation award - an
 * interview that everyone passes certifies nothing, and the "Interview Ready"
 * badge is only worth wearing if it can be failed.
 *
 * The question bank comes from the candidate's career path (inferred from the
 * profile), so an HR candidate sits HR questions - including the shortlist
 * scenario that decides whether they can defend a cut.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, nextId, currentAccount } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { resolvePathForProfile } from '../data/careerPaths.js';
import { INTERVIEW_BANKS, QUESTIONS_PER_ATTEMPT, PASS_AT, FAIL_AT } from '../data/interviewQuestions.js';

function profileForUser() {
  const account = currentAccount();
  return account?.candidateProfileId ? db.profiles[account.candidateProfileId] ?? null : null;
}

function attemptsForUser() {
  const id = currentAccount()?.id;
  if (!id) return [];
  return (db.interviewAttempts[id] = db.interviewAttempts[id] ?? []);
}

/** Fisher-Yates, seeded by nothing in particular - variety, not security. */
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The question minus its answer - what the candidate is allowed to see. */
function presentQuestion(question) {
  return { id: question.id, question: question.question, options: question.options };
}

/**
 * Begin a simulation.
 * @param {{ pathId?: string, jobTitle?: string }} [options]
 * @returns {Promise<{ attempt: object, question: object, questionNumber: number, total: number, rule: string }>}
 */
export function startInterviewSimulation(options = {}) {
  return withMock(
    async () => {
      await delay(700);
      const account = currentAccount();
      if (!account) throw new Error('Your session has expired. Sign in again.');

      const profile = profileForUser();
      const path = options.pathId
        ? { id: options.pathId, title: options.pathId, interviewBankId: `bank-${options.pathId}` }
        : resolvePathForProfile(profile);
      const bank = INTERVIEW_BANKS[path.interviewBankId] ?? INTERVIEW_BANKS['bank-general'];
      const drawn = shuffle(bank).slice(0, QUESTIONS_PER_ATTEMPT);

      const attempt = {
        id: nextId('iva'),
        userId: account.id,
        pathId: path.id,
        pathTitle: path.title,
        jobTitle: options.jobTitle || `${path.title} interview`,
        questionIds: drawn.map((q) => q.id),
        answers: [],
        correctCount: 0,
        wrongCount: 0,
        status: 'in-progress',
        passed: null,
        score: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      };
      attemptsForUser().unshift(attempt);

      return {
        attempt: presentAttempt(attempt),
        question: presentQuestion(drawn[0]),
        questionNumber: 1,
        total: QUESTIONS_PER_ATTEMPT,
        rule: `Two correct answers pass. Two wrong answers end the interview.`,
        // The answer key never leaves the service - the real backend keeps it
        // server-side for the same reason.
      };
    },
    () => apiClient.post('/interviews/start', options),
  );
}

/**
 * Grade one answer. Ends the attempt the moment either side reaches two.
 * @param {string} attemptId
 * @param {string} questionId
 * @param {number} optionIndex
 */
export function answerQuestion(attemptId, questionId, optionIndex) {
  return withMock(
    async () => {
      await delay(520);
      const attempt = attemptsForUser().find((a) => a.id === attemptId);
      if (!attempt) throw new Error('That interview no longer exists.');
      if (attempt.status !== 'in-progress') throw new Error('This interview is already finished.');

      const path = { interviewBankId: `bank-${attempt.pathId}` };
      const bank =
        Object.values(INTERVIEW_BANKS).find((b) => b.some((q) => q.id === questionId)) ??
        INTERVIEW_BANKS[path.interviewBankId] ??
        INTERVIEW_BANKS['bank-general'];
      const question = bank.find((q) => q.id === questionId);
      if (!question) throw new Error('That question is not in your paper.');

      const correct = optionIndex === question.answerIndex;
      attempt.answers.push({ questionId, optionIndex, correct, at: new Date().toISOString() });
      if (correct) attempt.correctCount += 1;
      else attempt.wrongCount += 1;

      let finished = false;
      if (attempt.correctCount >= PASS_AT || attempt.wrongCount >= FAIL_AT || attempt.answers.length >= attempt.questionIds.length) {
        finished = true;
        attempt.status = attempt.correctCount >= PASS_AT ? 'passed' : 'failed';
        attempt.passed = attempt.status === 'passed';
        attempt.completedAt = new Date().toISOString();
        // Scored on answers actually given: 2-0 is 100, 2-1 is 67.
        attempt.score = Math.round((attempt.correctCount / attempt.answers.length) * 100);
      }

      const nextIdInPaper = attempt.answers.length;
      const nextQuestionId = finished ? null : attempt.questionIds[nextIdInPaper];
      const nextQuestion = nextQuestionId
        ? (bank.find((q) => q.id === nextQuestionId) ?? null)
        : null;

      return {
        correct,
        correctOptionIndex: question.answerIndex,
        rationale: question.rationale,
        correctCount: attempt.correctCount,
        wrongCount: attempt.wrongCount,
        finished,
        passed: attempt.passed,
        score: attempt.score,
        questionNumber: attempt.answers.length + 1,
        nextQuestion: nextQuestion ? presentQuestion(nextQuestion) : null,
        attempt: presentAttempt(attempt),
      };
    },
    () => apiClient.post(`/interviews/${attemptId}/answer`, { questionId, optionIndex }),
  );
}

/** Strip the paper from an attempt before it leaves the service. */
function presentAttempt(attempt) {
  const { questionIds: _paper, ...rest } = attempt;
  return { ...rest };
}

/** @returns {Promise<object[]>} this account's attempts, newest first */
export function listInterviewAttempts() {
  return withMock(
    async () => {
      await delay(180);
      return attemptsForUser().map(presentAttempt);
    },
    () => apiClient.get('/interviews/attempts'),
  );
}

/** The pass rate across completed attempts, for the profile surface. */
export function interviewPassRate() {
  return withMock(
    async () => {
      await delay(120);
      const done = attemptsForUser().filter((a) => a.status === 'passed' || a.status === 'failed');
      if (done.length === 0) return { attempts: 0, passed: 0, rate: null };
      const passed = done.filter((a) => a.status === 'passed').length;
      return { attempts: done.length, passed, rate: Math.round((passed / done.length) * 100) };
    },
    () => apiClient.get('/interviews/pass-rate'),
  );
}