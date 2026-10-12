import { useEffect, useState, type FormEvent } from 'react';
import { AuthError, MIN_PASSWORD, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup, LogoMark } from '../components/Logo';

type Mode = 'signin' | 'signup' | 'forgot' | 'sent';

/** Google's "G" mark, as required by its sign-in branding guidelines. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginScreen({
  onSignedIn,
  notice,
  error: initialError,
}: {
  onSignedIn: (s: Session) => void;
  notice?: string | null;
  /** An error to show on arrival, e.g. from a failed Google sign-in. */
  error?: string | null;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const signup = mode === 'signup';

  useEffect(() => {
    void authApi.providers().then((p) => {
      setGoogle(p.google);
      setCanReset(p.passwordReset);
    });
  }, []);

  const requestReset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setMode('sent');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

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

  const continueWithGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.signInWithGoogle(); // leaves the page for Google
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Google sign-in failed. Please try again.');
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
        {mode === 'forgot' || mode === 'sent' ? (
          <form className="login-card" onSubmit={requestReset} noValidate aria-busy={busy}>
            <div className="login-brand">
              <Lockup size={36} />
            </div>
            {mode === 'forgot' ? (
              <>
                <h1>Reset your password</h1>
                <p className="muted">Enter your account's email and we'll send you a link to choose a new password.</p>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="username"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            ) : (
              <>
                <h1>Check your email</h1>
                <p className="muted" role="status">
                  If an account exists for <strong>{email.trim()}</strong>, a link to reset your password is on its way. It
                  works once and expires in 1 hour. Check your spam folder if you don't see it.
                </p>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => setMode('forgot')}>
                  Use a different email
                </button>
              </>
            )}
            <p className="login-switch">
              <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
                Back to sign in
              </button>
            </p>
          </form>
        ) : (
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

            {google && (
              <>
                <button type="button" className="btn btn-secondary btn-block btn-google" onClick={continueWithGoogle} disabled={busy}>
                  <GoogleMark />
                  Continue with Google
                </button>
                <p className="divider" role="separator">
                  <span>or {signup ? 'sign up' : 'sign in'} with email</span>
                </p>
              </>
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
              {!signup && canReset && (
                <button type="button" className="link-btn forgot-link" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
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
        )}
      </main>
    </div>
  );
}
