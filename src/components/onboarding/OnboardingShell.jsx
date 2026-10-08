import './onboarding.css';

/**
 * The frame every onboarding step shares: brand, a progress bar built from the
 * step count, and a single card.
 */
export function OnboardingShell({ step, total, children }) {
  return (
    <div className="onboarding">
      <header className="onboarding__bar">
        <div className="onboarding__brand">
          <span className="onboarding__mark">G</span>
          <span style={{ fontFamily: 'var(--g-font-display)', fontWeight: 700 }}>Grooveli</span>
        </div>

        <div
          className="onboarding__steps"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Onboarding progress"
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={`onboarding__step${
                index < step ? ' onboarding__step--done' : index === step ? ' onboarding__step--current' : ''
              }`}
            />
          ))}
        </div>

        <span className="onboarding__count">
          {Math.min(step + 1, total)} / {total}
        </span>
      </header>

      <main className="onboarding__body">
        <div className="onboarding__card">{children}</div>
      </main>
    </div>
  );
}

export function OnboardingStep({ eyebrow, title, hint, children }) {
  return (
    <>
      <div className="onboarding__head">
        {eyebrow ? <p className="onboarding__eyebrow">{eyebrow}</p> : null}
        <h1 className="onboarding__title">{title}</h1>
        {hint ? <p className="onboarding__hint">{hint}</p> : null}
      </div>
      <div className="onboarding__fields">{children}</div>
    </>
  );
}
