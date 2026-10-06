import './locations.css';
import { IconChevronRight } from '../ui/index.js';
import { cityLocations } from '../../game/world/locations.js';
import { gameBridge, GAME_EVENTS } from '../../game/bridge.js';
import { usePlayerStore } from '../../stores/playerStore.js';

/**
 * The city directory: what each district represents in the employment market,
 * and a way to travel there without walking the whole map.
 */
export function CityGuide({ onClose }) {
  const visited = usePlayerStore((s) => s.visitedLocationIds);

  const travelTo = (location) => {
    gameBridge.emit(GAME_EVENTS.COMMAND_FOCUS_LOCATION, { locationId: location.id });
    onClose?.();
  };

  return (
    <div className="city-guide">
      <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
        Each district maps to a part of the employment market. Walk up to any of them and press E — or travel
        there directly.
      </p>

      {cityLocations.map((location) => (
        <button key={location.id} type="button" className="city-guide__item" onClick={() => travelTo(location)}>
          <span className="city-guide__swatch" style={{ background: location.accent }} />
          <span className="city-guide__body">
            <span className="city-guide__name">
              {location.name}
              {visited.includes(location.id) ? ' ·' : ''}
            </span>
            <span className="city-guide__tagline">{location.tagline}</span>
          </span>
          <IconChevronRight size={16} style={{ color: 'var(--g-text-dim)', flex: 'none' }} />
        </button>
      ))}
    </div>
  );
}
