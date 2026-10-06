import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './hud.css';
import { Button, Badge, EmptyState, LoadingState, ErrorState, IconBell } from '../ui/index.js';
import { useNotificationStore } from '../../stores/notificationStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { formatRelativeTime } from '../../utils/format.js';

const TYPE_TONE = {
  match: 'accent',
  application: 'info',
  interview: 'warning',
  mission: 'success',
  system: 'default',
};

/** The notification feed — HUD bell, apartment phone, and the menu all use this. */
export function NotificationList() {
  const navigate = useNavigate();
  const items = useNotificationStore((s) => s.items);
  const status = useNotificationStore((s) => s.status);
  const error = useNotificationStore((s) => s.error);
  const load = useNotificationStore((s) => s.load);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const closeAllModals = useUiStore((s) => s.closeAllModals);

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  if (status === 'loading' && items.length === 0) return <LoadingState rows={3} label="Loading notifications" />;
  if (status === 'error') return <ErrorState error={{ message: error }} onRetry={load} title="Could not load notifications" />;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing new"
        body="Job matches, application updates and interview reminders land here."
        icon={<IconBell size={22} />}
      />
    );
  }

  const open = (notification) => {
    markRead(notification.id);
    if (!notification.route) return;
    closeAllModals();
    navigate(notification.route);
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
      {unread > 0 ? (
        <div className="g-row-between">
          <span className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
            {unread} unread
          </span>
          <Button size="sm" variant="subtle" onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
      ) : null}

      <ul className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
        {items.map((notification) => (
          <li key={notification.id}>
            <button
              type="button"
              className={`notification${notification.read ? '' : ' notification--unread'}`}
              onClick={() => open(notification)}
            >
              <span className="notification__body">
                <span className="notification__head">
                  <span className="notification__title">{notification.title}</span>
                  <Badge tone={TYPE_TONE[notification.type]}>{notification.type}</Badge>
                </span>
                <span className="notification__text">{notification.body}</span>
                <span className="notification__time">{formatRelativeTime(notification.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
