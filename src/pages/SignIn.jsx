import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { Button, Field, TextInput, Panel } from '../components/ui/index.js';
import { useAuthStore, selectIsAuthenticated } from '../stores/authStore.js';
import { DEMO_ACCOUNTS } from '../services/authService.js';
import { useIdentityRoute } from '../hooks/useIdentityRoute.js';

/**
 * Sign in.
 *
 * Mocked: the password is compared in the browser. The flow is real, so the
 * screen can be pointed at a provider later without changing.
 */
export default function SignIn() {
  const navigate = useNavigate();
  const signIn = useAuthStore((s) => s.signIn);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const identityRoute = useIdentityRoute();

  const [form, setForm] = useState({ email: '', password: '' });

  useEffect(() => {
    if (isAuthenticated) navigate(identityRoute, { replace: true });
  }, [isAuthenticated, identityRoute, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await signIn(form);
    } catch {
      /* the store holds the message; the form renders it */
    }
  };

  const useDemo = (account) => {
    clearError();
    setForm({ email: account.email, password: account.password });
  };

  return (
    <AuthLayout>
      <div className="auth__card">
        <div className="auth__card-head">
          <h2 className="auth__card-title">Sign in</h2>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
            Welcome back to Grooveli.
          </p>
        </div>

        <form className="auth__form" onSubmit={submit}>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              placeholder="you@example.com"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

          {error ? (
            <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" block loading={status === 'authenticating'}>
            Sign in
          </Button>
        </form>

        <p className="auth__alt">
          New to Grooveli?{' '}
          <Link className="auth__link" to="/signup">
            Create an account
          </Link>
        </p>

        <Panel pad="sm" className="auth__demo">
          <span className="g-eyebrow">Demo accounts</span>
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.email} className="auth__demo-row">
              <span className="g-muted g-truncate">{account.label} · {account.email}</span>
              <Button size="sm" variant="ghost" onClick={() => useDemo(account)}>
                Use
              </Button>
            </div>
          ))}
        </Panel>

        <p className="auth__note">
          This is a prototype. Credentials are checked in the browser against mock data — it is not real
          authentication, and no account is created anywhere.
        </p>
      </div>
    </AuthLayout>
  );
}
