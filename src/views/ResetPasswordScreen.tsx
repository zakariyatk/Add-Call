import { useState, type FormEvent } from 'react';
import { AuthError, MIN_PASSWORD, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup } from '../components/Logo';

/** Opened from the emailed link (/#/reset/<token>): choose a new password, then you're signed in. */
export function ResetPasswordScreen({ token, onDone, onCancel }: { token: string; onDone: (s: Session) => void; onCancel: () => void }) {
  // The link can only be checked by using it, so it's checked when the new password is saved.
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('ready');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    setBusy(true);
    setError(null);
    try {
      onDone(await authApi.resetPassword(token, password));
    } catch (err) {
      const message = err instanceof AuthError ? err.message : 'Something went wrong. Please try again.';
      if (err instanceof AuthError && /expired|invalid/i.test(message)) setStatus('invalid');
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-main reset-screen">
      <form className="login-card" onSubmit={submit} noValidate aria-busy={busy || status === 'checking'}>
        <div className="login-brand is-visible">
          <Lockup size={36} />
        </div>
        {status === 'invalid' ? (
          <>
            <h1>This link has expired</h1>
            <p className="muted" role="alert">
              Password reset links work once and expire after an hour. Request a new one from the sign-in screen.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={onCancel}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <h1>Choose a new password</h1>
            <p className="muted">After this you'll be signed in, and signed out of {brand.name} everywhere else.</p>
            <div className="field">
              <span className="field-row">
                <label htmlFor="new-password">New password</label>
                <button type="button" className="link-btn" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-controls="new-password">
                  {show ? 'Hide password' : 'Show password'}
                </button>
              </span>
              <input
                id="new-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === 'checking'}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'reset-error' : 'reset-hint'}
              />
              <span id="reset-hint" className="field-hint">
                At least {MIN_PASSWORD} characters.
              </span>
            </div>
            {error && (
              <p id="reset-error" role="alert" className="form-error">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || status === 'checking'}>
              {busy ? 'Saving…' : 'Save and sign in'}
            </button>
            <p className="login-switch">
              <button type="button" className="link-btn" onClick={onCancel}>
                Cancel
              </button>
            </p>
          </>
        )}
      </form>
    </main>
  );
}
