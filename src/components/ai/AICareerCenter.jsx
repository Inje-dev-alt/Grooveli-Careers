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
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as aiService from '../../services/aiService.js';
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
 * No model is called from the browser and no key exists in this bundle — see
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
  const threadRef = useRef(null);
  const handledInitialIntent = useRef(false);

  const briefingQuery = useAsync(() => aiService.getBriefing(), []);

  useEffect(() => {
    // Keep the newest reply in view without yanking the page around.
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking, activity]);

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
      pushToast({ title: 'Assessment could not start', body: error.message, tone: 'danger' });
    }
  }, [pushToast]);

  const runInterview = useCallback(async () => {
    setActivity({ type: 'interview', status: 'running' });
    try {
      const result = await aiService.runInterviewSimulation({});
      setActivity({ type: 'interview', status: 'done', result });
      applicationService
        .recordInterviewSimulation({
          jobTitle: result.jobTitle,
          companyName: result.companyName,
          score: result.score,
        })
        .catch(() => {});
      recordCareerEvent(CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED);
    } catch (error) {
      setActivity(null);
      pushToast({ title: 'Simulation could not start', body: error.message, tone: 'danger' });
    }
  }, [pushToast]);

  /** Suggested actions are routed, not pasted into the prompt. */
  const handleAction = useCallback(
    (action) => {
      if (action.id === 'act-sim' || action.intent === 'interview-simulation') return runInterview();
      if (action.id === 'act-open-jobs') {
        closeAllModals();
        return navigate('/jobs');
      }
      if (action.id === 'act-missions') {
        closeAllModals();
        return navigate('/missions');
      }
      if (action.id === 'act-profile') {
        closeAllModals();
        return navigate('/profile');
      }
      return ask({ intent: action.intent, content: action.label });
    },
    [ask, closeAllModals, navigate, runInterview],
  );

  useEffect(() => {
    if (handledInitialIntent.current || !initialIntent) return;
    handledInitialIntent.current = true;
    if (initialIntent === AI_INTENTS.ASSESSMENT) runAssessment();
    else if (initialIntent === 'interview-simulation') runInterview();
    else ask({ intent: initialIntent, content: '' });
  }, [initialIntent, ask, runAssessment, runInterview]);

  const onSubmit = (event) => {
    event.preventDefault();
    ask({ content: input, intent: AI_INTENTS.GENERAL });
  };

  return (
    <div className="ai" style={embedded ? { height: '100%' } : undefined}>
      {messages.length === 0 && !activity ? (
        <AsyncBoundary
          query={briefingQuery}
          loading={<InlineLoading label="Reading your career profile" />}
          errorTitle="Grooveli AI is unavailable"
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

              {briefing.highlights.length > 0 ? (
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
                      <span style={{ flex: 1 }}>{highlight.label}</span>
                      <IconChevronRight size={15} style={{ color: 'var(--g-text-dim)' }} />
                    </button>
                  ))}
                </div>
              ) : null}

              <p className="ai__question">“{briefing.question}”</p>

              <div className="ai__actions">
                {briefing.actions.map((action) => (
                  <Button key={action.id} size="sm" variant="ghost" onClick={() => handleAction(action)}>
                    {action.label}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={runAssessment}>
                  Career Assessment
                </Button>
              </div>
            </div>
          )}
        </AsyncBoundary>
      ) : null}

      {(messages.length > 0 || thinking || activity) && (
        <div className="ai__thread" ref={threadRef}>
          {messages.map((message) => (
            <AIMessageBubble
              key={message.id}
              message={message}
              userInitials={initials(user?.displayName ?? 'You')}
              onAction={handleAction}
            />
          ))}

          {activity ? <ActivityResult activity={activity} onDismiss={() => setActivity(null)} /> : null}

          {thinking ? (
            <div className="ai-msg ai-msg--assistant">
              <span className="ai-msg__avatar">
                <IconSparkle size={15} />
              </span>
              <div className="ai-msg__bubble">
                <div className="ai__typing" aria-label="Grooveli AI is thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <form className="ai__composer" onSubmit={onSubmit}>
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about roles, gaps, your CV or an interview…"
          aria-label="Message Grooveli AI"
          rows={1}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit(event);
            }
          }}
        />
        <Button type="submit" variant="primary" disabled={thinking || !input.trim()} aria-label="Send">
          <IconSend size={16} />
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

function ActivityResult({ activity, onDismiss }) {
  if (activity.status === 'running') {
    return (
      <Panel pad="sm">
        <InlineLoading
          label={
            activity.type === 'assessment'
              ? 'Running your career assessment'
              : 'Running the interview simulation'
          }
        />
      </Panel>
    );
  }

  const { result } = activity;

  return (
    <Panel pad="sm" className="ai-result">
      <div className="g-row-between">
        <span className="g-eyebrow">
          {activity.type === 'assessment' ? 'Career assessment' : 'Interview simulation'}
        </span>
        <Badge tone="accent">
          {activity.type === 'assessment' ? `${result.readinessScore}/100 ready` : `${result.score}/100`}
        </Badge>
      </div>

      {activity.type === 'assessment' ? (
        <>
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
        </>
      ) : (
        <>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
            Simulated for {result.jobTitle}.
          </p>
          <div className="ai-result__list">
            {result.feedback.map((item) => (
              <div key={item.area} className="ai-result__row">
                <span className="ai-result__area">{item.area}</span>
                <span style={{ fontSize: 'var(--g-text-sm)' }}>{item.note}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Button size="sm" variant="subtle" onClick={onDismiss}>
        Dismiss
      </Button>
    </Panel>
  );
}
