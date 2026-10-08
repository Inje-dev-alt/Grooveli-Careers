import './profile.css';
import {
  Panel,
  PanelHeader,
  StatTile,
  StatGrid,
  Meter,
  ProgressBar,
  AsyncBoundary,
  LoadingState,
  Badge,
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useCareerStore, selectProgression, selectCareerTitle } from '../../stores/careerStore.js';
import { useMissionStore, selectCompletedMissionCount } from '../../stores/missionStore.js';
import * as careerService from '../../services/careerService.js';
import { formatRelativeTime } from '../../utils/format.js';

/**
 * The career wall: level, reputation, statistics and the XP ledger.
 *
 * The ledger is included deliberately. XP that cannot be traced back to a real
 * activity is the kind of engagement metric the PRD warns against, so every
 * award is shown with what earned it — including the awards worth zero.
 */
export function CareerStats() {
  const progression = useCareerStore(selectProgression);
  const careerTitle = useCareerStore(selectCareerTitle);
  const reputation = useCareerStore((s) => s.reputation);
  const xp = useCareerStore((s) => s.xp);
  const ledger = useCareerStore((s) => s.ledger);
  const completedMissions = useMissionStore(selectCompletedMissionCount);

  const statsQuery = useAsync(() => careerService.getStats(), []);

  return (
    <div className="g-stack">
      <Panel>
        <PanelHeader title="Career level" subtitle={careerTitle} action={<Badge tone="accent">Level {progression.level}</Badge>} />
        <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
          <ProgressBar
            value={progression.xpIntoLevel}
            max={progression.xpForNextLevel}
            size="lg"
            label="Progress to next level"
          />
          <div className="g-row-between" style={{ fontSize: 'var(--g-text-sm)' }}>
            <span className="g-muted g-mono">
              {progression.xpIntoLevel} / {progression.xpForNextLevel} XP into this level
            </span>
            <span className="g-dim g-mono">{xp.toLocaleString('en-US')} XP lifetime</span>
          </div>
          <Meter label="Career reputation" value={reputation} suffix="/100" />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Statistics" />
        <AsyncBoundary query={statsQuery} loading={<LoadingState rows={1} label="Loading statistics" />}>
          {(stats) => (
            <StatGrid>
              <StatTile label="Missions completed" value={Math.max(stats.completedMissions, completedMissions)} />
              <StatTile label="Certifications" value={stats.certifications} />
              <StatTile label="Applications" value={stats.applications} />
              <StatTile label="Interviews" value={stats.interviews} />
              <StatTile label="Offers" value={stats.offers} />
              <StatTile label="Jobs viewed" value={stats.jobsViewed} />
            </StatGrid>
          )}
        </AsyncBoundary>
      </Panel>

      <Panel>
        <PanelHeader title="Recent activity" subtitle="Every XP award, and what earned it." />
        {ledger.length === 0 ? (
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
            Nothing recorded this session. Complete a mission objective and it will appear here.
          </p>
        ) : (
          <ul className="ledger">
            {ledger.slice(0, 12).map((entry) => (
              <li key={entry.id} className="ledger__row">
                <span className="g-truncate">{entry.label}</span>
                <span className="g-row" style={{ gap: 10, flex: 'none' }}>
                  <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                    {formatRelativeTime(entry.at)}
                  </span>
                  <span className={`ledger__xp${entry.xp === 0 ? ' ledger__xp--zero' : ''}`}>
                    {entry.xp > 0 ? `+${entry.xp}` : '0'} XP
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
