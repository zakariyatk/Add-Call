import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthError, CODE_LENGTH, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup, LogoMark } from '../components/Logo';

/** How long before "Send a new code" is offered. */
const RESEND_AFTER_S = 30;

const problem = (err: unknown, fallback = 'Something went wrong. Please try again.') => (err instanceof AuthError ? err.message : fallback);

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

/**
 * Sign in and sign up in one: enter an email, then the code we email to it.
 * A new address gets an account automatically; there are no passwords.
 */
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
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const verifying = useRef(false);

  useEffect(() => {
    void authApi.providers().then((p) => setGoogle(p.google));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.sendCode(email);
      setCode('');
      setStep('code');
      setResendIn(RESEND_AFTER_S);
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    void sendCode();
  };

  const verify = async (value: string) => {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await authApi.verifyCode(email, value));
    } catch (err) {
      setError(problem(err));
      setCode('');
      setBusy(false);
    } finally {
      verifying.current = false;
    }
  };

  // Typed, pasted or filled in by the phone: sign in as soon as the code is complete.
  const onCode = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  const continueWithGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.signInWithGoogle(); // leaves the page for Google
    } catch (err) {
      setError(problem(err, 'Google sign-in failed. Please try again.'));
      setBusy(false);
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
        {step === 'email' ? (
          <form className="login-card" onSubmit={submitEmail} noValidate aria-busy={busy}>
            <div className="login-brand">
              <Lockup size={36} />
            </div>
            <h1>Welcome to {brand.name}</h1>
            <p className="muted">Enter your email and we'll send you a code. New here? Your account is created automatically.</p>

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
                  <span>or use your email</span>
                </p>
              </>
            )}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </label>

            {error && (
              <p id="login-error" role="alert" className="form-error">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
              {busy ? 'Sending code…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form
            className="login-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === CODE_LENGTH) void verify(code);
            }}
            noValidate
            aria-busy={busy}
          >
            <div className="login-brand">
              <Lockup size={36} />
            </div>
            <h1>Enter your code</h1>
            <p className="muted" role="status">
              We sent a {CODE_LENGTH}-digit code to <strong>{email.trim()}</strong>. Check your spam folder if you don't see it.
            </p>

            <label className="field">
              <span>Code</span>
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                autoFocus
                required
                value={code}
                onChange={(e) => onCode(e.target.value)}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </label>

            {error && (
              <p id="login-error" role="alert" className="form-error">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== CODE_LENGTH}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="login-switch">
              {resendIn > 0 ? (
                <span className="muted">Send a new code in {resendIn}s</span>
              ) : (
                <button type="button" className="link-btn" onClick={() => void sendCode()} disabled={busy}>
                  Send a new code
                </button>
              )}
              {' · '}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setStep('email');
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
