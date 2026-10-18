import { useState } from 'react';
import './leaderboard.css';
import { Panel, PanelHeader, Button, Badge, AsyncBoundary, LoadingState, EmptyState, IconTrendUp } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import * as leaderboardService from '../../services/leaderboardService.js';
import { useUiStore } from '../../stores/uiStore.js';
import { initials } from '../../utils/format.js';

/**
 * City standings, on the plaza board.
 *
 * Ranked by reputation - what an employer can verify - because a board ranked
 * by activity becomes a farming contest. Opting out removes you from the list
 * immediately; the toggle lives here so leaving is as easy as arriving.
 */
export function Leaderboard() {
  const query = useAsync(() => leaderboardService.getLeaderboard(), []);
  const optOutQuery = useAsync(() => leaderboardService.getLeaderboardOptOut(), []);
  const [busy, setBusy] = useState(false);
  const pushToast = useUiStore((s) => s.pushToast);

  const toggleOptOut = async () => {
    setBusy(true);
    const next = !optOutQuery.data;
    optOutQuery.setData(next);
    try {
      await leaderboardService.setLeaderboardOptOut(next);
      await query.refetch();
      pushToast({
        title: next ? 'You are off the board' : 'You are on the board',
        body: next ? 'Your name no longer appears in City Standings.' : 'Your reputation rank is now visible in the plaza.',
        tone: 'info',
      });
    } catch (error) {
      optOutQuery.setData(!next);
      pushToast({ title: 'Could not update', body: error.message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
      <Panel pad="sm">
        <PanelHeader
          title="How this is ranked"
          subtitle="Reputation only moves on work someone else could verify, so this board measures credibility - not time spent here."
        />
        <div className="g-row-between">
          <span style={{ fontSize: 'var(--g-text-sm)' }}>Show me on the board</span>
          <Button size="sm" variant={optOutQuery.data ? 'ghost' : 'primary'} loading={busy} onClick={toggleOptOut}>
            {optOutQuery.data ? 'Opt back in' : 'Opt out'}
          </Button>
        </div>
      </Panel>

      <AsyncBoundary
        query={query}
        loading={<LoadingState rows={4} label="Reading the board" />}
        errorTitle="Could not load standings"
        empty={<EmptyState title="Nobody on the board yet" icon={<IconTrendUp size={22} />} />}
      >
        {(entries) => (
          <ul className="g-stack leaderboard">
            {entries.map((entry) => (
              <li key={entry.id} className={`leaderboard__row${entry.isMe ? ' leaderboard__row--me' : ''}`}>
                <span className="leaderboard__rank">{entry.rank}</span>
                <span className="leaderboard__avatar" style={{ background: entry.color }}>
                  {initials(entry.name)}
                </span>
                <div className="leaderboard__who">
                  <p className="leaderboard__name g-truncate">
                    {entry.name}
                    {entry.isMe ? <Badge tone="accent">You</Badge> : null}
                  </p>
                  <p className="leaderboard__headline g-truncate">{entry.headline}</p>
                </div>
                <div className="leaderboard__stats">
                  <Badge>Level {entry.careerLevel}</Badge>
                  <Badge tone="accent">Reputation {entry.reputation}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}