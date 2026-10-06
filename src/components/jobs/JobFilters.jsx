import './jobs.css';
import { Chip, Field, Select, SearchInput, Button } from '../ui/index.js';
import { useJobStore } from '../../stores/jobStore.js';
import { cityLocations } from '../../game/world/locations.js';
import { formatCompactMoney } from '../../utils/format.js';

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'freelance'];
const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const SENIORITY = ['entry', 'junior', 'mid', 'senior', 'lead'];

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
 * service layer consumes as query parameters — so the same filters will work
 * unchanged against the real `GET /jobs`.
 */
export function JobFilters({ showDistrict = true, expanded, onToggleExpanded, resultCount }) {
  const query = useJobStore((s) => s.query);
  const setQuery = useJobStore((s) => s.setQuery);
  const toggleFacet = useJobStore((s) => s.toggleFacet);
  const resetQuery = useJobStore((s) => s.resetQuery);
  const hasActiveFilters = useJobStore((s) => s.hasActiveFilters());

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
            <span className="g-field__label">Work mode</span>
            <div className="job-browser__chips">
              {WORK_MODES.map((mode) => (
                <Chip
                  key={mode}
                  active={query.workModes.includes(mode)}
                  onClick={() => toggleFacet('workModes', mode)}
                >
                  {LABELS[mode]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="job-browser__facet">
            <span className="g-field__label">Seniority</span>
            <div className="job-browser__chips">
              {SENIORITY.map((level) => (
                <Chip
                  key={level}
                  active={query.seniority.includes(level)}
                  onClick={() => toggleFacet('seniority', level)}
                >
                  {LABELS[level]}
                </Chip>
              ))}
            </div>
          </div>

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
