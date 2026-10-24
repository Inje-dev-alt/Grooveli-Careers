import { useEffect } from 'react';
import './hud.css';
import { ProgressBar, IconBell, IconMenu, IconMapPin, IconTrendUp } from '../ui/index.js';
import { InteractionPrompt } from './InteractionPrompt.jsx';
import { useAuthStore } from '../../stores/authStore.js';
import { useCareerStore, selectProgression } from '../../stores/careerStore.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useNotificationStore } from '../../stores/notificationStore.js';
import { getLocation } from '../../game/world/locations.js';
import { resolvePlace, placeFallback } from '../../game/world/places.js';
import { useCareerPath } from '../../hooks/useCareerPath.js';
import { initials } from '../../utils/format.js';

/**
 * The in-world HUD.
 *
 * Deliberately light: a player card, the location they are in, the controls
 * they need, and the interaction prompt. Everything else lives behind the menu
 * so the city stays visible.
 */
export function Hud({ scene = 'city', action = null, locationLabel = null }) {
  const user = useAuthStore((s) => s.user);
  const progression = useCareerStore(selectProgression);
  const reputation = useCareerStore((s) => s.reputation);
  const currentLocationId = usePlayerStore((s) => s.currentLocationId);
  const openModal = useUiStore((s) => s.openModal);
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const unreadCount = useNotificationStore((s) => s.items.filter((n) => !n.read).length);
  const loadNotifications = useNotificationStore((s) => s.load);
  const notificationStatus = useNotificationStore((s) => s.status);
  const homePath = useCareerPath();

  useEffect(() => {
    if (notificationStatus === 'idle') loadNotifications();
  }, [notificationStatus, loadNotifications]);

  // Whichever room this is — the city, the apartment or a company HQ — the
  // lookup is chosen by scene rather than branched on here. See world/places.js.
  const fallback = placeFallback(scene);
  const nearby = resolvePlace(scene, currentLocationId);
  const location = nearby ?? fallback;

  // Standing next to something names itself. Otherwise `locationLabel` lets a
  // scene say what the world data cannot know — the signed-in employer's own
  // company — and failing that the room's own name.
  const locationName = nearby?.name ?? locationLabel ?? fallback.name;
  const homeDistrictName = homePath ? getLocation(homePath.districtId)?.name ?? null : null;
  const locationAccent = location?.accent ?? 'var(--g-accent)';

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud-player">
          <span className="hud-player__avatar">{initials(user?.displayName ?? 'Candidate')}</span>
          <div className="hud-player__info">
            <span className="hud-player__name g-truncate">{user?.displayName ?? 'Candidate'}</span>
            <div className="hud-player__meta">
              <span>Lv {progression.level}</span>
              <div className="hud-player__xp">
                <ProgressBar
                  value={progression.xpIntoLevel}
                  max={progression.xpForNextLevel}
                  size="sm"
                  label="Experience progress"
                />
              </div>
              <span className="hud-player__rep">
                <IconTrendUp size={12} />
                {reputation}
              </span>
            </div>
          </div>
        </div>

        <div className="hud__controls">
          <button
            type="button"
            className="hud-btn"
            onClick={() => openModal('notifications')}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          >
            <IconBell size={18} />
            {unreadCount > 0 ? <span className="hud-btn__count">{unreadCount}</span> : null}
          </button>
          <button type="button" className="hud-btn" onClick={toggleMenu} aria-label="Open menu">
            <IconMenu size={18} />
          </button>
        </div>
      </div>

      <div />

      <div className="hud__bottom">
        <span className="hud-location">
          <span className="hud-location__dot" style={{ background: locationAccent }} />
          <IconMapPin size={13} />
          {locationName}
        </span>
        {homePath ? (
          <span className="hud-path" title={homeDistrictName ? `Home district: ${homeDistrictName}` : undefined}>
            {homePath.title}
            {scene === 'city' && currentLocationId === homePath.districtId ? (
              <span className="hud-path__home">Home district</span>
            ) : null}
          </span>
        ) : null}
        {action}
      </div>

      <InteractionPrompt scene={scene} />
    </div>
  );
}
