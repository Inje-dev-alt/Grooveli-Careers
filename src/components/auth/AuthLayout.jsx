import './auth.css';
import { IconCheck } from '../ui/index.js';

const POINTS = [
  'Build a career identity employers can verify, not just read.',
  'Earn XP for career work that counts — not for time spent in the product.',
  'Discover opportunities by walking a career city, or search them directly.',
  'Share what you achieve, and connect with the people doing the same.',
];

/** The two-column frame shared by sign-in, sign-up and role selection. */
export function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth__pitch">
        <div className="auth__brand">
          <span className="auth__mark">G</span>
          <div>
            <p style={{ fontFamily: 'var(--g-font-display)', fontWeight: 700, fontSize: 'var(--g-text-md)' }}>
              Grooveli
            </p>
            <p className="g-eyebrow">Careers</p>
          </div>
        </div>

        <div>
          <h1 className="auth__title">
            A career platform you <span className="g-gradient-text">walk through</span>.
          </h1>
          <p className="auth__lede" style={{ marginTop: 'var(--g-space-3)' }}>
            Grooveli City is where candidates build, prove and use their professional identity — and where
            employers find the people who have.
          </p>
        </div>

        <div className="auth__points">
          {POINTS.map((point) => (
            <div key={point} className="auth__point">
              <IconCheck size={16} style={{ color: 'var(--g-accent)', flex: 'none', marginTop: 3 }} />
              {point}
            </div>
          ))}
        </div>
      </aside>

      <main className="auth__panel">{children}</main>
    </div>
  );
}
