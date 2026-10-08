import './locations.css';
import {
  Panel,
  Badge,
  Button,
  CompanyMark,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  IconGrid,
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSocialStore } from '../../stores/socialStore.js';
import * as organizationService from '../../services/organizationService.js';
import { formatNumber } from '../../utils/format.js';

/**
 * Employer profiles for a district, or the whole city when no district is
 * given. "Walk into a corporate building → view company → view available jobs."
 *
 * Companies can be followed as well as browsed: Grooveli is a two-way
 * marketplace, not a one-way job board.
 */
export function CompanyList({ districtId, onViewJobs }) {
  const query = useAsync(() => organizationService.listOrganizations({ districtId }), [districtId]);
  const followed = useSocialStore((s) => s.followedOrganizationIds);
  const toggleFollow = useSocialStore((s) => s.toggleFollow);

  return (
    <AsyncBoundary
      query={query}
      loading={<LoadingState rows={3} label="Loading companies" />}
      errorTitle="Could not load companies"
      empty={
        <EmptyState
          title="No employers here yet"
          body="Companies are added to a district as they publish roles."
          icon={<IconGrid size={22} />}
        />
      }
    >
      {(organizations) => (
        <ul className="g-stack">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <Panel pad="sm" className="company-card">
                <div className="company-card__head">
                  <CompanyMark name={organization.name} color={organization.logoColor} size="lg" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="company-card__name g-truncate">
                      {organization.name}
                      {organization.verified ? ' ✓' : ''}
                    </h3>
                    <p className="company-card__tagline g-truncate">{organization.tagline}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={followed.includes(organization.id) ? 'ghost' : 'primary'}
                    onClick={() => toggleFollow(organization.id)}
                  >
                    {followed.includes(organization.id) ? 'Following' : 'Follow'}
                  </Button>
                </div>

                <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.65 }}>
                  {organization.description}
                </p>

                <div className="g-row-between" style={{ flexWrap: 'wrap' }}>
                  <div className="g-row" style={{ flexWrap: 'wrap' }}>
                    <Badge>{organization.industry}</Badge>
                    <Badge>{organization.size} people</Badge>
                    <Badge>{formatNumber(organization.followerCount)} followers</Badge>
                  </div>
                  {onViewJobs ? (
                    <Button size="sm" variant="ghost" onClick={() => onViewJobs(organization)}>
                      View open roles
                    </Button>
                  ) : null}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}
