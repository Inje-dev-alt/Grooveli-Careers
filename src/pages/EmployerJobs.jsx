import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { EmployerShell, EmployerPage } from '../components/employer/EmployerShell.jsx';
import { JobForm } from '../components/employer/JobForm.jsx';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  Select,
  Modal,
  LoadingState,
  ErrorState,
  EmptyState,
  IconBriefcase,
} from '../components/ui/index.js';
import { useEmployerStore } from '../stores/employerStore.js';
import { useUiStore } from '../stores/uiStore.js';
import { formatSalaryRange, formatRelativeTime, titleCase } from '../utils/format.js';

const STATUS_TONE = { published: 'success', draft: 'default', paused: 'warning', closed: 'danger' };

/** Jobs this organization has published, and the form that creates more. */
export default function EmployerJobs() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const status = useEmployerStore((s) => s.status);
  const error = useEmployerStore((s) => s.error);
  const jobs = useEmployerStore((s) => s.jobs);
  const publishing = useEmployerStore((s) => s.publishing);
  const load = useEmployerStore((s) => s.load);
  const publishJob = useEmployerStore((s) => s.publishJob);
  const setJobStatus = useEmployerStore((s) => s.setJobStatus);
  const pushToast = useUiStore((s) => s.pushToast);

  const [published, setPublished] = useState(null);
  const creating = params.get('new') === '1';

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const openForm = () => setParams({ new: '1' });
  const closeForm = () => setParams({});

  const handlePublish = async (draft) => {
    const job = await publishJob(draft);
    closeForm();
    setPublished(job);
    pushToast({
      title: 'Job published',
      body: `${job.title} is live in the Grooveli marketplace.`,
      tone: 'success',
    });
    return job;
  };

  return (
    <EmployerShell>
      <EmployerPage
        title="Jobs"
        lede="Every role you publish enters the same marketplace candidates browse — from the city, the job board, or the AI's recommendations."
        action={<Button variant="primary" onClick={openForm}>Create job</Button>}
      >
        {status === 'loading' ? <LoadingState rows={3} label="Loading your jobs" /> : null}
        {status === 'error' ? <ErrorState error={{ message: error }} onRetry={load} /> : null}

        {status === 'ready' ? (
          <Panel>
            <PanelHeader title={`${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'}`} />
            {jobs.length === 0 ? (
              <EmptyState
                title="No roles published yet"
                body="Publish your first role and it becomes discoverable to every candidate in Grooveli City."
                icon={<IconBriefcase size={22} />}
                action={<Button variant="primary" onClick={openForm}>Create job</Button>}
              />
            ) : (
              <ul className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
                {jobs.map((job) => (
                  <li key={job.id} className="employer-job">
                    <div className="employer-job__main">
                      <p className="employer-job__title">{job.title}</p>
                      <p className="employer-job__meta">
                        {job.location} · {titleCase(job.workType)} · {formatSalaryRange(job)} ·{' '}
                        {formatRelativeTime(job.createdAt)}
                      </p>
                    </div>
                    <Badge>{titleCase(job.employmentType)}</Badge>
                    <Badge tone={STATUS_TONE[job.status]}>{titleCase(job.status)}</Badge>
                    <Select
                      value={job.status}
                      aria-label={`Status for ${job.title}`}
                      onChange={(event) => setJobStatus(job.id, event.target.value)}
                      style={{ width: 'auto', minWidth: 128 }}
                    >
                      <option value="published">Published</option>
                      <option value="paused">Paused</option>
                      <option value="closed">Closed</option>
                      <option value="draft">Draft</option>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}
      </EmployerPage>

      {creating ? (
        <Modal
          eyebrow="New role"
          title="Create a job"
          subtitle="These fields are exactly what a candidate sees, and what matching runs on."
          size="lg"
          onClose={publishing ? undefined : closeForm}
        >
          <JobForm onPublish={handlePublish} publishing={publishing} onCancel={closeForm} />
        </Modal>
      ) : null}

      {published ? (
        <Modal
          eyebrow="Published"
          title="Job published"
          size="sm"
          onClose={() => setPublished(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPublished(null)}>Stay here</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setPublished(null);
                  navigate('/employer/candidates');
                }}
              >
                Find candidates
              </Button>
            </>
          }
        >
          <p className="g-muted">
            <strong style={{ color: 'var(--g-text)' }}>{published.title}</strong> is live. It now appears in
            the candidate marketplace and in the {published.districtId.replace(/-/g, ' ')} district of
            Grooveli City.
          </p>
        </Modal>
      ) : null}
    </EmployerShell>
  );
}
