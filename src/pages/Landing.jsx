/**
 * The public front door.
 *
 * Signed-out visitors meet the ten career paths first — they are the reason to
 * sign up — and the game city second. Signed-in visitors never see this; `/`
 * sends them to their own space instead. No session, no data, no game state is
 * touched here, so this screen can be redesigned freely without risking the
 * product behind it.
 */
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { Button, Badge } from '../components/ui/index.js';
import { CAREER_PATHS } from '../data/careerPaths.js';

const STEPS = [
  { title: 'Pick a path', body: 'Ten careers, each with the skills that actually matter. Choose the one that fits — or discover it.' },
  { title: 'Prove it', body: 'Missions, skill challenges, courses and interview simulations turn claims into evidence.' },
  { title: 'Get hired', body: 'Apply with a verified profile. Employers see proof, not promises.' },
];

export default function Landing() {
  return (
    <AuthLayout>
      <div className="auth__card" style={{ maxWidth: 640 }}>
        <div className="auth__card-head">
          <Badge tone="accent">Grooveli City is open</Badge>
          <h2 className="auth__card-title" style={{ marginTop: 12 }}>
            Build a career you can prove.
          </h2>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.7 }}>
            Grooveli is a career city: walk its districts, complete missions, pass interview
            simulations and earn a profile employers can verify. Start on one of ten paths.
          </p>
        </div>

        <div className="g-stack" style={{ gap: 8 }}>
          {CAREER_PATHS.map((path) => (
            <div key={path.id} className="g-row-between" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 650, fontSize: 'var(--g-text-sm)' }}>{path.title}</p>
                <p className="g-muted g-truncate" style={{ fontSize: 'var(--g-text-xs)' }}>{path.tagline}</p>
              </div>
              <Badge tone="neutral">
                {path.core[0]}
              </Badge>
            </div>
          ))}
        </div>

        <div className="g-stack" style={{ gap: 8, marginTop: 16 }}>
          {STEPS.map((step, index) => (
            <div key={step.title} className="g-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Badge tone="accent">{index + 1}</Badge>
              <div>
                <p style={{ fontWeight: 650, fontSize: 'var(--g-text-sm)' }}>{step.title}</p>
                <p className="g-muted" style={{ fontSize: 'var(--g-text-xs)', lineHeight: 1.6 }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="g-row" style={{ gap: 10, marginTop: 20 }}>
          <Link to="/signup" style={{ flex: 1 }}>
            <Button variant="primary" size="lg" block>
              Create account
            </Button>
          </Link>
          <Link to="/signin" style={{ flex: 1 }}>
            <Button variant="ghost" size="lg" block>
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
