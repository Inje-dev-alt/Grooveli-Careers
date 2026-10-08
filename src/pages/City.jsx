import { Suspense } from 'react';
import '../components/game/game.css';
import { GameCanvas } from '../components/game/GameCanvas.jsx';
import { Hud } from '../components/hud/Hud.jsx';
import { VirtualJoystick } from '../components/hud/VirtualJoystick.jsx';
import { WorldLoader } from '../components/game/WorldLoader.jsx';
import { useWorldInteractions, useWorldViewport } from '../hooks/useWorldInteractions.js';
import { useUiStore } from '../stores/uiStore.js';
import { useIsCompact } from '../hooks/useMediaQuery.js';

/**
 * Grooveli City.
 *
 * The world fills the viewport; the HUD and controls float over it. Everything
 * else in the product is reachable from here through the interaction system.
 */
export default function City() {
  const worldReady = useUiStore((s) => s.worldReady);
  const isCompact = useIsCompact();

  useWorldInteractions();
  useWorldViewport();

  return (
    <div className="app app--world">
      <div className="world">
        <Suspense fallback={<WorldLoader label="Loading Grooveli City" />}>
          <GameCanvas scene="city" />
        </Suspense>

        {!worldReady ? <WorldLoader label="Loading Grooveli City" /> : null}

        <Hud scene="city" />
        {isCompact ? <VirtualJoystick /> : null}

        {!isCompact ? (
          <div className="world__controls-hint">
            <span>
              <span className="world__key">W A S D</span> move
            </span>
            <span>
              <span className="world__key">E</span> interact
            </span>
            <span>
              <span className="world__key">ESC</span> close
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
