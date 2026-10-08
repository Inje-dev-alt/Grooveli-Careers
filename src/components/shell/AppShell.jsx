import { NavLink, useNavigate } from 'react-router-dom';
import './shell.css';
import { ProgressBar, Button, IconBell, IconMenu } from '../ui/index.js';
import { PRIMARY_NAV, COMPACT_NAV } from './navigation.js';
import { useCareerStore, selectProgression } from '../../stores/careerStore.js';
import { useAuthStore, selectCanSwitchRole } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useNotificationStore } from '../../stores/notificationStore.js';

/**
 * Chrome for the non-world routes.
 *
 * The marketplace, missions, profile and AI centre must work without the game,
 * so they get an ordinary application shell: top bar on desktop, tab bar on
 * small screens.
 */
export function AppShell({ children }) {
  const navigate = useNavigate();
  const progression = useCareerStore(selectProgression);
  const openModal = useUiStore((s) => s.openModal);
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const unreadCount = useNotificationStore((s) => s.items.filter((n) => !n.read).length);
  const switchRole = useAuthStore((s) => s.switchRole);
  const canSwitchRole = useAuthStore(selectCanSwitchRole);

  const goToEmployer = async () => {
    await switchRole('employer');
    navigate('/employer');
  };

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="topbar__brand"
          onClick={() => navigate('/city')}
          aria-label="Grooveli Careers home"
          style={{ background: 'transparent', border: 0, padding: 0 }}
        >
          <span className="topbar__mark">G</span>
          <span style={{ textAlign: 'left' }}>
            <span className="topbar__name" style={{ display: 'block' }}>
              Grooveli
            </span>
            <span className="topbar__sub">Careers</span>
          </span>
        </button>

        <nav className="topbar__nav" aria-label="Primary">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `navlink${isActive ? ' navlink--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar__right">
          <div className="topbar__level" title={`Career level ${progression.level}`}>
            <span className="topbar__level-badge">{progression.level}</span>
            <span className="topbar__level-bar">
              <ProgressBar
                value={progression.xpIntoLevel}
                max={progression.xpForNextLevel}
                size="sm"
                label="Experience progress"
              />
            </span>
          </div>

          <button
            type="button"
            className="hud-btn"
            onClick={() => openModal('notifications')}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          >
            <IconBell size={18} />
            {unreadCount > 0 ? <span className="hud-btn__count">{unreadCount}</span> : null}
          </button>

          {canSwitchRole ? (
            <Button variant="ghost" size="sm" onClick={goToEmployer}>
              Employer space
            </Button>
          ) : null}

          <button type="button" className="hud-btn" onClick={toggleMenu} aria-label="Open menu">
            <IconMenu size={18} />
          </button>
        </div>
      </header>

      {children}

      <nav className="tabbar" aria-label="Primary">
        {COMPACT_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
            >
              <Icon size={19} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

/** Standard page frame: title, lede, content. */
export function Page({ title, lede, action, children }) {
  return (
    <main className="page">
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
