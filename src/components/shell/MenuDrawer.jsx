import { NavLink } from 'react-router-dom';
import './shell.css';
import { Button, IconLogout, IconClose } from '../ui/index.js';
import { NAV_ITEMS } from './navigation.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useCareerStore } from '../../stores/careerStore.js';
import { useMissionStore } from '../../stores/missionStore.js';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';
import { apiConfig } from '../../services/apiClient.js';

/** Slide-over menu. Reachable from the HUD in the world and the top bar elsewhere. */
export function MenuDrawer() {
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const signOut = useAuthStore((s) => s.signOut);
  const resetProgress = useCareerStore((s) => s.resetProgress);
  const resetMissions = useMissionStore((s) => s.resetProgress);

  useEscapeKey(() => setMenuOpen(false), menuOpen);

  if (!menuOpen) return null;

  const close = () => setMenuOpen(false);

  const resetEverything = () => {
    resetProgress();
    resetMissions();
    close();
  };

  return (
    <div className="menu">
      <button type="button" className="menu__backdrop" aria-label="Close menu" onClick={close} />
      <div className="menu__panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="g-row-between">
          <div>
            <p className="g-eyebrow">Grooveli</p>
            <h2 style={{ fontSize: 'var(--g-text-lg)' }}>Menu</h2>
          </div>
          <Button variant="subtle" onClick={close} aria-label="Close menu">
            <IconClose size={16} />
          </Button>
        </div>

        <nav className="menu__links">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={close}
                className={({ isActive }) => `menu__link${isActive ? ' menu__link--active' : ''}`}
              >
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="menu__footer">
          <p className="menu__note">
            {apiConfig.useMocks
              ? 'Running on mocked data. Career progress is stored in this browser only — the backend will own it once connected.'
              : `Connected to ${apiConfig.baseUrl}.`}
          </p>
          <Button variant="ghost" onClick={resetEverything}>
            Reset career progress
          </Button>
          <Button variant="subtle" icon={<IconLogout size={16} />} onClick={() => signOut().finally(close)}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
