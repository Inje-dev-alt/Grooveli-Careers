import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './chat.css';
import {
  Button,
  TextArea,
  Badge,
  LoadingState,
  ErrorState,
  IconSend,
  IconAlert,
  IconChevronLeft,
} from '../ui/index.js';
import { useChatStore } from '../../stores/chatStore.js';
import { useSocialStore } from '../../stores/socialStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { MESSAGE_MAX, POLL_SECONDS } from '../../services/chatService.js';
import { getLocation } from '../../game/world/locations.js';
import { formatRelativeTime, initials } from '../../utils/format.js';

/**
 * One conversation.
 *
 * The thread polls while this is mounted and stops the moment it is not, which
 * is the whole reason a closed panel costs nothing. The store owns the timer;
 * this component only tells it when to start and stop.
 *
 * Both moderation verbs are here, as they are on every post: block, which is
 * immediate and this account's own, and report, which writes a row for a human
 * rather than removing anything. A conversation is the surface where a network
 * most needs them, so they are not behind a menu.
 */
export function ChatPanel({ onBack = null }) {
  const [draft, setDraft] = useState('');
  const [reported, setReported] = useState(false);
  const me = useAuthStore((s) => s.user?.id);

  const openId = useChatStore((s) => s.openId);
  const conversations = useChatStore((s) => s.conversations);
  const messages = useChatStore((s) => s.messages);
  const messagesStatus = useChatStore((s) => s.messagesStatus);
  const sendError = useChatStore((s) => s.sendError);
  const sending = useChatStore((s) => s.sending);
  const send = useChatStore((s) => s.send);
  const report = useChatStore((s) => s.report);
  const poll = useChatStore((s) => s.poll);
  const close = useChatStore((s) => s.close);
  const blockAuthor = useSocialStore((s) => s.blockAuthor);

  const thread = conversations.find((t) => t.id === openId) ?? null;
  const scrollRef = useRef(null);

  /*
   * The thread polls while it is on screen and not a moment longer.
   *
   * Owning the interval here rather than in the store is what makes this safe
   * under StrictMode, which runs an effect's cleanup once during mount:
   * clearing and restarting a timer is idempotent. The previous version
   * cleared `openId` from this cleanup instead, which closed the panel the
   * instant it opened.
   */
  useEffect(() => {
    if (!openId) return undefined;
    const timer = setInterval(poll, POLL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [openId, poll]);

  // Pinned to the newest message. `useLayoutEffect` so it happens before the
  // browser paints — scrolling after a paint is a visible jump.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Cleared only on success, so a message the server refused is still in the
    // box to edit rather than lost.
    if (await send(text)) setDraft('');
  };

  if (messagesStatus === 'error') {
    return <ErrorState title="Could not open that conversation" />;
  }

  return (
    <div className="chat">
      {thread ? (
        <header className="chat__head">
          {onBack ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconChevronLeft size={14} />}
              onClick={onBack}
              aria-label="Back to conversations"
            />
          ) : null}
          <span className="chat__avatar" style={{ background: thread.partner.color }}>
            {initials(thread.partner.name)}
          </span>
          <div className="chat__who">
            <div className="chat__name g-truncate">{thread.partner.name}</div>
            <div className="chat__headline g-truncate">{thread.partner.headline}</div>
          </div>
          <Badge>Lv {thread.partner.careerLevel}</Badge>
        </header>
      ) : null}

      {/*
        Where the two of you met, kept at the top of the thread rather than
        shown once and forgotten. A week later neither person remembers why
        they spoke, and "you met in Keystone's lobby" is the context that
        makes the conversation worth continuing.
      */}
      {thread?.metLocationId ? (
        <p className="chat__met">{metLine(thread)}</p>
      ) : null}

      <div className="chat__scroll" ref={scrollRef}>
        {messagesStatus === 'loading' ? (
          <LoadingState rows={3} label="Opening the conversation" />
        ) : messages.length === 0 ? (
          <p className="chat__empty">
            Nothing said yet. One message is all you get until they reply, so make it
            about them rather than about you.
          </p>
        ) : (
          <ul className="chat__messages">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`chat__message${message.senderId === me ? ' chat__message--mine' : ''}`}
              >
                <p className="chat__body">{message.body}</p>
                <span className="chat__time">{formatRelativeTime(message.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sendError ? (
        <p className="chat__refusal" role="status">
          <IconAlert size={14} />
          {sendError}
        </p>
      ) : null}

      <form className="chat__composer" onSubmit={submit}>
        <TextArea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
          placeholder="Write a message"
          rows={2}
          aria-label="Message"
        />
        <Button type="submit" icon={<IconSend size={15} />} loading={sending} disabled={!draft.trim()}>
          Send
        </Button>
      </form>

      {thread ? (
        <footer className="chat__moderation">
          <button
            type="button"
            className="chat__verb"
            onClick={async () => {
              if (await report('harassment')) setReported(true);
            }}
            disabled={reported}
          >
            {reported ? 'Reported for review' : 'Report'}
          </button>
          <button
            type="button"
            className="chat__verb"
            onClick={() => {
              blockAuthor(thread.partner.id);
              close();
              onBack?.();
            }}
          >
            Block
          </button>
        </footer>
      ) : null}
    </div>
  );
}

/** "You met in Grooveli City — Corporate District", when we know where. */
function metLine(thread) {
  if (thread.metScene === 'city') {
    const district = getLocation(thread.metLocationId);
    return district ? `You met in ${district.name}.` : 'You met in Grooveli City.';
  }
  // An office's locationId is an organization id, which this component has no
  // lookup for — the thread's own partner is not the company. Naming the room
  // without naming the company is still the useful half.
  if (thread.metScene === 'office') return "You met in a company's office.";
  if (thread.metScene === 'company') return 'You met at a company headquarters.';
  return null;
}
