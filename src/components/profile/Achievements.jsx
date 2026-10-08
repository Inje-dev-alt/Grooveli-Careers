import './profile.css';
import { AsyncBoundary, LoadingState, EmptyState, IconAward, IconLock } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import * as careerService from '../../services/careerService.js';

/** The trophy shelf. Earned achievements first, locked ones dimmed behind them. */
export function Achievements() {
  const query = useAsync(() => careerService.listAchievements(), []);

  return (
    <AsyncBoundary
      query={query}
      loading={<LoadingState rows={2} label="Loading achievements" />}
      empty={<EmptyState title="No achievements yet" icon={<IconAward size={22} />} />}
    >
      {(achievements) => (
        <ul className="achievement-grid">
          {[...achievements]
            .sort((a, b) => Number(b.earned) - Number(a.earned))
            .map((achievement) => (
              <li
                key={achievement.id}
                className={`achievement${achievement.earned ? '' : ' achievement--locked'}`}
              >
                <span className="achievement__icon">
                  {achievement.earned ? <IconAward size={20} /> : <IconLock size={18} />}
                </span>
                <span className="achievement__name">{achievement.name}</span>
                <span className="achievement__desc">{achievement.description}</span>
              </li>
            ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}
