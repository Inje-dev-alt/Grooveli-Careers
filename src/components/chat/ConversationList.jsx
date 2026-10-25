import { useEffect } from 'react';
import './chat.css';
import { Badge, EmptyState, LoadingState, ErrorState, IconInbox } from '../ui/index.js';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { formatRelativeTime, initials } from '../../utils/format.js';

/**
 * The inbox — every conversation this account is in, newest activity first.
 *
 * One panel holds both the list and the open thread: the list is what you see
 * until you pick someone, and picking someone replaces it. A second modal
 * layer for the thread would stack two translucent backdrops, which the modal
 * system deliberately does not do.
 */
export function ConversationList({ onOpen }) {
  const me = useAuthStore((s) => s.user?.id);
  const conversations = useChatStore((s) => s.conversations);
  const status = useChatStore((s) => s.status);
  const error = useChatStore((s) => s.error);
  const load = useChatStore((s) => s.loadConversations);

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  if (status === 'loading' || status === 'idle') {
    return <LoadingState rows={3} label="Loading your conversations" />;
  }
  if (status === 'error') return <ErrorState title="Could not load conversations" body={error} />;

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        body="Walk into a company's office and open the meeting table. Talking to someone standing in the same lobby beats a cold message, which is rather the point."
        icon={<IconInbox size={22} />}
      />
    );
  }

  return (
    <ul className="inbox">
      {conversations.map((thread) => (
        <li key={thread.id}>
          <button type="button" className="inbox__thread" onClick={() => onOpen(thread.id)}>
            <span className="chat__avatar" style={{ background: thread.partner.color }}>
              {initials(thread.partner.name)}
            </span>
            <span className="inbox__body">
              <span className="inbox__name g-truncate" style={{ display: 'block' }}>
                {thread.partner.name}
              </span>
              <span className="inbox__preview g-truncate" style={{ display: 'block' }}>
                {thread.lastMessage
                  ? `${thread.lastMessage.senderId === me ? 'You: ' : ''}${thread.lastMessage.body}`
                  : 'No messages yet'}
              </span>
            </span>
            {thread.unread > 0 ? <Badge tone="accent">{thread.unread}</Badge> : null}
            <span className="chat__time">
              {formatRelativeTime(thread.lastMessage?.createdAt ?? thread.createdAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
