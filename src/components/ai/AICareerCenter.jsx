import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ai.css';
import {
  Button,
  Badge,
  Panel,
  TextArea,
  AsyncBoundary,
  InlineLoading,
  IconSparkle,
  IconSend,
  IconChevronRight,
  IconCheck,
  IconAlert,
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as aiService from '../../services/aiService.js';
import * as interviewService from '../../services/interviewService.js';
import { AI_INTENTS } from '../../services/aiService.js';
import * as applicationService from '../../services/applicationService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';
import { initials } from '../../utils/format.js';

/**
 * The AI Career Center.
 *
 * Built as a career companion rather than a chat window: it opens with a
 * briefing drawn from the candidate's real state, offers the actions that
 * matter next, and only then accepts free text. Suggested actions carry an
 * intent rather than a prompt string, which is what lets the backend route them
 * to tools later without re-parsing English.
 *
 * The interview simulation here is a graded exam, not a random score: four
 * questions from the candidate's career-path bank, first to two correct passes,
 * first to two wrong fails. Only a pass earns the event, the XP and the
 * Interview Ready badge - an exam that cannot be failed certifies nothing.
 *
 * No model is called from the browser and no key exists in this bundle - see
 * `aiService` for the boundary.
 */
export function AICareerCenter({ initialIntent, embedded = false }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const pushToast = useUiStore((s) => s.pushToast);
  const closeAllModals = useUiStore((s) => s.closeAllModals);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [activity, setActivity] = useState(null);
  const [interview, setInterview] = useState(null);
  const threadRef = useRef(null);
  const handledInitialIntent = useRef(false);

  const briefingQuery = useAsync(() => aiService.getBriefing(), []);

  useEffect(() => {
    // Keep the newest reply in view without yanking the page around.
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking, activity, interview]);

  const ask = useCallback(
    async ({ content, intent }) => {
      if (thinking) return;
      const trimmed = (content ?? '').trim();
      if (!trimmed && !intent) return;

      recordCareerEvent(CAREER_EVENTS.AI_CONSULTED, { silent: true });

      if (trimmed) {
        setMessages((prev) => [
          ...prev,
          { id: `local-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() },
        ]);
      }
      setInput('');
      setThinking(true);

      try {
        const reply = await aiService.sendMessage({ content: trimmed, intent });
        setMessages((prev) => [...prev, reply]);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `I could not reach the career service just then. ${error.message ?? ''}`.trim(),
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [thinking],
  );

  const runAssessment = useCallback(async () => {
    setActivity({ type: 'assessment', status: 'running' });
    try {
      const result = await aiService.runCareerAssessment();
      setActivity({ type: 'assessment', status: 'done', result });
      recordCareerEvent(CAREER_EVENTS.ASSESSMENT_COMPLETED, { once: true });
    } catch (error) {
      setActivity(null);
      pushToast({ title: 'Assessment unavailable', body: error.message, tone: 'danger' });
    }
  }, [pushToast]);

  const startInterview = useCallback(async () => {
    setThinking(true);
    try {
      const started = await interviewService.startInterviewSimulation();
      setInterview({
        attempt: started.attempt,
        question: started.question,
        questionNumber: started.questionNumber,
        total: started.total,
        rule: started.rule,
        lastAnswer: null,
        finished: false,
        passed: null,
        score: null,
        grading: false,
      });
    } catch (error) {
      pushToast({ title: 'Could not start the interview', body: error.message, tone: 'danger' });
    } finally {
      setThinking(false);
    }
  }, [pushToast]);

  const answerInterview = useCallback(
    async (optionIndex) => {
      setInterview((prev) => (prev ? { ...prev, grading: true } : prev));
      try {
        const result = await interviewService.answerQuestion(
          interview.attempt.id,
          interview.question.id,
          optionIndex,
        );

        setInterview((prev) => ({
          ...prev,
          question: result.nextQuestion ?? null,
          questionNumber: result.questionNumber,
          lastAnswer: {
            correct: result.correct,
            correctOptionIndex: result.correctOptionIndex,
            rationale: result.rationale,
          },
          finished: result.finished,
          passed: result.passed,
          score: result.score,
          grading: false,
        }));

        if (result.finished && result.passed) {
          // A pass is career work: the event, the XP and the badge. A failure
          // earns nothing but the feedback - attempts are not held against you.
          recordCareerEvent(CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED, {
            label: `Interview simulation passed - ${result.score}%`,
            // `simulationId` is what the 100 XP is keyed on: one award per
            // attempt, so re-reading a passed attempt cannot pay again.
            context: {
              simulationId: interview.attempt.id,
              score: result.score,
              pathId: interview.attempt.pathId,
            },
          });
          applicationService
            .recordInterviewSimulation({
              jobTitle: interview.attempt.jobTitle,
              companyName: 'Grooveli AI',
              score: result.score,
            })
            .catch(() => {});
        } else if (result.finished) {
          pushToast({
            title: 'Not passed this time',
            body: 'Two wrong ended it - review the rationales and sit it again. The attempt is not held against you.',
            tone: 'warning',
            duration: 5600,
          });
        }
      } catch (error) {
        setInterview((prev) => (prev ? { ...prev, grading: false } : prev));
        pushToast({ title: 'Could not grade that answer', body: error.message, tone: 'danger' });
      }
    },
    [interview, pushToast],
  );

  const handleAction = (action) => {
    if (action.intent === AI_INTENTS.ASSESSMENT) runAssessment();
    else if (action.intent === AI_INTENTS.INTERVIEW_SIM) startInterview();
    else if (action.intent === AI_INTENTS.FIND_JOBS) {
      closeAllModals();
      navigate('/jobs');
    } else if (action.intent === AI_INTENTS.IMPROVE_CV) {
      closeAllModals();
      navigate('/profile');
    } else ask({ content: action.label, intent: action.intent });
  };

  useEffect(() => {
    if (handledInitialIntent.current) return;
    handledInitialIntent.current = true;
    if (initialIntent === AI_INTENTS.ASSESSMENT) runAssessment();
    else if (initialIntent === AI_INTENTS.INTERVIEW_SIM) startInterview();
  }, [initialIntent]);

  return (
    <div className="ai" style={embedded ? { height: '100%' } : undefined}>

      <AsyncBoundary
        query={briefingQuery}
        loading={<InlineLoading label="Reading your career state" />}
      >
        {(briefing) => (
          <div className="ai__briefing">
            <div className="ai__brand">
              <span className="ai__brand-mark">
                <IconSparkle size={20} />
              </span>
              <div>
                <p className="ai__brand-name g-gradient-text">Grooveli AI</p>
                <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                  Your career agent
                </p>
              </div>
            </div>
            <h2 className="ai__greeting">{briefing.greeting}</h2>
            <div className="ai__highlights">
              {briefing.highlights.map((highlight) => (
                <button
                  key={highlight.id}
                  type="button"
                  className="ai__highlight"
                  onClick={() => {
                    if (!highlight.route) return;
                    closeAllModals();
                    navigate(highlight.route);
                  }}
                >
                  <span className="ai__highlight-value">{highlight.value}</span>
                  <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>{highlight.label}</span>
                </button>
              ))}
            </div>
            <p className="ai__question">“{briefing.question}”</p>
            <div className="ai__actions">
              {briefing.actions.map((action) => (
                <Button key={action.id} size="sm" variant="ghost" onClick={() => handleAction(action)}>
                  {action.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={runAssessment}>
                Career assessment
              </Button>
            </div>
          </div>
        )}
      </AsyncBoundary>

      <div ref={threadRef} className="ai__thread">
        {messages.map((message) => (
          <AIMessageBubble
            key={message.id}
            message={message}
            userInitials={initials(user?.displayName ?? 'You')}
            onAction={handleAction}
          />
        ))}

        {thinking && !interview ? (
          <div className="ai-msg ai-msg--assistant">
            <span className="ai-msg__avatar"><IconSparkle size={15} /></span>
            <div className="ai-msg__bubble">
              <div className="ai__typing" aria-label="Grooveli AI is thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        ) : null}

        {interview ? (
          <InterviewPanel
            interview={interview}
            onAnswer={answerInterview}
            onRetry={startInterview}
            onDismiss={() => setInterview(null)}
          />
        ) : activity ? (
          <ActivityResult activity={activity} onDismiss={() => setActivity(null)} />
        ) : null}
      </div>


      <form
        className="ai__composer"
        onSubmit={(event) => {
          event.preventDefault();
          ask({ content: input });
        }}
      >
        <TextArea
          rows={2}
          value={input}
          placeholder="Ask about matches, gaps, interview prep or your next move..."
          aria-label="Message Grooveli AI"
          onChange={(event) => setInput(event.target.value)}
        />
        <Button type="submit" variant="primary" disabled={!input.trim() || thinking} icon={<IconSend size={16} />}>
          Send
        </Button>
      </form>

      <p className="ai__note">
        Responses in this prototype are generated locally from your profile data. No AI provider is called
        from the browser.
      </p>
    </div>
  );
}

function AIMessageBubble({ message, userInitials, onAction }) {
  const isUser = message.role === 'user';
  return (
    <div className={`ai-msg ai-msg--${isUser ? 'user' : 'assistant'}`}>
      <span className="ai-msg__avatar">{isUser ? userInitials : <IconSparkle size={15} />}</span>
      <div>
        <div className="ai-msg__bubble">{message.content}</div>
        {message.actions?.length ? (
          <div className="ai-msg__actions">
            {message.actions.map((action) => (
              <Button key={action.id} size="sm" variant="ghost" onClick={() => onAction(action)}>
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The interview, question by question.
 *
 * One question on screen, the rule always visible, and the rationale after
 * every answer - the point of practice is the explanation, not the score.
 */
function InterviewPanel({ interview, onAnswer, onRetry, onDismiss }) {
  const { attempt, question, questionNumber, total, rule, lastAnswer, finished, passed, score, grading } = interview;

  if (finished) {
    return (
      <Panel pad="sm" className="ai-result">
        <div className="g-row-between">
          <span className="g-eyebrow">Interview complete</span>
          <Badge tone={passed ? 'success' : 'danger'}>{passed ? 'Passed' : 'Not passed'}</Badge>
        </div>
        <p className="ai-result__score">{score}%</p>
        <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.7 }}>
          {passed
            ? `${attempt.pathTitle} interview cleared. Interview Ready is on your profile - employers can see you passed, not just practised.`
            : 'Two wrong answers ended the paper. Read the rationales above, close the gap, and sit it again whenever you are ready.'}
        </p>
        <div className="g-row" style={{ gap: 8 }}>
          {!passed ? (
            <Button size="sm" variant="primary" onClick={onRetry}>
              Sit it again
            </Button>
          ) : null}
          <Button size="sm" variant="subtle" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </Panel>
    );
  }

  if (!question) return <InlineLoading label="Preparing the next question" />;

  return (
    <Panel pad="sm" className="ai-result">
      <div className="g-row-between">
        <span className="g-eyebrow">{attempt.pathTitle} interview</span>
        <Badge tone="accent">
          Q{questionNumber}/{total} - first to 2
        </Badge>
      </div>
      <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>{rule}</p>

      <p style={{ fontWeight: 600, lineHeight: 1.6, margin: '10px 0' }}>{question.question}</p>

      <div className="g-stack" style={{ gap: 6 }}>
        {question.options.map((option, index) => (
          <Button
            key={option}
            size="sm"
            variant="ghost"
            disabled={Boolean(lastAnswer) || grading}
            onClick={() => onAnswer(index)}
          >
            {option}
          </Button>
        ))}
      </div>

      {lastAnswer ? (
        <div className="interview-feedback" style={{ marginTop: 10 }}>
          <div className="g-row" style={{ gap: 8 }}>
            {lastAnswer.correct ? (
              <IconCheck size={16} style={{ color: 'var(--g-success)', flex: 'none' }} />
            ) : (
              <IconAlert size={16} style={{ color: 'var(--g-danger)', flex: 'none' }} />
            )}
            <span style={{ fontWeight: 600, fontSize: 'var(--g-text-sm)' }}>
              {lastAnswer.correct ? 'Correct' : 'Not this time'}
            </span>
          </div>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.6, marginTop: 4 }}>
            {lastAnswer.rationale}
          </p>
        </div>
      ) : null}

      {grading ? <InlineLoading label="Grading" /> : null}
    </Panel>
  );
}

function ActivityResult({ activity, onDismiss }) {
  if (activity.status === 'running') {
    return (
      <Panel pad="sm">
        <InlineLoading label="Running your career assessment" />
      </Panel>
    );
  }

  const { result } = activity;

  return (
    <Panel pad="sm" className="ai-result">
      <div className="g-row-between">
        <span className="g-eyebrow">Career assessment</span>
        <Badge tone="accent">{result.readinessScore}/100 ready</Badge>
      </div>
      <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.7 }}>
        {result.summary}
      </p>
      <div className="ai-result__list">
        <div className="ai-result__row">
          <span className="ai-result__area">Strengths</span>
          <span style={{ fontSize: 'var(--g-text-sm)' }}>{result.strengths.join(' · ')}</span>
        </div>
        <div className="ai-result__row">
          <span className="ai-result__area">Development</span>
          <span style={{ fontSize: 'var(--g-text-sm)' }}>{result.development.join(' · ')}</span>
        </div>
        <div className="ai-result__row">
          <span className="ai-result__area">Roles that fit</span>
          <span style={{ fontSize: 'var(--g-text-sm)' }}>{result.recommendedRoles.join(' · ')}</span>
        </div>
      </div>
      <Button size="sm" variant="subtle" onClick={onDismiss}>
        Dismiss
      </Button>
    </Panel>
  );
}