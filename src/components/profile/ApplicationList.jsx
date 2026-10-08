import './profile.css';
import { Badge, AsyncBoundary, LoadingState, EmptyState, CompanyMark, IconBriefcase } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import * as applicationService from '../../services/applicationService.js';
import { formatRelativeTime } from '../../utils/format.js';
import { statusLabel, statusTone } from '../../utils/applicationStatus.js';

/** Application history. Reads from the service so it stays correct after an apply. */
export function ApplicationList({ limit }) {
  const query = useAsync(() => applicationService.listApplications(), []);

  return (
    <AsyncBoundary
      query={query}
      loading={<LoadingState rows={2} label="Loading applications" />}
      errorTitle="Could not load applications"
      empty={
        <EmptyState
          title="No applications yet"
          body="Applications you submit from anywhere in Grooveli City show up here with their status."
          icon={<IconBriefcase size={22} />}
        />
      }
    >
      {(applications) => (
        <ul className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
          {(limit ? applications.slice(0, limit) : applications).map((application) => (
            <li key={application.id} className="application">
              <CompanyMark name={application.companyName} color="#6c8cff" />
              <div className="application__body">
                <p className="application__title g-truncate">{application.jobTitle}</p>
                <p className="application__company g-truncate">
                  {application.companyName} · {formatRelativeTime(application.updatedAt)}
                </p>
              </div>
              <Badge tone={statusTone(application.status)}>{statusLabel(application.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}
