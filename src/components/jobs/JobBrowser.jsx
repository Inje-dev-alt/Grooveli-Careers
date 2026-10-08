import { useEffect, useState } from 'react';
import './jobs.css';
import { JobCard } from './JobCard.jsx';
import { JobFilters } from './JobFilters.jsx';
import { AsyncBoundary, EmptyState, LoadingState, Button, IconBriefcase } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useJobStore } from '../../stores/jobStore.js';
import * as jobService from '../../services/jobService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';

/**
 * The job marketplace, as one component.
 *
 * It is mounted both on the Jobs route and inside a district panel in the city.
 * The PRD requires the marketplace to be reachable independently of the game,
 * and this is how: one implementation, two mount points, no duplication.
 *
 * @param {{ districtId?: string, wide?: boolean, onOpenJob: (job) => void, compactFilters?: boolean }} props
 */
export function JobBrowser({ districtId, wide = false, onOpenJob, compactFilters = false }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useJobStore((s) => s.query);
  const savedJobIds = useJobStore((s) => s.savedJobIds);
  const applications = useJobStore((s) => s.applications);
  const toggleSaved = useJobStore((s) => s.toggleSaved);
  const loadSavedJobs = useJobStore((s) => s.loadSavedJobs);
  const loadApplications = useJobStore((s) => s.loadApplications);
  const resetQuery = useJobStore((s) => s.resetQuery);

  // A district panel is scoped to its own district; the standalone marketplace
  // is not. Everything else about the query is shared.
  const effectiveQuery = districtId ? { ...query, districtId } : query;

  const jobsQuery = useAsync(
    () => jobService.listJobs(effectiveQuery),
    [JSON.stringify(effectiveQuery)],
  );

  useEffect(() => {
    loadSavedJobs();
    loadApplications();
  }, [loadSavedJobs, loadApplications]);

  const handleOpen = (job) => {
    recordCareerEvent(CAREER_EVENTS.JOB_VIEWED, { silent: true });
    onOpenJob(job);
  };

  return (
    <div className="job-browser">
      <JobFilters
        showDistrict={!districtId && !compactFilters}
        expanded={filtersOpen}
        onToggleExpanded={() => setFiltersOpen((open) => !open)}
        resultCount={jobsQuery.data?.length}
      />

      <AsyncBoundary
        query={jobsQuery}
        loading={<LoadingState rows={3} label="Loading roles" />}
        errorTitle="Could not load jobs"
        empty={
          <EmptyState
            title="No roles match that"
            body="Try widening the salary range or clearing a filter. New roles are posted across the city every day."
            icon={<IconBriefcase size={22} />}
            action={
              <Button variant="ghost" size="sm" onClick={resetQuery}>
                Clear filters
              </Button>
            }
          />
        }
      >
        {(jobs) => (
          <ul className={`job-browser__list${wide ? ' job-browser__list--wide' : ''}`}>
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard
                  job={job}
                  saved={savedJobIds.includes(job.id)}
                  applied={applications.some((a) => a.jobId === job.id)}
                  onOpen={handleOpen}
                  onToggleSave={(target) => toggleSaved(target.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}
