import { useEffect } from 'react';
import { useCityBoardStore } from '../stores/cityBoardStore.js';

/**
 * Keep the city's notice boards current while it is open.
 *
 * Loads once on entry, then refreshes when the player comes back to the
 * window. The counts are server state with no live channel behind them, so
 * returning to the tab is the only honest moment to ask again — a poll would
 * spend a request a minute to catch a number that changes a few times a day.
 *
 * Both events are listened for because they cover different returns:
 * `visibilitychange` fires when you switch browser tabs, `focus` when you
 * switch applications. They overlap often enough that the store throttles the
 * fetch rather than this hook trying to guess which one happened.
 */
export function useCityBoards() {
  const load = useCityBoardStore((s) => s.load);
  const refresh = useCityBoardStore((s) => s.refresh);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
}
