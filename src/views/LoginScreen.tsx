import { useState, type FormEvent } from 'react';
import { AuthError, MIN_PASSWORD, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup, LogoMark } from '../components/Logo';

type Mode = 'signin' | 'signup';

export function LoginScreen({ onSignedIn, notice }: { onSignedIn: (s: Session) => void; notice?: string | null }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (signup && password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    setBusy(true);
    setError(null);
    try {
      onSignedIn(signup ? await authApi.signUp(name, email, password) : await authApi.signIn(email, password));
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword('');
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
        <form className="login-card" onSubmit={submit} noValidate aria-busy={busy}>
          <div className="login-brand">
            <Lockup size={36} />
          </div>
          <h1>{signup ? `Create your ${brand.name} account` : `Sign in to ${brand.name}`}</h1>
          <p className="muted">{signup ? 'Free, and takes a few seconds.' : 'Welcome back. Enter your details to continue.'}</p>

          {notice && !error && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}

          {signup && (
            <label className="field">
              <span>Name</span>
              <input type="text" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete={signup ? 'email' : 'username'}
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <div className="field">
            <span className="field-row">
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="link-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-controls="password"
              >
                {showPassword ? 'Hide password' : 'Show password'}
              </button>
            </span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              minLength={signup ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : signup ? 'password-hint' : undefined}
            />
            {signup && (
              <span id="password-hint" className="field-hint">
                At least {MIN_PASSWORD} characters.
              </span>
            )}
          </div>

          {error && (
            <p id="login-error" role="alert" className="form-error">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
          </button>

          <p className="login-switch">
            {signup ? 'Already have an account?' : `New to ${brand.name}?`}{' '}
            <button type="button" className="link-btn" onClick={() => switchMode(signup ? 'signin' : 'signup')}>
              {signup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
