import { useEffect, useState } from 'react';
import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { PostCard } from '../components/social/PostCard.jsx';
import { PostComposer } from '../components/social/PostComposer.jsx';
import '../components/social/social.css';
import {
  Panel,
  PanelHeader,
  Button,
  Tabs,
  LoadingState,
  ErrorState,
  EmptyState,
  IconGrid,
  IconUser,
} from '../components/ui/index.js';
import { useSocialStore } from '../stores/socialStore.js';
import { useUiStore } from '../stores/uiStore.js';
import { recordCareerEvent } from '../stores/progression.js';
import { CAREER_EVENTS } from '../utils/careerEvents.js';
import { initials } from '../utils/format.js';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'achievement', label: 'Achievements' },
  { id: 'advice', label: 'Advice' },
  { id: 'opportunity', label: 'Opportunities' },
];

/**
 * The Grooveli Network.
 *
 * Deliberately small: a feed, a composer, and the two relationships that
 * matter. The question it exists to answer is whether career activity is worth
 * sharing — not whether people will scroll.
 */
export default function Network() {
  const [tab, setTab] = useState('all');
  const posts = useSocialStore((s) => s.posts);
  const people = useSocialStore((s) => s.people);
  const status = useSocialStore((s) => s.status);
  const error = useSocialStore((s) => s.error);
  const load = useSocialStore((s) => s.load);
  const connect = useSocialStore((s) => s.connect);
  const connections = useSocialStore((s) => s.connections);
  const respond = useSocialStore((s) => s.respond);
  const respondingTo = useSocialStore((s) => s.respondingTo);
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    load();
  }, [load]);

  const visible = tab === 'all' ? posts : posts.filter((p) => p.type === tab);

  // Only incoming requests can be answered: the person who asked does not get
  // to accept on the other's behalf, and the API refuses it besides.
  const requests = connections.filter((c) => c.incoming && c.status === 'pending');

  const handleRespond = async (request, decision) => {
    try {
      await respond(request.id, decision);
      pushToast({
        title: decision === 'accept'
          ? `You and ${request.name} are connected`
          : `Request from ${request.name} declined`,
        body: decision === 'accept' ? 'You can now ask them for a referral.' : undefined,
        tone: decision === 'accept' ? 'success' : 'info',
      });
    } catch (caught) {
      pushToast({ title: 'Could not answer that request', body: caught.message, tone: 'danger' });
    }
  };

  const handleConnect = async (person) => {
    const connection = await connect(person.id);
    recordCareerEvent(CAREER_EVENTS.CONNECTION_MADE, {
      label: `Connected with ${person.name}`,
      silent: true,
      context: { connectionId: connection.id },
    });
    pushToast({ title: `Connection request sent to ${person.name}`, tone: 'success' });
  };

  return (
    <AppShell>
      <Page
        title="Grooveli Network"
        lede="Career activity from people and companies in the city. What gets shared here is evidence — a verified skill, a finished course, a role that is actually open."
      >
        <div className="network">
          <div className="network__feed">
            <PostComposer />
            <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Feed filters" />

            {status === 'loading' && posts.length === 0 ? (
              <LoadingState rows={3} label="Loading the network" />
            ) : null}

            {status === 'error' ? (
              <ErrorState error={{ message: error }} onRetry={load} title="Could not load the network" />
            ) : null}

            {status === 'ready' && visible.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                body="No posts of this kind. Try another filter, or share something from your own career."
                icon={<IconGrid size={22} />}
              />
            ) : null}

            {visible.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          <aside className="network__aside">
            {/* Only rendered when there is something to answer: an empty
                "Requests" panel on every visit is furniture, not information. */}
            {requests.length > 0 ? (
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
            ) : null}

            <Panel pad="sm">
              <PanelHeader title="People to connect with" subtitle="Working in the same part of the market." />
              {people.length === 0 ? (
                <EmptyState title="No suggestions yet" icon={<IconUser size={20} />} />
              ) : (
                <div>
                  {people.map((person) => (
                    <div key={person.id} className="person">
                      <span className="person__avatar" style={{ background: person.color }}>
                        {initials(person.name)}
                      </span>
                      <div className="person__body">
                        <p className="person__name g-truncate">{person.name}</p>
                        <p className="person__headline g-clamp-2">{person.headline}</p>
                        {person.mutual > 0 ? (
                          <p className="person__mutual">{person.mutual} mutual connections</p>
                        ) : null}
                      </div>
                      <Button
                        size="sm"
                        variant={person.status ? 'ghost' : 'primary'}
                        disabled={Boolean(person.status)}
                        onClick={() => handleConnect(person)}
                      >
                        {person.status === 'pending' ? 'Requested' : person.status ? 'Connected' : 'Connect'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel pad="sm">
              <PanelHeader title="Why share?" />
              <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.7 }}>
                Employers can see verified achievements on your profile. Sharing one puts it in front of
                people who are hiring for it — and in front of people doing the same work, who tend to know
                where the roles are before they are posted.
              </p>
            </Panel>
          </aside>
        </div>
      </Page>
    </AppShell>
  );
}
