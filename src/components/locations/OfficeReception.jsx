import { Badge, Button, EmptyState, LoadingState, IconGrid, CompanyMark } from '../ui/index.js';
import { useOfficeStore } from '../../stores/officeStore.js';
import { useSocialStore } from '../../stores/socialStore.js';
import { formatNumber } from '../../utils/format.js';

/**
 * Reception — the company profile a candidate reads before applying.
 *
 * The same facts the district's company list shows, with room to actually read
 * them, because standing in the lobby is the moment someone is deciding
 * whether this is a place they want to work.
 */
export function OfficeReception() {
  const organization = useOfficeStore((s) => s.organization);
  const status = useOfficeStore((s) => s.status);
  const followed = useSocialStore((s) => s.followedOrganizationIds);
  const toggleFollow = useSocialStore((s) => s.toggleFollow);

  if (status === 'loading') return <LoadingState rows={3} label="Reading the company profile" />;
  if (!organization) {
    return <EmptyState title="Nobody at reception" body="This company is no longer listed." icon={<IconGrid size={22} />} />;
  }

  const isFollowed = followed.includes(organization.id);

  return (
    <div className="g-stack" style={{ gap: 'var(--g-space-4)' }}>
      <div className="g-row" style={{ gap: 'var(--g-space-3)', alignItems: 'flex-start' }}>
        <CompanyMark name={organization.name} color={organization.logoColor} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{organization.name}</h3>
          <p className="g-muted" style={{ margin: '4px 0 0' }}>{organization.tagline}</p>
          <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 'var(--g-space-2)' }}>
            {organization.verified ? <Badge tone="success" dot>Verified</Badge> : null}
            <Badge>{organization.industry}</Badge>
            <Badge>{organization.size} people</Badge>
            <Badge>{organization.location}</Badge>
            <Badge>{formatNumber(organization.followerCount)} followers</Badge>
          </div>
        </div>
        <Button
          size="sm"
          variant={isFollowed ? 'ghost' : 'primary'}
          onClick={() => toggleFollow(organization.id)}
        >
          {isFollowed ? 'Following' : 'Follow'}
        </Button>
      </div>

      {organization.description ? (
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{organization.description}</p>
      ) : null}

      {organization.website ? (
        <a className="g-muted" href={organization.website} target="_blank" rel="noreferrer noopener">
          {organization.website}
        </a>
      ) : null}
    </div>
  );
}
