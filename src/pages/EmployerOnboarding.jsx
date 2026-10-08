import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingShell, OnboardingStep } from '../components/onboarding/OnboardingShell.jsx';
import { Button, Field, TextInput, TextArea, Select, IconCheck } from '../components/ui/index.js';
import { useOnboardingStore } from '../stores/onboardingStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useEmployerStore } from '../stores/employerStore.js';
import { INDUSTRIES, COMPANY_SIZES, EMPLOYER_ROLES } from '../utils/organizationOptions.js';
import { cityLocations } from '../game/world/locations.js';

const TOTAL_STEPS = 3;

const DISTRICTS = cityLocations.filter((l) => l.type === 'career-district' || l.id === 'corporate-district');

/**
 * Employer onboarding.
 *
 * It collects the person and the company separately, because they are separate
 * entities: a membership connects one to the other, and a company can
 * eventually have several members with different permissions.
 */
export default function EmployerOnboarding() {
  const navigate = useNavigate();
  const step = useOnboardingStore((s) => s.step);
  const draft = useOnboardingStore((s) => s.employer);
  const update = useOnboardingStore((s) => s.updateEmployer);
  const next = useOnboardingStore((s) => s.next);
  const back = useOnboardingStore((s) => s.back);
  const setStep = useOnboardingStore((s) => s.setStep);
  const reset = useOnboardingStore((s) => s.reset);
  const seedFrom = useOnboardingStore((s) => s.seedFrom);

  const user = useAuthStore((s) => s.user);
  const complete = useAuthStore((s) => s.completeEmployerOnboarding);
  const loadEmployer = useEmployerStore((s) => s.load);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    seedFrom(user);
    setStep(0);
  }, []);

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await complete(draft);
      await loadEmployer();
      reset();
      setStep(TOTAL_STEPS);
    } catch (caught) {
      setError(caught.message || 'Could not create your company. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const canContinue = () => {
    if (step === 0) return draft.name.trim() && draft.title.trim();
    if (step === 1) return draft.companyName.trim() && draft.industry && draft.size && draft.location.trim();
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
            <h1 className="onboarding__title">Welcome to your Grooveli Employer Space</h1>
            <p className="onboarding__hint" style={{ marginTop: 8, maxWidth: '48ch' }}>
              {draft.companyName || 'Your company'} is set up. Publish a role and it appears in the same
              marketplace candidates browse from inside Grooveli City.
            </p>
          </div>
          <Button variant="primary" size="lg" onClick={() => navigate('/employer', { replace: true })}>
            Open employer dashboard
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={step} total={TOTAL_STEPS}>
      {step === 0 ? (
        <OnboardingStep eyebrow="About you" title="Who is hiring?" hint="Your name appears to candidates you contact.">
          <Field label="Full name" htmlFor="name">
            <TextInput id="name" value={draft.name} placeholder="Your name" onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Your role" htmlFor="role">
            <Select id="role" value={draft.role} onChange={(e) => update({ role: e.target.value })}>
              {EMPLOYER_ROLES.map((role) => (
                <option key={role.id} value={role.id}>{role.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Job title" htmlFor="title">
            <TextInput id="title" value={draft.title} placeholder="Head of Talent" onChange={(e) => update({ title: e.target.value })} />
          </Field>
        </OnboardingStep>
      ) : null}

      {step === 1 ? (
        <OnboardingStep eyebrow="Your company" title="Tell us about the company" hint="This becomes your public company profile.">
          <Field label="Company name" htmlFor="company">
            <TextInput id="company" value={draft.companyName} placeholder="Northwind Systems" onChange={(e) => update({ companyName: e.target.value })} />
          </Field>
          <div className="onboarding__row">
            <Field label="Industry" htmlFor="industry">
              <Select id="industry" value={draft.industry} onChange={(e) => update({ industry: e.target.value })}>
                <option value="">Choose an industry</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </Select>
            </Field>
            <Field label="Company size" htmlFor="size">
              <Select id="size" value={draft.size} onChange={(e) => update({ size: e.target.value })}>
                <option value="">Choose a size</option>
                {COMPANY_SIZES.map((size) => (
                  <option key={size} value={size}>{size} people</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="onboarding__row">
            <Field label="Location" htmlFor="location">
              <TextInput id="location" value={draft.location} placeholder="Lagos, Nigeria" onChange={(e) => update({ location: e.target.value })} />
            </Field>
            <Field label="Website" htmlFor="website">
              <TextInput id="website" value={draft.website} placeholder="https://example.com" onChange={(e) => update({ website: e.target.value })} />
            </Field>
          </div>
        </OnboardingStep>
      ) : null}

      {step === 2 ? (
        <OnboardingStep
          eyebrow="Company profile"
          title="How should candidates see you?"
          hint="Candidates read this before they apply, and your district decides where in Grooveli City your roles appear."
        >
          <Field label="Tagline" htmlFor="tagline">
            <TextInput id="tagline" value={draft.tagline} placeholder="Payments infrastructure for African commerce." onChange={(e) => update({ tagline: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="description">
            <TextArea
              id="description"
              value={draft.description}
              placeholder="What the company does, how the team works, and what it is like to join."
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <Field label="District in Grooveli City" htmlFor="district" hint="Where candidates will find your roles when exploring.">
            <Select id="district" value={draft.districtId} onChange={(e) => update({ districtId: e.target.value })}>
              {DISTRICTS.map((district) => (
                <option key={district.id} value={district.id}>{district.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Brand colour" htmlFor="color" hint="Used for your company tile.">
            <input
              id="color"
              type="color"
              value={draft.logoColor}
              onChange={(e) => update({ logoColor: e.target.value })}
              style={{ width: 64, height: 40, border: 0, background: 'none', padding: 0, cursor: 'pointer' }}
            />
          </Field>
        </OnboardingStep>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>{error}</p>
      ) : null}

      <div className="onboarding__actions">
        <Button variant="subtle" onClick={back} disabled={step === 0 || saving}>Back</Button>
        {step < TOTAL_STEPS - 1 ? (
          <Button variant="primary" onClick={next} disabled={!canContinue()}>Continue</Button>
        ) : (
          <Button variant="primary" onClick={finish} loading={saving} disabled={!canContinue()}>
            Create company
          </Button>
        )}
      </div>
    </OnboardingShell>
  );
}
