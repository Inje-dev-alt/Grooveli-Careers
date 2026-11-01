import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './employer.css';
import { Button, CompanyMark, IconBell, IconInbox, IconMenu, IconUser } from '../ui/index.js';
import { useEmployerStore } from '../../stores/employerStore.js';
import { useAuthStore, selectCanSwitchRole } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useNotificationStore } from '../../stores/notificationStore.js';
import { useChatStore, selectUnreadMessages } from '../../stores/chatStore.js';
import { Ticker } from '../shell/Ticker.jsx';

const EMPLOYER_NAV = [
  { to: '/employer', label: 'Dashboard', end: true },
  { to: '/employer/jobs', label: 'Jobs' },
  { to: '/employer/candidates', label: 'Candidates' },
  { to: '/employer/company', label: 'Company' },
  // The HQ is a place, not a page of the dashboard - last in the list so it
  // reads as leaving the desk rather than another tab of it.
  { to: '/employer/hq', label: 'Headquarters' },
];

/**
 * Chrome for the employer space.
 *
 * Deliberately not the candidate shell: an employer is running a hiring
 * process, not developing a career, and showing them an XP bar would make
 * neither experience make sense. The account is the same; the product is not.
 */
export function EmployerShell({ children }) {
  const navigate = useNavigate();
  const organization = useEmployerStore((s) => s.organization);
  const membership = useEmployerStore((s) => s.membership);
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const openModal = useUiStore((s) => s.openModal);
  const unreadNotices = useNotificationStore((s) => s.items.filter((n) => !n.read).length);
  const loadNotifications = useNotificationStore((s) => s.load);
  const noticeStatus = useNotificationStore((s) => s.status);
  const unreadMessages = useChatStore(selectUnreadMessages);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const chatStatus = useChatStore((s) => s.status);
  const closeConversation = useChatStore((s) => s.close);
  const switchRole = useAuthStore((s) => s.switchRole);
  const canSwitchRole = useAuthStore(selectCanSwitchRole);

  // Lazily, like the candidate shell: both badges need a count before anyone
  // opens the panel behind them.
  useEffect(() => {
    if (noticeStatus === 'idle') loadNotifications();
    if (chatStatus === 'idle') loadConversations();
  }, [noticeStatus, loadNotifications, chatStatus, loadConversations]);

  const goToCandidate = async () => {
    await switchRole('candidate');
    navigate('/city');
  };

  return (
    <div className="employer">
      <header className="employer__bar">
        <div className="employer__identity">
          <CompanyMark name={organization?.name ?? 'Grooveli'} color={organization?.logoColor ?? '#6c8cff'} />
          <div className="employer__company">
            <p className="employer__company-name g-truncate">{organization?.name ?? 'Employer space'}</p>
            <p className="employer__company-meta g-truncate">
              {membership?.title ? `${membership.title} · ` : ''}Grooveli Employer
            </p>
          </div>
        </div>

        <nav className="employer__nav" aria-label="Employer sections">
          {EMPLOYER_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `navlink${isActive ? ' navlink--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="employer__actions">
          {/*
            An employer could be messaged, asked to connect and have their
            pipeline move without being able to see any of it: this shell
            carried neither an inbox nor a bell, while the candidate's carried
            both. Every panel behind these already worked for either role.
          */}
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              closeConversation();
              openModal('messages');
            }}
            aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`}
          >
            <IconInbox size={18} />
            {unreadMessages > 0 ? <span className="hud-btn__count">{unreadMessages}</span> : null}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => openModal('notifications')}
            aria-label={`Notifications${unreadNotices ? `, ${unreadNotices} unread` : ''}`}
          >
            <IconBell size={18} />
            {unreadNotices > 0 ? <span className="hud-btn__count">{unreadNotices}</span> : null}
          </button>
          {canSwitchRole ? (
            <Button variant="ghost" size="sm" icon={<IconUser size={15} />} onClick={goToCandidate}>
              Candidate space
            </Button>
          ) : null}
          <button type="button" className="hud-btn" onClick={toggleMenu} aria-label="Open menu">
            <IconMenu size={18} />
          </button>
        </div>
      </header>

      {children}

      <Ticker />
    </div>
  );
}

/** Standard employer page frame. */
export function EmployerPage({ title, lede, action, children }) {
  return (
    <main className="employer__page">
      <div className="page__head">
        <div>
          <h1 className="page__title">{title}</h1>
          {lede ? <p className="page__lede">{lede}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}
