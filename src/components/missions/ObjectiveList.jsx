import './missions.css';
import { Button, IconCheck } from '../ui/index.js';
import { useMissionStore } from '../../stores/missionStore.js';

/**
 * Objectives for any mission.
 *
 * Reads progress out of the store by objective id, so one component renders
 * every mission in the game. Objectives that name a destination get a CTA that
 * takes the player there.
 *
 * @param {{ mission: import('../../models/index.js').Mission, onNavigate?: (route:string)=>void }} props
 */
export function ObjectiveList({ mission, onNavigate }) {
  const progress = useMissionStore((s) => s.progress[mission.id]);
  const counts = progress?.objectiveCounts ?? {};

  return (
    <ul className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
      {mission.objectives.map((objective) => {
        const count = counts[objective.id] ?? 0;
        const done = count >= objective.target;

        return (
          <li key={objective.id} className={`objective${done ? ' objective--done' : ''}`}>
            <span className="objective__check" aria-hidden="true">
              {done ? <IconCheck size={13} /> : null}
            </span>

            <div className="objective__body">
              <span className="objective__label">{objective.label}</span>
              {objective.hint ? <span className="objective__hint">{objective.hint}</span> : null}
              {objective.target > 1 ? (
                <span className="objective__count">
                  {Math.min(count, objective.target)} of {objective.target}
                </span>
              ) : null}
            </div>

            {!done && objective.actionRoute && onNavigate ? (
              <Button size="sm" variant="ghost" onClick={() => onNavigate(objective.actionRoute)}>
                {objective.actionLabel ?? 'Go'}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
