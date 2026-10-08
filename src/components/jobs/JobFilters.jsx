import './jobs.css';
import { Chip, Field, Select, SearchInput, Button, TextInput } from '../ui/index.js';
import { useJobStore } from '../../stores/jobStore.js';
import { useAsync } from '../../hooks/useAsync.js';
import * as jobService from '../../services/jobService.js';
import { cityLocations } from '../../game/world/locations.js';
import { formatCompactMoney } from '../../utils/format.js';

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'freelance'];
const WORK_TYPES = ['onsite', 'hybrid', 'remote'];
const EXPERIENCE_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead'];

const LABELS = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
  entry: 'Entry',
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
};

const districtOptions = cityLocations.filter((l) => l.interactions.includes('jobs'));

/**
 * Search, sort and facets. All of it writes into `jobStore.query`, which the
 * service consumes as query parameters — so the same filters will work
 * unchanged against the real `GET /jobs`.
 */
export function JobFilters({ showDistrict = true, expanded, onToggleExpanded, resultCount }) {
  const query = useJobStore((s) => s.query);
  const setQuery = useJobStore((s) => s.setQuery);
  const toggleFacet = useJobStore((s) => s.toggleFacet);
  const resetQuery = useJobStore((s) => s.resetQuery);
  const hasActiveFilters = useJobStore((s) => s.hasActiveFilters());

  // Industries and skills come from the live listings rather than a hardcoded
  // list, so employer-created roles appear in the filters automatically.
  const facets = useAsync(() => jobService.getJobFacets(), []);

  return (
    <div className="job-browser__controls">
      <div className="job-browser__row">
        <SearchInput
          value={query.search}
          onChange={(search) => setQuery({ search })}
          placeholder="Search roles, companies or skills"
          aria-label="Search jobs"
        />
        <Select
          value={query.sort}
          onChange={(event) => setQuery({ sort: event.target.value })}
          aria-label="Sort jobs"
          style={{ width: 'auto', minWidth: 150 }}
        >
          <option value="match">Best match</option>
          <option value="recent">Most recent</option>
          <option value="salary">Highest salary</option>
        </Select>
        <Button variant={expanded ? 'primary' : 'ghost'} onClick={onToggleExpanded} aria-expanded={expanded}>
          Filters{hasActiveFilters ? ' •' : ''}
        </Button>
      </div>

      {expanded ? (
        <div className="job-browser__facets">
          {showDistrict ? (
            <Field label="District">
              <Select
                value={query.districtId}
                onChange={(event) => setQuery({ districtId: event.target.value })}
              >
                <option value="">Every district</option>
                {districtOptions.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Location" htmlFor="filter-location">
            <TextInput
              id="filter-location"
              value={query.location}
              placeholder="Lagos, Abuja, Remote…"
              onChange={(event) => setQuery({ location: event.target.value })}
            />
          </Field>

          <Field label="Industry">
            <Select value={query.industry} onChange={(event) => setQuery({ industry: event.target.value })}>
              <option value="">Every industry</option>
              {(facets.data?.industries ?? []).map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </Select>
          </Field>

          <div className="job-browser__facet">
            <span className="g-field__label">Employment type</span>
            <div className="job-browser__chips">
              {EMPLOYMENT_TYPES.map((type) => (
                <Chip
                  key={type}
                  active={query.employmentTypes.includes(type)}
                  onClick={() => toggleFacet('employmentTypes', type)}
                >
                  {LABELS[type]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="job-browser__facet">
            <span className="g-field__label">Work type</span>
            <div className="job-browser__chips">
              {WORK_TYPES.map((mode) => (
                <Chip
                  key={mode}
                  active={query.workTypes.includes(mode)}
                  onClick={() => toggleFacet('workTypes', mode)}
                >
                  {LABELS[mode]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="job-browser__facet">
            <span className="g-field__label">Experience level</span>
            <div className="job-browser__chips">
              {EXPERIENCE_LEVELS.map((level) => (
                <Chip
                  key={level}
                  active={query.experienceLevels.includes(level)}
                  onClick={() => toggleFacet('experienceLevels', level)}
                >
                  {LABELS[level]}
                </Chip>
              ))}
            </div>
          </div>

          {(facets.data?.skills ?? []).length > 0 ? (
            <div className="job-browser__facet">
              <span className="g-field__label">Skills</span>
              <div className="job-browser__chips">
                {facets.data.skills.slice(0, 14).map((skill) => (
                  <Chip
                    key={skill}
                    active={query.skills.includes(skill)}
                    onClick={() => toggleFacet('skills', skill)}
                  >
                    {skill}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <Field label={`Minimum salary — ${formatCompactMoney(query.minSalary)}`}>
            <input
              className="g-range"
              type="range"
              min={0}
              max={1_200_000}
              step={50_000}
              value={query.minSalary}
              onChange={(event) => setQuery({ minSalary: Number(event.target.value) })}
            />
          </Field>

          <Field
            label={`Minimum match — ${query.minMatch}%`}
            hint="Applications below 60% do not count toward career progress."
          >
            <input
              className="g-range"
              type="range"
              min={0}
              max={95}
              step={5}
              value={query.minMatch}
              onChange={(event) => setQuery({ minMatch: Number(event.target.value) })}
            />
          </Field>

          <div className="job-browser__summary">
            <span>{resultCount == null ? '' : `${resultCount} matching roles`}</span>
            <Button variant="subtle" size="sm" onClick={resetQuery} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
