import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './profile.css';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  ProgressBar,
  StatTile,
  StatGrid,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  IconBriefcase,
  IconTarget,
} from '../ui/index.js';
import { MissionCard } from '../missions/MissionCard.jsx';
import { NextCareerAction } from '../ai/NextCareerAction.jsx';
import { JobCard } from '../jobs/JobCard.jsx';
import { ApplicationList } from './ApplicationList.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useCareerStore, selectProgression, selectCareerTitle } from '../../stores/careerStore.js';
import { useMissionStore, selectActiveMissions } from '../../stores/missionStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as jobService from '../../services/jobService.js';

/**
 * The desk: one screen that answers "where am I, and what should I do next?".
 *
 * Everything here is a view over existing state — it owns nothing of its own,
 * which is why it can be opened from the apartment, the menu or a route.
 */
export function CareerDashboard() {
  const navigate = useNavigate();
  const progression = useCareerStore(selectProgression);
  const careerTitle = useCareerStore(selectCareerTitle);
  const reputation = useCareerStore((s) => s.reputation);
  const xp = useCareerStore((s) => s.xp);
  const missionStatus = useMissionStore((s) => s.status);
  const loadMissions = useMissionStore((s) => s.loadMissions);
  const activeMissions = useMissionStore(selectActiveMissions);
  const openModal = useUiStore((s) => s.openModal);
  const closeAllModals = useUiStore((s) => s.closeAllModals);

  const recommendedQuery = useAsync(() => jobService.listRecommendedJobs(3), []);

  useEffect(() => {
    if (missionStatus === 'idle') loadMissions();
  }, [missionStatus, loadMissions]);

  const nextMission = activeMissions.find((m) => m.type === 'career') ?? activeMissions[0];

  const goTo = (route) => {
    closeAllModals();
    navigate(route);
  };

  return (
    <div className="g-stack">
      <NextCareerAction />

      <Panel>
        <PanelHeader
          title={`Career level ${progression.level}`}
          subtitle={careerTitle}
          action={<Badge tone="accent">{xp.toLocaleString('en-US')} XP</Badge>}
        />
        <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
          <ProgressBar
            value={progression.xpIntoLevel}
            max={progression.xpForNextLevel}
            size="lg"
            label="Progress to next career level"
          />
          <StatGrid>
            <StatTile label="To next level" value={`${progression.xpForNextLevel - progression.xpIntoLevel} XP`} />
            <StatTile label="Reputation" value={`${reputation}/100`} accent="var(--g-accent)" />
            <StatTile label="Missions open" value={activeMissions.length} />
          </StatGrid>
        </div>
      </Panel>

      {nextMission ? (
        <Panel>
          <PanelHeader
            title="Your next mission"
            action={
              <Button size="sm" variant="subtle" onClick={() => goTo('/missions')}>
                All missions
              </Button>
            }
          />
          <MissionCard
            mission={nextMission}
            onOpen={(mission) => openModal('mission-detail', { mission })}
          />
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            title="Every mission complete"
            body="New career missions unlock as the city grows. Keep applying in the meantime."
            icon={<IconTarget size={22} />}
          />
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Strongest matches"
          subtitle="Scored against your profile, not just your keywords."
          action={
            <Button size="sm" variant="subtle" onClick={() => goTo('/jobs')}>
              Open marketplace
            </Button>
          }
        />
        <AsyncBoundary
          query={recommendedQuery}
          loading={<LoadingState rows={2} label="Loading matches" />}
          empty={<EmptyState title="No matches yet" icon={<IconBriefcase size={22} />} />}
        >
          {(jobs) => (
            <ul className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
              {jobs.map((job) => (
                <li key={job.id}>
                  <JobCard job={job} onOpen={(target) => openModal('job-detail', { job: target })} />
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </Panel>

      <Panel>
        <PanelHeader title="In flight" subtitle="Applications waiting on someone else." />
        <ApplicationList limit={4} />
      </Panel>
    </div>
  );
}
