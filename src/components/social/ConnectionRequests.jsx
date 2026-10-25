import { useEffect } from 'react';
import './social.css';
import { Panel, PanelHeader, Button } from '../ui/index.js';
import { useSocialStore, isPendingRequest } from '../../stores/socialStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { initials } from '../../utils/format.js';

/**
 * Connection requests waiting on this account.
 *
 * Extracted from the network page because an employer needs it just as much
 * and could not reach it. `/network` is a candidate-only route, and employers
 * now appear in company office rosters — so a candidate could ask an employer
 * to connect and the employer had no screen on which to answer, while their
 * notification pointed at a route that redirected them away. A relationship
 * one side can start and the other cannot finish is worse than no feature.
 *
 * Renders nothing when there is nothing to answer. An empty "Requests" panel
 * on every visit is furniture, not information.
 *
 * Loads the social store itself rather than trusting the host page to have
 * done it, because the employer dashboard has no other reason to.
 */
export function ConnectionRequests() {
  // The stable slice, filtered here. Selecting a freshly built array would
  // re-render this panel on every change anywhere in the social store.
  const connections = useSocialStore((s) => s.connections);
  const respondingTo = useSocialStore((s) => s.respondingTo);
  const respond = useSocialStore((s) => s.respond);
  const status = useSocialStore((s) => s.status);
  const load = useSocialStore((s) => s.load);
  const pushToast = useUiStore((s) => s.pushToast);

  const requests = connections.filter(isPendingRequest);

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const handleRespond = async (request, decision) => {
    try {
      await respond(request.id, decision);
      pushToast({
        title:
          decision === 'accept'
            ? `You and ${request.name} are connected`
            : `Request from ${request.name} declined`,
        // Accepting is what lifts the one-message limit on a conversation with
        // them, so the toast says so — it is the part nobody would guess.
        body:
          decision === 'accept'
            ? 'You can message each other freely now, and ask for referrals.'
            : undefined,
        tone: decision === 'accept' ? 'success' : 'info',
      });
    } catch (caught) {
      pushToast({ title: 'Could not answer that request', body: caught.message, tone: 'danger' });
    }
  };

  if (requests.length === 0) return null;

  return (
    <Panel pad="sm">
      <PanelHeader
        title={requests.length === 1 ? '1 connection request' : `${requests.length} connection requests`}
        subtitle="They asked to connect with you."
      />
      <div>
        {requests.map((request) => (
          <div key={request.id} className="person">
            <span className="person__avatar" style={{ background: request.color }}>
              {initials(request.name)}
            </span>
            <div className="person__body">
              <p className="person__name g-truncate">{request.name}</p>
              <p className="person__headline g-clamp-2">{request.headline}</p>
            </div>
            <div className="g-row" style={{ gap: 6 }}>
              <Button
                size="sm"
                variant="primary"
                loading={respondingTo === request.id}
                onClick={() => handleRespond(request, 'accept')}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={respondingTo === request.id}
                onClick={() => handleRespond(request, 'decline')}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
