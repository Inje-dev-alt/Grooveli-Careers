import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { IconUser, IconGrid } from '../components/ui/index.js';
import { useAuthStore } from '../stores/authStore.js';

/**
 * What brings you to Grooveli?
 *
 * This decides which product the account enters. It adds a capability rather
 * than setting one, so choosing "find opportunities" today does not stop the
 * same person creating a company tomorrow.
 */
export default function RoleSelect() {
  const navigate = useNavigate();
  const chooseRole = useAuthStore((s) => s.chooseRole);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const pick = async (role) => {
    setPending(role);
    setError(null);
    try {
      await chooseRole(role);
      navigate(role === 'employer' ? '/onboarding/employer' : '/onboarding/candidate', { replace: true });
    } catch (caught) {
      setError(caught.message || 'Could not set that up. Try again.');
      setPending(null);
    }
  };

  return (
    <AuthLayout>
      <div className="role-select">
        <div>
          <h2 className="auth__card-title">What brings you to Grooveli?</h2>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', marginTop: 6 }}>
            You can add the other side later — this is one account.
          </p>
        </div>

        <div className="role-cards">
          <button
            type="button"
            className="role-card"
            onClick={() => pick('candidate')}
            disabled={Boolean(pending)}
          >
            <span className="role-card__icon">
              <IconUser size={24} />
            </span>
            <h3 className="role-card__title">Find opportunities</h3>
            <p className="role-card__body">
              Build your career identity, develop skills you can prove, and discover roles that actually fit —
              through Grooveli City or straight from the marketplace.
            </p>
            <span className="role-card__cta">
              {pending === 'candidate' ? 'Setting up…' : 'Join as candidate →'}
            </span>
          </button>

          <button
            type="button"
            className="role-card"
            onClick={() => pick('employer')}
            disabled={Boolean(pending)}
          >
            <span className="role-card__icon">
              <IconGrid size={24} />
            </span>
            <h3 className="role-card__title">Hire talent</h3>
            <p className="role-card__body">
              Build your company profile, publish roles, and discover candidates whose skills and achievements
              are backed by evidence rather than claims.
            </p>
            <span className="role-card__cta">
              {pending === 'employer' ? 'Setting up…' : 'Join as employer →'}
            </span>
          </button>
        </div>

        {error ? (
          <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>
            {error}
          </p>
        ) : null}
      </div>
    </AuthLayout>
  );
}
