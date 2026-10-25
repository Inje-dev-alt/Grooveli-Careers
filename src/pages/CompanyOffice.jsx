import { Suspense, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../components/game/game.css';
import { GameCanvas } from '../components/game/GameCanvas.jsx';
import { Hud } from '../components/hud/Hud.jsx';
import { VirtualJoystick } from '../components/hud/VirtualJoystick.jsx';
import { WorldLoader } from '../components/game/WorldLoader.jsx';
import { Button, IconChevronLeft } from '../components/ui/index.js';
import { useWorldInteractions, useWorldViewport } from '../hooks/useWorldInteractions.js';
import { useUiStore } from '../stores/uiStore.js';
import { useOfficeStore } from '../stores/officeStore.js';
import { usePresencePosition } from '../hooks/usePresencePosition.js';
import { useIsCompact } from '../hooks/useMediaQuery.js';

/**
 * A company's office — somewhere a candidate can actually go.
 *
 * Companies were a list in a district panel: real rows, real jobs, no place.
 * This gives each one a lobby with reception, a board of open roles and a
 * notice board, built from the same interior renderer as the apartment and the
 * employer's HQ.
 *
 * The room is identical for every company and the route decides whose it is,
 * which is what keeps this a data feature rather than a building per employer.
 * The store is loaded on the way in because the furniture's interactions are
 * plain functions with no access to the route.
 */
export default function CompanyOffice() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const worldReady = useUiStore((s) => s.worldReady);
  const organization = useOfficeStore((s) => s.organization);
  const visit = useOfficeStore((s) => s.visit);
  const reset = useOfficeStore((s) => s.reset);
  const isCompact = useIsCompact();

  useWorldInteractions();
  useWorldViewport();
  // Every office is the same room and the route decides whose it is, so the
  // organization id is what separates one lobby's occupants from another's.
  usePresencePosition('office', organizationId);

  useEffect(() => {
    visit(organizationId);
    // Cleared on the way out so the next office cannot open showing the last
    // company's reception while its own is still loading.
    return () => reset();
  }, [organizationId, visit, reset]);

  const label = organization?.name ?? 'Company Office';

  return (
    <div className="app app--world">
      <div className="world">
        <Suspense fallback={<WorldLoader label="Entering the office" />}>
          <GameCanvas scene="office" />
        </Suspense>

        {!worldReady ? <WorldLoader label="Entering the office" /> : null}

        <Hud
          scene="office"
          locationLabel={label}
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
