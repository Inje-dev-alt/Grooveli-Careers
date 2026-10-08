import './ai.css';
import { Panel, Badge, Button, AsyncBoundary, LoadingState, EmptyState, IconTarget, IconCheck, IconAlert } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import * as aiService from '../../services/aiService.js';

/**
 * Career discovery.
 *
 * Shows career paths the candidate's actual skills point at, with the
 * reasoning: what already fits, and what is missing. It is the bridge between
 * "I have these skills" and "these are the jobs worth applying to".
 */
export function CareerDiscovery({ onExplore }) {
  const query = useAsync(() => aiService.getCareerMatches(), []);

  return (
    <AsyncBoundary
      query={query}
      loading={<LoadingState rows={2} label="Reading your profile" />}
      errorTitle="Could not run career discovery"
      empty={
        <EmptyState
          title="Not enough to go on yet"
          body="Add a few skills to your profile and career discovery will have something to match against."
          icon={<IconTarget size={22} />}
        />
      }
    >
      {(matches) => (
        <ul className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
          {matches.map((match) => (
            <li key={match.id}>
              <Panel pad="sm" className="discovery">
                <div className="discovery__head">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="discovery__title">{match.title}</h3>
                    <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.6 }}>
                      {match.summary}
                    </p>
                  </div>
                  <Badge tone={match.matchScore >= 75 ? 'success' : match.matchScore >= 50 ? 'accent' : 'warning'}>
                    {match.matchScore}% match
                  </Badge>
                </div>

                {match.strengths.length > 0 ? (
                  <div className="discovery__list">
                    <span className="g-eyebrow">Strengths</span>
                    {match.strengths.map((strength) => (
                      <span key={strength} className="discovery__row">
                        <IconCheck size={14} style={{ color: 'var(--g-success)', flex: 'none' }} />
                        {strength}
                      </span>
                    ))}
                  </div>
                ) : null}

                {match.gaps.length > 0 ? (
                  <div className="discovery__list">
                    <span className="g-eyebrow">Potential gaps</span>
                    {match.gaps.map((gap) => (
                      <span key={gap} className="discovery__row discovery__row--gap">
                        <IconAlert size={14} style={{ flex: 'none' }} />
                        {gap}
                      </span>
                    ))}
                  </div>
                ) : null}

                {onExplore ? (
                  <Button size="sm" variant="ghost" onClick={() => onExplore(match)}>
                    Explore this career
                  </Button>
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}
