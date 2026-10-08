import { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import '../components/game/game.css';
import { GameCanvas } from '../components/game/GameCanvas.jsx';
import { Hud } from '../components/hud/Hud.jsx';
import { VirtualJoystick } from '../components/hud/VirtualJoystick.jsx';
import { WorldLoader } from '../components/game/WorldLoader.jsx';
import { Button, IconChevronLeft } from '../components/ui/index.js';
import { useWorldInteractions, useWorldViewport } from '../hooks/useWorldInteractions.js';
import { useUiStore } from '../stores/uiStore.js';
import { useIsCompact } from '../hooks/useMediaQuery.js';

/**
 * The player apartment — the same world shell with a different scene, which is
 * the whole point of keeping interaction and control in shared systems.
 */
export default function Apartment() {
  const navigate = useNavigate();
  const worldReady = useUiStore((s) => s.worldReady);
  const isCompact = useIsCompact();

  useWorldInteractions();
  useWorldViewport();

  return (
    <div className="app app--world">
      <div className="world">
        <Suspense fallback={<WorldLoader label="Entering your apartment" />}>
          <GameCanvas scene="apartment" />
        </Suspense>

        {!worldReady ? <WorldLoader label="Entering your apartment" /> : null}

        <Hud
          scene="apartment"
          action={
            <Button
              variant="ghost"
              size={isCompact ? 'sm' : 'md'}
              className="hud-exit"
              icon={<IconChevronLeft size={16} />}
              onClick={() => navigate('/city')}
            >
              {isCompact ? 'City' : 'Back to the city'}
            </Button>
          }
        />
        {isCompact ? <VirtualJoystick /> : null}
      </div>
    </div>
  );
}
