/**
 * HR analytics: hiring as numbers.
 *
 * Computed from the same application rows the pipeline reads — applications by
 * stage, average days in stage, the source mix of published roles, and the
 * match distribution of applicants. An empty pipeline renders honest empty
 * states, never invented figures.
 */
import './employer.css';
import {
  Panel,
  PanelHeader,
  Badge,
  StatTile,
  StatGrid,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  IconGrid,
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useEmployerStore } from '../../stores/employerStore.js';
import * as organizationService from '../../services/organizationService.js';
import { statusLabel } from '../../utils/applicationStatus.js';

const MATCH_BUCKET_LABELS = {
  '80-100': 'Strong (80–100)',
  '60-79': 'Suitable (60–79)',
  '40-59': 'Stretch (40–59)',
  '0-39': 'Weak (0–39)',
  unscored: 'Unscored',
};

export function HiringAnalytics() {
  const organization = useEmployerStore((s) => s.organization);
  const query = useAsync(
    () => (organization ? organizationService.getHiringAnalytics(organization.id) : Promise.resolve(null)),
    [organization?.id],
  );

  return (
    <Panel>
      <PanelHeader title="Hiring analytics" subtitle="Computed from your real pipeline — no sample data." />
      <AsyncBoundary
        query={query}
        loading={<LoadingState rows={2} label="Computing analytics" />}
        empty={<EmptyState title="No pipeline yet" body="Publish a role and these numbers will fill in as candidates apply." icon={<IconGrid size={22} />} />}
      >
        {(analytics) => <AnalyticsBody analytics={analytics} />}
      </AsyncBoundary>
    </Panel>
  );
}

function AnalyticsBody({ analytics }) {
  const stageEntries = Object.entries(analytics.byStage ?? {});
  const sourceEntries = Object.entries(analytics.sourceMix ?? {});
  const bucketEntries = Object.entries(analytics.matchBuckets ?? {});

  return (
    <div className="g-stack" style={{ gap: 'var(--g-space-4)' }}>
      <StatGrid>
        <StatTile label="Applications" value={analytics.applications} accent="var(--g-accent)" />
        <StatTile label="Avg days in stage" value={analytics.avgDaysInStage} />
      </StatGrid>

      <div>
        <span className="g-eyebrow">By stage</span>
        {stageEntries.length === 0 ? (
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', marginTop: 6 }}>No applications yet.</p>
        ) : (
          <div className="g-row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
            {stageEntries.map(([status, count]) => (
              <Badge key={status}>{statusLabel(status)} · {count}</Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="g-eyebrow">Role sources</span>
        {sourceEntries.length === 0 ? (
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', marginTop: 6 }}>No roles published yet.</p>
        ) : (
          <div className="g-row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
            {sourceEntries.map(([source, count]) => (
              <Badge key={source}>{source} · {count}</Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="g-eyebrow">Applicant match mix</span>
        <div className="g-row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {bucketEntries.map(([bucket, count]) => (
            <Badge key={bucket}>{MATCH_BUCKET_LABELS[bucket] ?? bucket} · {count}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
