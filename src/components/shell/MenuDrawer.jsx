import { NavLink, useNavigate } from 'react-router-dom';
import './shell.css';
import { Button, Badge, IconLogout, IconClose } from '../ui/index.js';
import { NAV_ITEMS } from './navigation.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useAuthStore, selectCanSwitchRole, selectOtherRole } from '../../stores/authStore.js';
import { useCareerStore } from '../../stores/careerStore.js';
import { useMissionStore } from '../../stores/missionStore.js';
import { useSocialStore } from '../../stores/socialStore.js';
import { useEmployerStore } from '../../stores/employerStore.js';
import { useJobStore } from '../../stores/jobStore.js';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';
import { apiConfig } from '../../services/apiClient.js';
import { resetMockDb } from '../../services/mockDb.js';

const EMPLOYER_LINKS = [
  { to: '/employer', label: 'Dashboard' },
  { to: '/employer/jobs', label: 'Jobs' },
  { to: '/employer/candidates', label: 'Candidates' },
  { to: '/employer/company', label: 'Company' },
];

/** Slide-over menu. Reachable from the HUD in the world and the bar elsewhere. */
export function MenuDrawer() {
  const navigate = useNavigate();
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);

  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const switchRole = useAuthStore((s) => s.switchRole);
  const canSwitchRole = useAuthStore(selectCanSwitchRole);
  const otherRole = useAuthStore(selectOtherRole);

  const resetCareer = useCareerStore((s) => s.reset);
  const resetMissions = useMissionStore((s) => s.reset);
  const resetSocial = useSocialStore((s) => s.reset);
  const resetEmployer = useEmployerStore((s) => s.reset);
  const resetJobs = useJobStore((s) => s.reset);

  useEscapeKey(() => setMenuOpen(false), menuOpen);

  if (!menuOpen) return null;

  const close = () => setMenuOpen(false);
  const isEmployer = user?.activeRole === 'employer';
  const links = isEmployer ? EMPLOYER_LINKS : NAV_ITEMS;

  /** Clear every per-account store, so no state survives a sign-out. */
  const clearStores = () => {
    resetCareer();
    resetMissions();
    resetSocial();
    resetEmployer();
    resetJobs();
  };

  const handleSignOut = async () => {
    await signOut();
    clearStores();
    close();
    navigate('/signin', { replace: true });
  };

  const handleSwitch = async () => {
    await switchRole(otherRole);
    clearStores();
    close();
    navigate(otherRole === 'employer' ? '/employer' : '/city');
  };

  const handleResetPrototype = () => {
    resetMockDb();
    clearStores();
    window.location.assign('/signin');
  };

  return (
    <div className="menu">
      <button type="button" className="menu__backdrop" aria-label="Close menu" onClick={close} />
      <div className="menu__panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="g-row-between">
          <div>
            <p className="g-eyebrow">Grooveli</p>
            <h2 style={{ fontSize: 'var(--g-text-lg)' }}>{user?.displayName || 'Menu'}</h2>
            <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>{user?.email}</p>
          </div>
          <Button variant="subtle" onClick={close} aria-label="Close menu">
            <IconClose size={16} />
          </Button>
        </div>

        <div className="g-row" style={{ flexWrap: 'wrap' }}>
          {(user?.roles ?? []).map((role) => (
            <Badge key={role} tone={role === user.activeRole ? 'accent' : 'default'} dot={role === user.activeRole}>
              {role === 'employer' ? 'Employer' : 'Candidate'}
            </Badge>
          ))}
        </div>

        <nav className="menu__links">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/employer'}
                onClick={close}
                className={({ isActive }) => `menu__link${isActive ? ' menu__link--active' : ''}`}
              >
                {Icon ? <Icon size={17} /> : null}
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="menu__footer">
          {canSwitchRole ? (
            <Button variant="ghost" onClick={handleSwitch}>
              Switch to {otherRole === 'employer' ? 'employer' : 'candidate'} space
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                close();
                navigate('/welcome');
              }}
            >
              Add {isEmployer ? 'a candidate profile' : 'an employer space'}
            </Button>
          )}

          <p className="menu__note">
            {apiConfig.useMocks
              ? 'Running on mocked data. Everything you create lives in this browser only — the backend will own it once connected.'
              : `Connected to ${apiConfig.baseUrl}.`}
          </p>

          <Button variant="subtle" onClick={handleResetPrototype}>
            Reset prototype data
          </Button>
          <Button variant="subtle" icon={<IconLogout size={16} />} onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
