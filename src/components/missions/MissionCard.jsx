import './missions.css';
import { Panel, Badge, Button, ProgressBar } from '../ui/index.js';
import { useMissionStore } from '../../stores/missionStore.js';

const DIFFICULTY_TONE = { easy: 'success', medium: 'warning', hard: 'danger' };
const TYPE_LABEL = { career: 'Career mission', skill: 'Skill mission', discovery: 'Discovery' };

/**
 * @param {{ mission: import('../../models/index.js').Mission, onOpen?: (mission)=>void }} props
 */
export function MissionCard({ mission, onOpen }) {
  const progress = useMissionStore((s) => s.progress[mission.id]);
  const counts = progress?.objectiveCounts ?? {};
  const completedCount = mission.objectives.filter((o) => (counts[o.id] ?? 0) >= o.target).length;
  const complete = progress?.status === 'completed';

  return (
    <Panel pad="sm" className="mission-card">
      <div className="mission-card__top">
        <div style={{ minWidth: 0 }}>
          <p className="g-eyebrow">{TYPE_LABEL[mission.type] ?? mission.type}</p>
          <h3 className="mission-card__title">{mission.title}</h3>
        </div>
        {complete ? (
          <Badge tone="success" dot>
            Complete
          </Badge>
        ) : (
          <Badge tone={DIFFICULTY_TONE[mission.difficulty]}>{mission.difficulty}</Badge>
        )}
      </div>

      <p className="mission-card__desc g-clamp-2">{mission.description}</p>

      <div className="mission-card__progress">
        <ProgressBar
          value={completedCount}
          max={mission.objectives.length}
          size="sm"
          tone={complete ? 'accent' : 'muted'}
          label={`${mission.title} progress`}
        />
        <div className="mission-card__progress-meta">
          <span>
            {completedCount} of {mission.objectives.length} objectives
          </span>
          <span className="mission-xp">+{mission.xpReward} XP</span>
        </div>
      </div>

      {onOpen ? (
        <div className="mission-card__footer">
          <Button size="sm" variant="ghost" onClick={() => onOpen(mission)}>
            {complete ? 'Review' : 'Open mission'}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
