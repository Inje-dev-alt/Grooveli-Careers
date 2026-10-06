import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './locations.css';
import { Modal, Button, Badge } from '../ui/index.js';
import { resolveInteractions } from './interactionRegistry.jsx';
import { useUiStore } from '../../stores/uiStore.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';

/**
 * The panel that opens when the player presses E.
 *
 * One component serves every building and every apartment object: the actions
 * come from the location's own `interactions` list, resolved through the
 * registry. No building has its own panel implementation.
 *
 * @param {{ location: import('../../game/world/locations.js').CityLocation }} props
 */
export function LocationPanel({ location }) {
  const navigate = useNavigate();
  const openModal = useUiStore((s) => s.openModal);
  const replaceModal = useUiStore((s) => s.replaceModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const closeAllModals = useUiStore((s) => s.closeAllModals);
  const visited = usePlayerStore((s) => s.visitedLocationIds.includes(location.id));

  useEffect(() => {
    // Read the store at effect time rather than from the render closure: the
    // effect runs twice under StrictMode, and a stale "not yet visited" would
    // count the same district twice.
    const player = usePlayerStore.getState();
    const alreadyVisited = player.hasVisited(location.id);
    player.enterLocation(location.id);

    // Entering a district for the first time is a discovery event and advances
    // the "Know the City" mission. Re-entering is not progress, and furniture in
    // the apartment is not a district.
    if (!alreadyVisited && location.type !== 'apartment-object') {
      recordCareerEvent(CAREER_EVENTS.LOCATION_VISITED, {
        label: `Visited ${location.name}`,
        silent: true,
      });
    }

    return () => usePlayerStore.getState().exitLocation();
  }, [location.id, location.name, location.type]);

  const actions = resolveInteractions(location.interactions);
  const context = { location, openModal, replaceModal, closeAllModals, navigate };

  return (
    <Modal
      eyebrow={(location.type ?? 'location').replace(/-/g, ' ')}
      title={location.name}
      headerAccent={location.accent}
      onClose={closeModal}
      size="md"
      footer={
        <Button variant="ghost" onClick={closeModal}>
          Exit
        </Button>
      }
    >
      <div className="location-panel" style={{ '--location-accent': location.accent }}>
        <div className="location-panel__intro">
          <p className="location-panel__tagline">{location.tagline}</p>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.7 }}>
            {location.description}
          </p>
          {visited ? (
            <div style={{ marginTop: 4 }}>
              <Badge tone="success" dot>
                Visited
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="location-panel__actions">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                className="location-action"
                onClick={() => action.open(context)}
              >
                <span className="location-action__icon">
                  <Icon size={18} />
                </span>
                <span className="location-action__body">
                  <span className="location-action__label">{action.label}</span>
                  <span className="location-action__desc">{action.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
