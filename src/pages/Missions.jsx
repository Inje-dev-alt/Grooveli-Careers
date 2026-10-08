import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { MissionBrowser } from '../components/missions/MissionBrowser.jsx';
import { Panel, StatTile, StatGrid } from '../components/ui/index.js';
import { useUiStore } from '../stores/uiStore.js';
import { useCareerStore, selectProgression } from '../stores/careerStore.js';
import { useMissionStore, selectCompletedMissionCount, selectActiveMissions } from '../stores/missionStore.js';

export default function Missions() {
  const openModal = useUiStore((s) => s.openModal);
  const progression = useCareerStore(selectProgression);
  const xp = useCareerStore((s) => s.xp);
  const completed = useMissionStore(selectCompletedMissionCount);
  const active = useMissionStore(selectActiveMissions);

  return (
    <AppShell>
      <Page
        title="Missions"
        lede="Structured career activity. Every objective maps to something an employer can actually see — a finished profile, a verified skill, a real application."
      >
        <div className="g-stack">
          <Panel>
            <StatGrid>
              <StatTile label="Career level" value={progression.level} accent="var(--g-accent)" />
              <StatTile label="Lifetime XP" value={xp} />
              <StatTile label="Completed" value={completed} />
              <StatTile label="Open" value={active.length} />
            </StatGrid>
          </Panel>

          <MissionBrowser wide onOpenMission={(mission) => openModal('mission-detail', { mission })} />
        </div>
      </Page>
    </AppShell>
  );
}
