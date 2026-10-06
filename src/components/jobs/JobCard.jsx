import './jobs.css';
import { Panel, Badge, MatchBadge, CompanyMark, IconBookmark, IconMapPin, Button } from '../ui/index.js';
import { formatSalaryRange, formatRelativeTime, titleCase } from '../../utils/format.js';

/**
 * One job, rendered the same way everywhere it appears — the marketplace, a
 * district panel, the AI's recommendations.
 *
 * @param {{
 *   job: import('../../models/index.js').Job,
 *   saved?: boolean, applied?: boolean,
 *   onOpen?: (job) => void, onToggleSave?: (job) => void,
 * }} props
 */
export function JobCard({ job, saved = false, applied = false, onOpen, onToggleSave }) {
  return (
    <Panel pad="sm" className="job-card">
      <div className="job-card__top">
        <CompanyMark name={job.companyName} color={companyColor(job)} />
        <div className="job-card__identity">
          <h3 className="job-card__title g-clamp-2">{job.title}</h3>
          <p className="job-card__company g-truncate">{job.companyName}</p>
        </div>
        {onToggleSave ? (
          <button
            type="button"
            className="job-card__save"
            aria-pressed={saved}
            aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
            onClick={() => onToggleSave(job)}
          >
            <IconBookmark size={16} filled={saved} />
          </button>
        ) : null}
      </div>

      <div className="job-card__meta">
        <span className="g-row" style={{ gap: 4 }}>
          <IconMapPin size={14} />
          {job.location}
        </span>
        <span className="job-card__dot" />
        <span>{titleCase(job.employmentType)}</span>
        <span className="job-card__dot" />
        <span className="job-card__salary">{formatSalaryRange(job.salary)}</span>
      </div>

      <div className="job-card__skills">
        {job.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="job-card__skill">
            {skill}
          </span>
        ))}
        {job.skills.length > 4 ? <span className="job-card__skill">+{job.skills.length - 4}</span> : null}
      </div>

      <div className="job-card__footer">
        <div className="g-row" style={{ gap: 8 }}>
          <MatchBadge score={job.matchScore} />
          {applied ? <Badge tone="success">Applied</Badge> : null}
          {job.featured && !applied ? <Badge tone="info">Featured</Badge> : null}
        </div>
        <div className="g-row" style={{ gap: 8 }}>
          <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
            {formatRelativeTime(job.postedAt)}
          </span>
          {onOpen ? (
            <Button size="sm" variant="ghost" onClick={() => onOpen(job)}>
              View
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

/** District colour, so a job card carries its district's signature. */
const DISTRICT_COLORS = {
  'technology-hub': '#6fe0ff',
  'finance-district': '#9fb2d8',
  'creative-district': '#d98cff',
  'healthcare-district': '#76e8a8',
  'hospitality-district': '#ff9f7a',
  'corporate-district': '#7f9cff',
  'recruitment-agency': '#5be3c8',
  'university-campus': '#ffc46b',
};

export function companyColor(job) {
  return DISTRICT_COLORS[job.districtId] ?? '#6c8cff';
}
