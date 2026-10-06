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
import * as companyService from '../../services/companyService.js';

/**
 * Employer profiles for a district, or the whole city when no district is given.
 * "Walk into a corporate building → view company → view available jobs."
 */
export function CompanyList({ districtId, onViewJobs }) {
  const query = useAsync(() => companyService.listCompanies({ districtId }), [districtId]);

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
      {(companies) => (
        <ul className="g-stack">
          {companies.map((company) => (
            <li key={company.id}>
              <Panel pad="sm" className="company-card">
                <div className="company-card__head">
                  <CompanyMark name={company.name} color={company.logoColor} size="lg" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="company-card__name g-truncate">{company.name}</h3>
                    <p className="company-card__tagline g-truncate">{company.tagline}</p>
                  </div>
                </div>

                <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.65 }}>
                  {company.description}
                </p>

                <div className="g-row-between" style={{ flexWrap: 'wrap' }}>
                  <div className="g-row" style={{ flexWrap: 'wrap' }}>
                    <Badge>{company.industry}</Badge>
                    <Badge>{company.size} people</Badge>
                    <Badge>{company.location}</Badge>
                  </div>
                  {onViewJobs ? (
                    <Button size="sm" variant="ghost" onClick={() => onViewJobs(company)}>
                      {company.openRoles} open roles
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
