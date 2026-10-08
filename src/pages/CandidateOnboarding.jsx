import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingShell, OnboardingStep } from '../components/onboarding/OnboardingShell.jsx';
import {
  Button,
  Field,
  TextInput,
  TextArea,
  Select,
  Chip,
  IconCheck,
} from '../components/ui/index.js';
import { useOnboardingStore } from '../stores/onboardingStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useCareerStore } from '../stores/careerStore.js';

const CAREER_INTERESTS = [
  'People Operations', 'Talent Acquisition', 'HR Technology', 'Software Engineering',
  'Data & Analytics', 'Product', 'Design', 'Marketing', 'Sales', 'Finance',
  'Accounting', 'Healthcare', 'Hospitality', 'Operations', 'Customer Success',
];

const SKILL_SUGGESTIONS = [
  'Recruitment', 'HR Operations', 'Excel', 'Communication', 'Stakeholder Management',
  'Data Analysis', 'SQL', 'Python', 'React', 'Node.js', 'Figma', 'Project Management',
  'Payroll', 'AI Automation', 'Sales', 'Copywriting',
];

const EMPLOYMENT_TYPES = [
  { id: 'full-time', label: 'Full-time' },
  { id: 'part-time', label: 'Part-time' },
  { id: 'contract', label: 'Contract' },
  { id: 'internship', label: 'Internship' },
  { id: 'freelance', label: 'Freelance' },
];

const WORK_TYPES = [
  { id: 'onsite', label: 'On-site' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'remote', label: 'Remote' },
];

const TOTAL_STEPS = 5;

/**
 * Candidate onboarding.
 *
 * It asks for career information rather than demographics, because everything
 * collected here feeds something real: match scores, skill gaps, the AI's
 * advice and what employers see. Progressive, so nobody faces one long form.
 */
export default function CandidateOnboarding() {
  const navigate = useNavigate();
  const step = useOnboardingStore((s) => s.step);
  const draft = useOnboardingStore((s) => s.candidate);
  const update = useOnboardingStore((s) => s.updateCandidate);
  const toggle = useOnboardingStore((s) => s.toggleCandidateValue);
  const next = useOnboardingStore((s) => s.next);
  const back = useOnboardingStore((s) => s.back);
  const setStep = useOnboardingStore((s) => s.setStep);
  const reset = useOnboardingStore((s) => s.reset);
  const seedFrom = useOnboardingStore((s) => s.seedFrom);

  const user = useAuthStore((s) => s.user);
  const complete = useAuthStore((s) => s.completeCandidateOnboarding);
  const hydrateCareer = useCareerStore((s) => s.hydrate);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [skillDraft, setSkillDraft] = useState('');

  useEffect(() => {
    seedFrom(user);
    setStep(0);
    // Onboarding is entered once per account; restarting it mid-way is the
    // user's choice, not something a remount should do.
  }, []);

  const addSkill = (skill) => {
    const value = skill.trim();
    if (!value || draft.skills.includes(value)) return;
    update({ skills: [...draft.skills, value] });
    setSkillDraft('');
  };

  const removeSkill = (skill) => update({ skills: draft.skills.filter((s) => s !== skill) });

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await complete(draft);
      await hydrateCareer();
      reset();
      setStep(TOTAL_STEPS);
    } catch (caught) {
      setError(caught.message || 'Could not save your profile. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const canContinue = () => {
    if (step === 0) return draft.name.trim() && draft.location.trim();
    if (step === 1) return draft.careerInterests.length > 0 && draft.headline.trim();
    if (step === 2) return draft.skills.length >= 3;
    if (step === 4) return draft.openTo.length > 0 && draft.workTypes.length > 0;
    return true;
  };

  if (step >= TOTAL_STEPS) {
    return (
      <OnboardingShell step={TOTAL_STEPS} total={TOTAL_STEPS}>
        <div className="onboarding__done">
          <span className="onboarding__done-mark">
            <IconCheck size={34} />
          </span>
          <div>
            <h1 className="onboarding__title">Welcome to Grooveli City</h1>
            <p className="onboarding__hint" style={{ marginTop: 8, maxWidth: '46ch' }}>
              Your career identity is live. Walk the city to discover opportunities, or go straight to the
              marketplace — both lead to the same roles.
            </p>
          </div>
          <div className="g-row" style={{ gap: 'var(--g-space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="primary" size="lg" onClick={() => navigate('/city', { replace: true })}>
              Enter Grooveli City
            </Button>
            <Button variant="ghost" size="lg" onClick={() => navigate('/jobs', { replace: true })}>
              Browse jobs instead
            </Button>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={step} total={TOTAL_STEPS}>
      {step === 0 ? (
        <OnboardingStep
          eyebrow="About you"
          title="Let's start with the basics"
          hint="This is what employers see first."
        >
          <Field label="Full name" htmlFor="name">
            <TextInput id="name" value={draft.name} placeholder="Your name" onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <div className="onboarding__row">
            <Field label="Location" htmlFor="location">
              <TextInput id="location" value={draft.location} placeholder="Lagos, Nigeria" onChange={(e) => update({ location: e.target.value })} />
            </Field>
            <Field label="Years of experience" htmlFor="years">
              <TextInput id="years" type="number" min="0" max="50" value={draft.yearsExperience} placeholder="3" onChange={(e) => update({ yearsExperience: e.target.value })} />
            </Field>
          </div>
        </OnboardingStep>
      ) : null}

      {step === 1 ? (
        <OnboardingStep
          eyebrow="Career direction"
          title="What kind of work are you after?"
          hint="Your match scores are calculated from this, so be honest rather than broad."
        >
          <Field label="Career interests" hint="Pick up to four.">
            <div className="onboarding__chips">
              {CAREER_INTERESTS.map((interest) => (
                <Chip
                  key={interest}
                  active={draft.careerInterests.includes(interest)}
                  onClick={() => toggle('careerInterests', interest)}
                >
                  {interest}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Headline" htmlFor="headline" hint="One line. What you do, and where you are heading.">
            <TextInput
              id="headline"
              value={draft.headline}
              placeholder="People Operations Specialist moving into HR technology"
              onChange={(e) => update({ headline: e.target.value })}
            />
          </Field>
          <Field label="Career goal" htmlFor="goal" hint="Optional, but the AI uses it to prioritise what to suggest.">
            <TextArea
              id="goal"
              value={draft.careerGoal}
              placeholder="Move into a role where process ownership and automation sit together."
              onChange={(e) => update({ careerGoal: e.target.value })}
            />
          </Field>
        </OnboardingStep>
      ) : null}

      {step === 2 ? (
        <OnboardingStep
          eyebrow="Skills"
          title="What can you already do?"
          hint="Add at least three. You can verify them later through skill missions — verified skills carry far more weight."
        >
          <Field label="Your skills">
            <div className="skill-input">
              <TextInput
                value={skillDraft}
                placeholder="Type a skill and press Enter"
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill(skillDraft);
                  }
                }}
              />
              <Button variant="ghost" onClick={() => addSkill(skillDraft)}>Add</Button>
            </div>
          </Field>

          {draft.skills.length > 0 ? (
            <div className="onboarding__chips">
              {draft.skills.map((skill) => (
                <Chip key={skill} active onClick={() => removeSkill(skill)}>
                  {skill} ✕
                </Chip>
              ))}
            </div>
          ) : null}

          <Field label="Common skills" hint="Tap to add.">
            <div className="onboarding__chips">
              {SKILL_SUGGESTIONS.filter((s) => !draft.skills.includes(s)).slice(0, 12).map((skill) => (
                <Chip key={skill} onClick={() => addSkill(skill)}>
                  {skill}
                </Chip>
              ))}
            </div>
          </Field>
        </OnboardingStep>
      ) : null}

      {step === 3 ? (
        <OnboardingStep eyebrow="Background" title="Experience and education" hint="Both are optional now and can be added later.">
          <Field label="Most recent role" htmlFor="summary">
            <TextArea
              id="summary"
              value={draft.summary}
              placeholder="Five years across recruitment and HR operations for mid-sized employers."
              onChange={(e) => update({ summary: e.target.value })}
            />
          </Field>
          <Field label="Highest qualification" htmlFor="education">
            <TextInput id="education" value={draft.education} placeholder="BSc Industrial Relations" onChange={(e) => update({ education: e.target.value })} />
          </Field>
          <div className="onboarding__row">
            <Field label="Institution" htmlFor="institution">
              <TextInput id="institution" value={draft.institution} placeholder="University of Lagos" onChange={(e) => update({ institution: e.target.value })} />
            </Field>
            <Field label="Year" htmlFor="year">
              <TextInput id="year" value={draft.graduationYear} placeholder="2020" onChange={(e) => update({ graduationYear: e.target.value })} />
            </Field>
          </div>
        </OnboardingStep>
      ) : null}

      {step === 4 ? (
        <OnboardingStep
          eyebrow="Preferences"
          title="What are you open to?"
          hint="Used to filter what you are shown. Nothing here is published to employers."
        >
          <Field label="Employment type">
            <div className="onboarding__chips">
              {EMPLOYMENT_TYPES.map((type) => (
                <Chip key={type.id} active={draft.openTo.includes(type.id)} onClick={() => toggle('openTo', type.id)}>
                  {type.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Work type">
            <div className="onboarding__chips">
              {WORK_TYPES.map((type) => (
                <Chip key={type.id} active={draft.workTypes.includes(type.id)} onClick={() => toggle('workTypes', type.id)}>
                  {type.label}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="onboarding__row">
            <Field label="Salary from (monthly)" htmlFor="smin">
              <TextInput id="smin" type="number" value={draft.salaryMin} placeholder="450000" onChange={(e) => update({ salaryMin: e.target.value })} />
            </Field>
            <Field label="Salary to (monthly)" htmlFor="smax">
              <TextInput id="smax" type="number" value={draft.salaryMax} placeholder="750000" onChange={(e) => update({ salaryMax: e.target.value })} />
            </Field>
          </div>
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" value={draft.currency} onChange={(e) => update({ currency: e.target.value })}>
              <option value="NGN">NGN — Nigerian Naira</option>
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — Pound Sterling</option>
              <option value="EUR">EUR — Euro</option>
            </Select>
          </Field>
        </OnboardingStep>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>
          {error}
        </p>
      ) : null}

      <div className="onboarding__actions">
        <Button variant="subtle" onClick={back} disabled={step === 0 || saving}>
          Back
        </Button>
        {step < TOTAL_STEPS - 1 ? (
          <Button variant="primary" onClick={next} disabled={!canContinue()}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={finish} loading={saving} disabled={!canContinue()}>
            Finish and enter Grooveli
          </Button>
        )}
      </div>
    </OnboardingShell>
  );
}
