import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { Button, Field, TextInput } from '../components/ui/index.js';
import { useAuthStore, selectIsAuthenticated } from '../stores/authStore.js';
import { useIdentityRoute } from '../hooks/useIdentityRoute.js';

/** Create an account. Role selection is the next step, not part of this one. */
export default function SignUp() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const identityRoute = useIdentityRoute();

  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (isAuthenticated) navigate(identityRoute, { replace: true });
  }, [isAuthenticated, identityRoute, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setLocalError(null);

    if (form.password.length < 6) {
      setLocalError('Use at least six characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setLocalError('Those passwords do not match.');
      return;
    }

    try {
      await register({ email: form.email, password: form.password });
    } catch {
      /* the store holds the message */
    }
  };

  return (
    <AuthLayout>
      <div className="auth__card">
        <div className="auth__card-head">
          <h2 className="auth__card-title">Create your account</h2>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
            One account, whether you are building a career or hiring for one.
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

          <Field label="Password" htmlFor="password" hint="At least six characters.">
            <TextInput
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>

          <Field label="Confirm password" htmlFor="confirm">
            <TextInput
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </Field>

          {localError || error ? (
            <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>
              {localError || error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" block loading={status === 'authenticating'}>
            Create account
          </Button>
        </form>

        <p className="auth__alt">
          Already have an account?{' '}
          <Link className="auth__link" to="/signin">
            Sign in
          </Link>
        </p>

        <p className="auth__note">
          Prototype only. Passwords are stored in browser memory as plain text and no real account is
          created — do not use a password you use anywhere else.
        </p>
      </div>
    </AuthLayout>
  );
}
