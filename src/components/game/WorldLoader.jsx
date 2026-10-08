import './game.css';

/** Shown while Phaser is fetched and the scene builds itself. */
export function WorldLoader({ label = 'Loading Grooveli City' }) {
  return (
    <div className="world__loader" role="status" aria-live="polite">
      <div className="world__loader-inner">
        <span className="world__loader-mark">G</span>
        <div>
          <p className="world__loader-title">{label}</p>
          <p className="world__loader-hint">
            A career platform experienced like a game. Walk up to any district and press E.
          </p>
        </div>
      </div>
    </div>
  );
}
