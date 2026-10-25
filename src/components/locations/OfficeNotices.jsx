import { EmptyState, LoadingState, IconDoc } from '../ui/index.js';
import { PostCard } from '../social/PostCard.jsx';
import { useOfficeStore } from '../../stores/officeStore.js';

/**
 * The notice board — what this company has shared with the network.
 *
 * The same `PostCard` the feed uses, so a company's posts look and behave
 * identically wherever they are read. A company that has posted nothing shows
 * that honestly rather than filling the wall.
 */
export function OfficeNotices() {
  const posts = useOfficeStore((s) => s.posts);
  const organization = useOfficeStore((s) => s.organization);
  const status = useOfficeStore((s) => s.status);

  if (status === 'loading') return <LoadingState rows={2} label="Reading the notice board" />;

  if (posts.length === 0) {
    return (
      <EmptyState
        title="Nothing on the board"
        body={`${organization?.name ?? 'This company'} has not shared anything with the network yet.`}
        icon={<IconDoc size={22} />}
      />
    );
  }

  return (
    <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
