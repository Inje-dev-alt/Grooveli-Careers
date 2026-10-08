import { useNavigate } from 'react-router-dom';
import './ai.css';
import { Panel, Button, Badge, LoadingState, ErrorState, IconTrendUp } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as aiService from '../../services/aiService.js';

/**
 * Your next career move.
 *
 * The product should always be able to answer "what should I do next, and
 * why" — and the why matters more than the what. A recommendation with no
 * reason behind it is just a nag.
 */
export function NextCareerAction({ compact = false }) {
  const navigate = useNavigate();
  const closeAllModals = useUiStore((s) => s.closeAllModals);
  const openModal = useUiStore((s) => s.openModal);
  const query = useAsync(() => aiService.getNextCareerAction(), []);

  if (query.isLoading) return <LoadingState rows={1} label="Working out your next move" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} title="Could not load a recommendation" />;
  if (!query.data) return null;

  const action = query.data;

  const go = () => {
    if (action.intent) {
      openModal('ai', { initialIntent: action.intent });
      return;
    }
    closeAllModals();
    navigate(action.route);
  };

  return (
    <Panel className="next-action">
      <div className="next-action__head">
        <span className="next-action__icon">
          <IconTrendUp size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="g-eyebrow">Your next career move</p>
          <h3 className="next-action__title">{action.title}</h3>
        </div>
        {action.xp > 0 ? <Badge tone="accent">+{action.xp} XP</Badge> : null}
      </div>

      {!compact ? (
        <div className="next-action__why">
          <span className="g-eyebrow">Why</span>
          <p>{action.reason}</p>
        </div>
      ) : null}

      <Button variant="primary" onClick={go}>
        {action.actionLabel}
      </Button>
    </Panel>
  );
}
