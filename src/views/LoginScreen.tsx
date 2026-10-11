import { useState, type FormEvent } from 'react';
import { MIN_PASSWORD, SignInError, type Auth, type Session } from '../auth/session';
import { brand } from '../branding/brand.config';
import { Lockup, LogoMark } from '../components/Logo';

export function LoginScreen({ auth, onSignedIn }: { auth: Auth; onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      onSignedIn(auth.signIn(email, password));
    } catch (err) {
      setError(err instanceof SignInError ? err.message : 'Sign-in failed. Try again.');
    }
  };

  return (
    <div className="login">
      <aside className="login-hero always-dark" aria-hidden="true">
        <div className="login-hero-mark">
          <LogoMark size={88} />
        </div>
        <p className="login-hero-name">{brand.name}</p>
        <p className="login-hero-tagline">{brand.tagline}</p>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="login-brand">
            <Lockup size={36} />
          </div>
          <h1>Sign in to {brand.name}</h1>
          <p className="muted">Welcome back. Enter your details to continue.</p>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </label>

          {error && (
            <p id="login-error" role="alert" className="form-error">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block">
            Sign in
          </button>

          <p className="login-note">
            Demo build: any email with a password of {MIN_PASSWORD}+ characters signs you in. Calls are simulated.
          </p>
        </form>
      </main>
    </div>
  );
}
