import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../components/shell/shell.css';
import { Button, IconCheck, ErrorState } from '../components/ui/index.js';
import { useAuthStore, selectIsAuthenticated, selectIsRestoring } from '../stores/authStore.js';

const POINTS = [
  'Walk a compact career city — eleven districts, each one a part of the employment market.',
  'Build a profile employers can read, with skills you have actually proved.',
  'Earn XP for career activity that counts. Volume applications earn nothing.',
  'Ask Grooveli AI for matches, gaps, CV work and interview practice.',
];

/**
 * Entry point.
 *
 * Authentication belongs to the backend, so the prototype offers a single
 * "enter" action that starts a demo candidate session through `authService` —
 * the same call a real sign-in will make.
 */
export default function Landing() {
  const navigate = useNavigate();
  const enterAsDemoCandidate = useAuthStore((s) => s.enterAsDemoCandidate);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isRestoring = useAuthStore(selectIsRestoring);

  useEffect(() => {
    if (isAuthenticated) navigate('/city', { replace: true });
  }, [isAuthenticated, navigate]);

  const enter = async () => {
    try {
      await enterAsDemoCandidate();
      navigate('/city', { replace: true });
    } catch {
      /* the store holds the error; the view below renders it */
    }
  };

  return (
    <div className="app">
      <div className="landing">
        <div className="landing__inner">
          <span className="landing__mark">G</span>
          <div>
            <h1 className="landing__title">
              Grooveli <span className="g-gradient-text">Careers</span>
            </h1>
            <p className="landing__lede">
              An employment marketplace you walk through. Grooveli City is not a game about jobs — it is a
              career platform experienced like one.
            </p>
          </div>

          <div className="landing__points">
            {POINTS.map((point) => (
              <div key={point} className="landing__point">
                <IconCheck size={16} style={{ color: 'var(--g-accent)', flex: 'none', marginTop: 3 }} />
                {point}
              </div>
            ))}
          </div>

          {error ? <ErrorState error={{ message: error }} onRetry={enter} title="Could not start" /> : null}

          <Button
            variant="primary"
            size="lg"
            loading={status === 'authenticating' || isRestoring}
            onClick={enter}
          >
            {isRestoring ? 'Restoring your session' : 'Enter Grooveli City'}
          </Button>

          <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)', maxWidth: '44ch' }}>
            Prototype. Data is mocked through the service layer and no account is created.
          </p>
        </div>
      </div>
    </div>
  );
}
