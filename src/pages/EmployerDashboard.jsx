import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmployerShell, EmployerPage } from '../components/employer/EmployerShell.jsx';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  StatTile,
  StatGrid,
  CompanyMark,
  LoadingState,
  ErrorState,
  EmptyState,
  IconBriefcase,
  IconGrid,
  IconUser,
  IconTarget,
} from '../components/ui/index.js';
import { useEmployerStore } from '../stores/employerStore.js';
import { statusLabel, statusTone } from '../utils/applicationStatus.js';
import { formatRelativeTime } from '../utils/format.js';

/**
 * The employer dashboard.
 *
 * Answers two questions on open: what is the state of hiring, and what can I do
 * about it. Everything else is one click away.
 */
export default function EmployerDashboard() {
  const navigate = useNavigate();
  const status = useEmployerStore((s) => s.status);
  const error = useEmployerStore((s) => s.error);
  const organization = useEmployerStore((s) => s.organization);
  const overview = useEmployerStore((s) => s.overview);
  const applications = useEmployerStore((s) => s.applications);
  const load = useEmployerStore((s) => s.load);

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const quickActions = [
    { label: 'Create job', icon: IconBriefcase, to: '/employer/jobs?new=1' },
    { label: 'View jobs', icon: IconGrid, to: '/employer/jobs' },
    { label: 'View candidates', icon: IconUser, to: '/employer/candidates' },
    { label: 'Company profile', icon: IconTarget, to: '/employer/company' },
  ];

  return (
    <EmployerShell>
      <EmployerPage
        title={`Welcome back${organization ? `, ${organization.name}` : ''}`}
        lede="Your hiring at a glance. Roles you publish here appear in the same marketplace candidates browse from inside Grooveli City."
        action={
          <Button variant="primary" onClick={() => navigate('/employer/jobs?new=1')}>
            Create job
          </Button>
        }
      >
        {status === 'loading' ? <LoadingState rows={3} label="Loading your employer space" /> : null}
        {status === 'error' ? <ErrorState error={{ message: error }} onRetry={load} title="Could not load your space" /> : null}

        {status === 'ready' && !organization ? (
          <EmptyState
            title="No company on this account"
            body="Employer onboarding creates your company profile. It only takes a minute."
            icon={<IconGrid size={22} />}
            action={<Button variant="primary" onClick={() => navigate('/onboarding/employer')}>Set up company</Button>}
          />
        ) : null}

        {status === 'ready' && organization ? (
          <div className="g-stack" style={{ gap: 'var(--g-space-5)' }}>
            <div className="employer__overview">
              <Panel className="employer__company-card">
                <span className="g-eyebrow">Company overview</span>
                <div className="employer__company-head">
                  <CompanyMark name={organization.name} color={organization.logoColor} size="lg" />
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 'var(--g-text-md)' }}>{organization.name}</h2>
                    <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
                      {organization.tagline || organization.industry}
                    </p>
                  </div>
                </div>
                <div className="g-row" style={{ flexWrap: 'wrap' }}>
                  <Badge>{organization.industry}</Badge>
                  <Badge>{organization.location}</Badge>
                  <Badge>{organization.size} people</Badge>
                  {organization.verified ? <Badge tone="accent" dot>Verified</Badge> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/employer/company')}>
                  Edit company profile
                </Button>
              </Panel>

              <Panel>
                <PanelHeader title="Recruitment overview" subtitle="Across every role on this account." />
                <StatGrid>
                  <StatTile label="Open jobs" value={overview?.openJobs ?? 0} accent="var(--g-accent)" />
                  <StatTile label="Applications" value={overview?.applications ?? 0} />
                  <StatTile label="Shortlisted" value={overview?.shortlisted ?? 0} />
                  <StatTile label="Interviews" value={overview?.interviews ?? 0} />
                </StatGrid>

                <div className="employer__quick" style={{ marginTop: 'var(--g-space-4)' }}>
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className="employer__quick-btn"
                        onClick={() => navigate(action.to)}
                      >
                        <span className="employer__quick-icon">
                          <Icon size={17} />
                        </span>
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            </div>

            <Panel>
              <PanelHeader
                title="Recent applications"
                subtitle="Candidates who applied to your roles."
                action={
                  <Button size="sm" variant="subtle" onClick={() => navigate('/employer/candidates')}>
                    All candidates
                  </Button>
                }
              />
              {applications.length === 0 ? (
                <EmptyState
                  title="No applications yet"
                  body="Publish a role and applications will appear here as candidates apply."
                  icon={<IconBriefcase size={22} />}
                />
              ) : (
                <ul className="pipeline">
                  {applications.slice(0, 6).map((application) => (
                    <li key={application.id} className="pipeline__row">
                      <CompanyMark
                        name={application.candidate?.name ?? 'Candidate'}
                        color={application.candidate?.color ?? '#6c8cff'}
                      />
                      <div className="pipeline__who">
                        <p className="pipeline__name">{application.candidate?.name ?? 'Candidate'}</p>
                        <p className="pipeline__meta">
                          {application.jobTitle} · {formatRelativeTime(application.updatedAt)}
                        </p>
                      </div>
                      {application.candidate ? (
                        <Badge>Level {application.candidate.careerLevel}</Badge>
                      ) : null}
                      <Badge tone={statusTone(application.status)}>{statusLabel(application.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}
      </EmployerPage>
    </EmployerShell>
  );
}
