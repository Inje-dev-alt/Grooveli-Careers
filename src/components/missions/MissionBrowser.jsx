import { useEffect, useState } from 'react';
import './missions.css';
import { MissionCard } from './MissionCard.jsx';
import { Tabs, EmptyState, LoadingState, ErrorState, IconTarget } from '../ui/index.js';
import { useMissionStore } from '../../stores/missionStore.js';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'career', label: 'Career' },
  { id: 'skill', label: 'Skill' },
  { id: 'completed', label: 'Completed' },
];

/**
 * Mission list, filtered by type.
 *
 * Mounted on the Missions route and inside district panels. A district passes
 * `locationId` and gets only the missions offered there.
 *
 * @param {{ locationId?: string, wide?: boolean, onOpenMission: (mission)=>void }} props
 */
export function MissionBrowser({ locationId, wide = false, onOpenMission }) {
  const [tab, setTab] = useState('all');
  const missions = useMissionStore((s) => s.missions);
  const progress = useMissionStore((s) => s.progress);
  const status = useMissionStore((s) => s.status);
  const error = useMissionStore((s) => s.error);
  const loadMissions = useMissionStore((s) => s.loadMissions);

  useEffect(() => {
    if (status === 'idle') loadMissions();
  }, [status, loadMissions]);

  const scoped = locationId ? missions.filter((m) => m.locationId === locationId) : missions;
  const visible = scoped.filter((mission) => {
    const complete = progress[mission.id]?.status === 'completed';
    if (tab === 'completed') return complete;
    if (tab === 'all') return true;
    return mission.type === tab && !complete;
  });

  if (status === 'loading' && missions.length === 0) return <LoadingState rows={3} label="Loading missions" />;
  if (status === 'error') return <ErrorState error={{ message: error }} onRetry={loadMissions} title="Could not load missions" />;

  return (
    <div className="g-stack">
      {!locationId ? <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Mission types" /> : null}

      {visible.length === 0 ? (
        <EmptyState
          title={tab === 'completed' ? 'No missions completed yet' : 'No missions here'}
          body={
            tab === 'completed'
              ? 'Finish a mission and it will be recorded here, along with the XP it earned.'
              : 'Other districts in Grooveli City are offering missions. The Training Center has the most.'
          }
          icon={<IconTarget size={22} />}
        />
      ) : (
        <ul className={`mission-list${wide ? ' mission-list--wide' : ''}`}>
          {visible.map((mission) => (
            <li key={mission.id}>
              <MissionCard mission={mission} onOpen={onOpenMission} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
