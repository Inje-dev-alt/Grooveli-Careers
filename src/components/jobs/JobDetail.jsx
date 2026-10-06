import { useState } from 'react';
import './jobs.css';
import {
  Badge,
  MatchBadge,
  Button,
  CompanyMark,
  ConfirmDialog,
  StatTile,
  StatGrid,
  AsyncBoundary,
  InlineLoading,
  IconBookmark,
  IconCheck,
  IconAlert,
} from '../ui/index.js';
import { companyColor } from './JobCard.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useJobStore } from '../../stores/jobStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as companyService from '../../services/companyService.js';
import { recordApplication } from '../../stores/progression.js';
import { isSuitableApplication, SUITABLE_MATCH_THRESHOLD } from '../../utils/careerEvents.js';
import { formatSalaryRange, formatRelativeTime, titleCase } from '../../utils/format.js';

/**
 * Full job detail with the apply flow.
 *
 * The match explanation is deliberately prominent: the product's position is
 * that a focused application beats a scattered one, so the interface says in
 * advance whether an application will count as career progress.
 *
 * @param {{ job: import('../../models/index.js').Job, onBack?: () => void }} props
 */
export function JobDetail({ job, onBack }) {
  const [confirming, setConfirming] = useState(false);
  const savedJobIds = useJobStore((s) => s.savedJobIds);
  const applications = useJobStore((s) => s.applications);
  const applyingJobId = useJobStore((s) => s.applyingJobId);
  const toggleSaved = useJobStore((s) => s.toggleSaved);
  const apply = useJobStore((s) => s.apply);
  const pushToast = useUiStore((s) => s.pushToast);

  const companyQuery = useAsync(() => companyService.getCompany(job.companyId), [job.companyId]);

  const saved = savedJobIds.includes(job.id);
  const applied = applications.some((a) => a.jobId === job.id);
  const suitable = isSuitableApplication(job);

  const handleApply = async () => {
    try {
      await apply(job.id);
      recordApplication(job);
      setConfirming(false);
      if (!suitable) {
        pushToast({
          title: 'Application submitted',
          body: `Below ${SUITABLE_MATCH_THRESHOLD}% match, so it does not count toward career progress.`,
          tone: 'warning',
        });
      }
    } catch (error) {
      setConfirming(false);
      pushToast({ title: 'Could not apply', body: error.message, tone: 'danger' });
    }
  };

  return (
    <div className="job-detail">
      <div className="job-detail__head">
        <CompanyMark name={job.companyName} color={companyColor(job)} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--g-text-lg)' }}>{job.title}</h2>
          <p className="g-muted">
            {job.companyName} · {job.location}
          </p>
          <div className="g-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <MatchBadge score={job.matchScore} />
            <Badge>{titleCase(job.employmentType)}</Badge>
            <Badge>{titleCase(job.workMode)}</Badge>
            <Badge>{titleCase(job.seniority)}</Badge>
          </div>
        </div>
      </div>

      <StatGrid>
        <StatTile label="Salary" value={formatSalaryRange(job.salary)} />
        <StatTile label="Posted" value={formatRelativeTime(job.postedAt)} />
        <StatTile label="Work mode" value={titleCase(job.workMode)} />
      </StatGrid>

      <div className="job-detail__match">
        <div className="g-row-between">
          <strong style={{ fontFamily: 'var(--g-font-display)' }}>Why this matched you</strong>
          <MatchBadge score={job.matchScore} />
        </div>

        {job.matchReasons.length > 0 ? (
          <ul className="g-stack" style={{ gap: 8 }}>
            {job.matchReasons.map((reason) => (
              <li key={reason} className="job-detail__reason">
                <IconCheck size={15} style={{ color: 'var(--g-success)', flex: 'none', marginTop: 2 }} />
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
            Nothing in your profile lines up with this role yet.
          </p>
        )}

        {job.skillGaps.length > 0 ? (
          <div className="g-stack" style={{ gap: 8 }}>
            <span className="g-eyebrow">Gaps</span>
            {job.skillGaps.map((gap) => (
              <span key={gap} className="job-detail__gap">
                <IconAlert size={15} style={{ flex: 'none' }} />
                {gap} is required and is not on your profile
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <section className="job-detail__section">
        <h3 className="g-eyebrow">About the role</h3>
        <p className="g-muted" style={{ lineHeight: 1.7 }}>
          {job.summary}
        </p>
      </section>

      <section className="job-detail__section">
        <h3 className="g-eyebrow">What you will do</h3>
        <ul className="job-detail__list">
          {job.responsibilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="job-detail__section">
        <h3 className="g-eyebrow">What they are asking for</h3>
        <ul className="job-detail__list">
          {job.requirements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="job-detail__section">
        <h3 className="g-eyebrow">Skills</h3>
        <div className="job-card__skills">
          {job.skills.map((skill) => (
            <span key={skill} className="job-card__skill">
              {skill}
            </span>
          ))}
        </div>
      </section>

      <section className="job-detail__section">
        <h3 className="g-eyebrow">About {job.companyName}</h3>
        <AsyncBoundary query={companyQuery} loading={<InlineLoading label="Loading company" />}>
          {(company) =>
            company ? (
              <div className="g-stack" style={{ gap: 8 }}>
                <p className="g-muted" style={{ lineHeight: 1.7 }}>
                  {company.description}
                </p>
                <div className="g-row" style={{ flexWrap: 'wrap' }}>
                  <Badge>{company.industry}</Badge>
                  <Badge>{company.size} people</Badge>
                  <Badge>{company.openRoles} open roles</Badge>
                </div>
              </div>
            ) : (
              <p className="g-dim">Company profile is not available.</p>
            )
          }
        </AsyncBoundary>
      </section>

      {!suitable && !applied ? (
        <p className="job-detail__note">
          This role sits below your {SUITABLE_MATCH_THRESHOLD}% match threshold. You can still apply, but it
          will not earn XP — Grooveli counts focused applications, not volume.
        </p>
      ) : null}

      <div className="g-row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          size="lg"
          disabled={applied}
          onClick={() => setConfirming(true)}
          icon={applied ? <IconCheck size={16} /> : null}
        >
          {applied ? 'Application submitted' : 'Apply for this role'}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => toggleSaved(job.id)}
          icon={<IconBookmark size={16} filled={saved} />}
        >
          {saved ? 'Saved' : 'Save'}
        </Button>
        {onBack ? (
          <Button variant="subtle" size="lg" onClick={onBack}>
            Back to list
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <ConfirmDialog
          title={`Apply to ${job.title}?`}
          body={
            suitable
              ? `Your application goes to ${job.companyName}. At ${job.matchScore}% match this counts as career progress and earns XP.`
              : `Your application goes to ${job.companyName}. At ${job.matchScore}% match it is below your threshold and will not earn XP.`
          }
          confirmLabel="Submit application"
          loading={applyingJobId === job.id}
          onConfirm={handleApply}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
