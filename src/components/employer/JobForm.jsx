import { useState } from 'react';
import './employer.css';
import { Button, Field, TextInput, TextArea, Select, Chip } from '../ui/index.js';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  WORK_TYPE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  CURRENCY_OPTIONS,
} from '../../utils/organizationOptions.js';

const EMPTY = {
  title: '',
  description: '',
  salaryMin: '',
  salaryMax: '',
  currency: 'NGN',
  salaryPeriod: 'month',
  location: '',
  workType: 'onsite',
  employmentType: 'full-time',
  experienceLevel: 'mid',
  requiredSkills: [],
  preferredSkills: [],
  deadline: '',
};

/**
 * Create a job.
 *
 * The fields are the normalised Job shape, so what an employer publishes here
 * is the same object the candidate marketplace consumes — no translation layer,
 * and no second definition of what a job is.
 */
export function JobForm({ onPublish, publishing, onCancel }) {
  const [draft, setDraft] = useState(EMPTY);
  const [skillDraft, setSkillDraft] = useState('');
  const [preferredDraft, setPreferredDraft] = useState('');
  const [error, setError] = useState(null);

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const addSkill = (field, value, clear) => {
    const skill = value.trim();
    if (!skill || draft[field].includes(skill)) return;
    update({ [field]: [...draft[field], skill] });
    clear('');
  };

  const removeSkill = (field, skill) =>
    update({ [field]: draft[field].filter((s) => s !== skill) });

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!draft.title.trim() || !draft.description.trim() || !draft.location.trim()) {
      setError('A title, description and location are the minimum a candidate needs.');
      return;
    }
    if (Number(draft.salaryMin) > Number(draft.salaryMax)) {
      setError('The salary minimum cannot be above the maximum.');
      return;
    }
    if (draft.requiredSkills.length === 0) {
      setError('Add at least one required skill — matching depends on it.');
      return;
    }

    try {
      await onPublish({
        ...draft,
        deadline: draft.deadline ? new Date(draft.deadline).toISOString() : undefined,
      });
      setDraft(EMPTY);
    } catch (caught) {
      setError(caught.message || 'Could not publish the role.');
    }
  };

  return (
    <form className="job-form" onSubmit={submit}>
      <Field label="Job title" htmlFor="job-title">
        <TextInput id="job-title" value={draft.title} placeholder="Backend Engineer" onChange={(e) => update({ title: e.target.value })} />
      </Field>

      <Field label="Description" htmlFor="job-description" hint="What the role actually involves. Candidates read this before anything else.">
        <TextArea
          id="job-description"
          value={draft.description}
          placeholder="Own settlement services that move money between merchants and banks."
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>

      <div className="job-form__row job-form__row--three">
        <Field label="Salary from" htmlFor="smin">
          <TextInput id="smin" type="number" value={draft.salaryMin} placeholder="500000" onChange={(e) => update({ salaryMin: e.target.value })} />
        </Field>
        <Field label="Salary to" htmlFor="smax">
          <TextInput id="smax" type="number" value={draft.salaryMax} placeholder="800000" onChange={(e) => update({ salaryMax: e.target.value })} />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" value={draft.currency} onChange={(e) => update({ currency: e.target.value })}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="job-form__row">
        <Field label="Location" htmlFor="job-location">
          <TextInput id="job-location" value={draft.location} placeholder="Lagos / Remote" onChange={(e) => update({ location: e.target.value })} />
        </Field>
        <Field label="Salary period" htmlFor="period">
          <Select id="period" value={draft.salaryPeriod} onChange={(e) => update({ salaryPeriod: e.target.value })}>
            <option value="month">Per month</option>
            <option value="year">Per year</option>
          </Select>
        </Field>
      </div>

      <Field label="Work type">
        <div className="job-form__chips">
          {WORK_TYPE_OPTIONS.map((option) => (
            <Chip key={option.id} active={draft.workType === option.id} onClick={() => update({ workType: option.id })}>
              {option.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Employment type">
        <div className="job-form__chips">
          {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
            <Chip key={option.id} active={draft.employmentType === option.id} onClick={() => update({ employmentType: option.id })}>
              {option.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Experience level">
        <div className="job-form__chips">
          {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
            <Chip key={option.id} active={draft.experienceLevel === option.id} onClick={() => update({ experienceLevel: option.id })}>
              {option.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Required skills" hint="Matching runs on these. Type and press Enter.">
        <div className="skill-input">
          <TextInput
            value={skillDraft}
            placeholder="Node.js"
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSkill('requiredSkills', skillDraft, setSkillDraft);
              }
            }}
          />
          <Button variant="ghost" onClick={() => addSkill('requiredSkills', skillDraft, setSkillDraft)}>
            Add
          </Button>
        </div>
      </Field>
      {draft.requiredSkills.length > 0 ? (
        <div className="job-form__chips">
          {draft.requiredSkills.map((skill) => (
            <Chip key={skill} active onClick={() => removeSkill('requiredSkills', skill)}>
              {skill} ✕
            </Chip>
          ))}
        </div>
      ) : null}

      <Field label="Preferred skills" hint="Nice to have, not required.">
        <div className="skill-input">
          <TextInput
            value={preferredDraft}
            placeholder="Kubernetes"
            onChange={(e) => setPreferredDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSkill('preferredSkills', preferredDraft, setPreferredDraft);
              }
            }}
          />
          <Button variant="ghost" onClick={() => addSkill('preferredSkills', preferredDraft, setPreferredDraft)}>
            Add
          </Button>
        </div>
      </Field>
      {draft.preferredSkills.length > 0 ? (
        <div className="job-form__chips">
          {draft.preferredSkills.map((skill) => (
            <Chip key={skill} active onClick={() => removeSkill('preferredSkills', skill)}>
              {skill} ✕
            </Chip>
          ))}
        </div>
      ) : null}

      <Field label="Application deadline" htmlFor="deadline" hint="Optional.">
        <TextInput id="deadline" type="date" value={draft.deadline} onChange={(e) => update({ deadline: e.target.value })} />
      </Field>

      {error ? (
        <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>{error}</p>
      ) : null}

      <div className="g-row" style={{ justifyContent: 'flex-end', gap: 'var(--g-space-3)' }}>
        {onCancel ? (
          <Button variant="subtle" onClick={onCancel} disabled={publishing}>Cancel</Button>
        ) : null}
        <Button type="submit" variant="primary" loading={publishing}>Publish job</Button>
      </div>
    </form>
  );
}
