import { Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../components/game/game.css';
import { GameCanvas } from '../components/game/GameCanvas.jsx';
import { Hud } from '../components/hud/Hud.jsx';
import { VirtualJoystick } from '../components/hud/VirtualJoystick.jsx';
import { WorldLoader } from '../components/game/WorldLoader.jsx';
import { Button, IconChevronLeft } from '../components/ui/index.js';
import { useWorldInteractions, useWorldViewport } from '../hooks/useWorldInteractions.js';
import { useUiStore } from '../stores/uiStore.js';
import { useEmployerStore } from '../stores/employerStore.js';
import { usePresencePosition } from '../hooks/usePresencePosition.js';
import { useIsCompact } from '../hooks/useMediaQuery.js';

/**
 * The company headquarters — the employer's place in Grooveli City.
 *
 * The scene, its furniture and every interaction it offers already existed:
 * `game/world/company.js` declares the room, `CompanyScene` binds it to the
 * shared interior renderer, and the interaction registry has resolved
 * `company-jobs`, `company-candidates`, `company-analytics`, `company-profile`
 * and `company-exit` all along. What was missing was a route — so the room was
 * built, furnished and unreachable.
 *
 * That left the product lopsided in a way the pitch does not survive: a
 * candidate gets a city and an apartment, an employer got four dashboard
 * pages. The city is supposed to be where the market happens, and a market
 * with only one side standing in it is a brochure.
 *
 * Same shell as the apartment, which is the point of keeping control,
 * interaction and HUD in shared systems: a new room is a page and a route.
 */
export default function EmployerHQ() {
  const navigate = useNavigate();
  const worldReady = useUiStore((s) => s.worldReady);
  const organization = useEmployerStore((s) => s.organization);
  const status = useEmployerStore((s) => s.status);
  const load = useEmployerStore((s) => s.load);
  const isCompact = useIsCompact();

  useWorldInteractions();
  useWorldViewport();
  // An HQ is shared by the people who run that company, so the
  // organization is the room — the same rule a candidate's office visit
  // follows, which is why two members of one employer meet here and
  // members of two employers never do.
  usePresencePosition('company', organization?.id ?? null);

  // The HQ is reached without passing through the dashboard shell, so it loads
  // the organization itself — otherwise the hiring board opens empty and the
  // HUD cannot name the company whose office this is.
  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  // The room's own objects name themselves when you stand near one; this is
  // what the HUD reads otherwise. The world data cannot know whose company
  // this is, so the page says.
  const label = organization?.name ?? 'Company HQ';

  return (
    <div className="app app--world">
      <div className="world">
        <Suspense fallback={<WorldLoader label="Entering your headquarters" />}>
          <GameCanvas scene="company" />
        </Suspense>

        {!worldReady ? <WorldLoader label="Entering your headquarters" /> : null}

        <Hud
          scene="company"
          locationLabel={label}
          action={
            <Button
              variant="ghost"
              size={isCompact ? 'sm' : 'md'}
              className="hud-exit"
              icon={<IconChevronLeft size={16} />}
              onClick={() => navigate('/employer')}
            >
              {isCompact ? 'Dashboard' : 'Back to the dashboard'}
            </Button>
          }
        />
        {isCompact ? <VirtualJoystick /> : null}
      </div>
    </div>
  );
}
