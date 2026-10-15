import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthError, CODE_LENGTH, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Icon } from '../components/Icon';
import { Lockup, LogoMark } from '../components/Logo';
import { isNativeApp } from '../lib/platform';

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
  // Phones open on a welcome screen first; wider screens show it beside the form instead.
  const [step, setStep] = useState<'welcome' | 'email' | 'code'>(() => (!notice && !initialError && isPhoneLayout() ? 'welcome' : 'email'));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const verifying = useRef(false);

  useEffect(() => {
    // Google doesn't allow its sign-in inside an app's embedded browser.
    void authApi.providers().then((p) => setGoogle(p.google && !isNativeApp));
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

  const backToEmail = () => {
    setStep('email');
    setError(null);
  };

  if (step === 'welcome') return <WelcomeScreen onStart={() => setStep('email')} />;

  return (
    <div className="login">
      <aside className="login-hero always-dark" aria-hidden="true">
        <FaceCluster />
        <div className="login-hero-copy">
          <Lockup size={36} />
          <p className="login-hero-name">{HEADLINE}</p>
          <p className="login-hero-tagline">{PITCH}</p>
        </div>
      </aside>

      <main className="login-main">
        {step === 'email' ? (
          <form className="login-card" onSubmit={submitEmail} noValidate aria-busy={busy}>
            <LoginArt />
            <h1>Login to {brand.name}</h1>
            <p className="muted">No password needed. We'll send you a code.</p>

            {notice && !error && (
              <p className="form-notice" role="status">
                {notice}
              </p>
            )}

            {google && (
              <>
                <button type="button" className="btn btn-block btn-google" onClick={continueWithGoogle} disabled={busy}>
                  <GoogleMark />
                  Continue with Google
                </button>
                <p className="divider" role="separator">
                  <span>or</span>
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
                // On phones the keyboard would cover the form; elsewhere start typing straight away.
                autoFocus={!isPhoneLayout()}
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
              {busy ? 'Sending code…' : 'Send code'}
            </button>

            <ul className="login-trust">
              <li>
                <Icon name="lock" size={16} />
                Only used to sign you in — no spam, ever
              </li>
              <li>
                <Icon name="userPlus" size={16} />
                New here? Your account is created automatically
              </li>
            </ul>
          </form>
        ) : (
          <form
            className="login-card is-code"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === CODE_LENGTH) void verify(code);
            }}
            noValidate
            aria-busy={busy}
          >
            <div className="login-topbar">
              <button type="button" className="icon-btn login-back" aria-label="Back" onClick={backToEmail}>
                <Icon name="chevronLeft" size={20} />
              </button>
              <span>Verification</span>
            </div>
            <h1>Enter the {CODE_LENGTH}-digit code</h1>
            <p className="muted" role="status">
              Sent to <strong>{email.trim()}</strong>
              <br />
              Check your spam folder if you don't see it.
            </p>

            <CodeBoxes value={code} onChange={onCode} disabled={busy} invalid={!!error} />

            {error && (
              <p id="login-error" role="alert" className="form-error">
                {error}
              </p>
            )}
            {busy && (
              <p className="login-switch muted" role="status">
                Signing in…
              </p>
            )}

            <p className="login-switch">
              Didn't get it?{' '}
              {resendIn > 0 ? (
                <span className="login-resend-wait">Resend in 0:{String(resendIn).padStart(2, '0')}</span>
              ) : (
                <button type="button" className="link-btn" onClick={() => void sendCode()} disabled={busy}>
                  Resend code
                </button>
              )}
            </p>
            <p className="login-switch">
              <button type="button" className="link-btn" onClick={backToEmail}>
                Use a different email
              </button>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

const HEADLINE = "Let's Connect";
const PITCH = 'Free voice & video calls with your family and friends — anywhere in the world.';

/** Matches the CSS breakpoint where the side panel gives way to a single column. */
const isPhoneLayout = () => window.matchMedia('(max-width: 860px)').matches;

const face = (n: number) => `/people/face-${n}.jpg`;

/** Smiling faces around a big one, for the welcome screen and the wide-screen side panel. */
function FaceCluster() {
  return (
    <div className="face-cluster" aria-hidden="true">
      <span className="face-ring is-outer" />
      <span className="face-ring is-inner" />
      <img className="face is-main" src={face(2)} alt="" />
      <img className="face is-a" src={face(3)} alt="" />
      <img className="face is-b" src={face(1)} alt="" />
      <img className="face is-c" src={face(7)} alt="" />
      <img className="face is-d" src={face(5)} alt="" />
      <span className="face-chip is-online">
        <span className="face-dot" /> Ammi · online
      </span>
      <span className="face-chip is-call">
        <Icon name="video" size={14} /> Video call · 12:04
      </span>
    </div>
  );
}

/** The logo with a few faces around it, above the sign-in form on phones. */
function LoginArt() {
  return (
    <div className="login-art" aria-hidden="true">
      <span className="login-art-glow" />
      <LogoMark size={96} />
      <img className="face is-a" src={face(4)} alt="" />
      <img className="face is-b" src={face(6)} alt="" />
      <img className="face is-c" src={face(2)} alt="" />
    </div>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome always-dark">
      <FaceCluster />
      <div className="welcome-body">
        <Lockup size={34} />
        <h1>{HEADLINE}</h1>
        <p>{PITCH}</p>
        <button type="button" className="btn btn-primary btn-block welcome-start" onClick={onStart}>
          Get started <Icon name="forward" size={20} />
        </button>
      </div>
    </main>
  );
}

/**
 * One box per digit. A single invisible input sits on top, so typing, pasting
 * and the phone's "From Mail" code suggestion all work as with a plain field.
 */
function CodeBoxes({ value, onChange, disabled, invalid }: { value: string; onChange: (v: string) => void; disabled: boolean; invalid: boolean }) {
  const [focused, setFocused] = useState(true);
  return (
    <div className={`code-boxes${invalid ? ' is-invalid' : ''}`}>
      <input
        className="code-boxes-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        autoFocus
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        aria-label={`${CODE_LENGTH}-digit code`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'login-error' : undefined}
      />
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`code-box${i < value.length ? ' is-filled' : ''}${focused && !disabled && i === Math.min(value.length, CODE_LENGTH - 1) ? ' is-current' : ''}`}
        >
          {value[i] ?? ''}
        </span>
      ))}
    </div>
  );
}
