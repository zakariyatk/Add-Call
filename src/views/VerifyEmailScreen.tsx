import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup } from '../components/Logo';

/** How often to check whether the address was confirmed in another tab or device. */
const RECHECK_MS = 8000;

function Card({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <main className="login-main reset-screen">
      <div className="login-card" aria-busy={busy}>
        <div className="login-brand is-visible">
          <Lockup size={36} />
        </div>
        {children}
      </div>
    </main>
  );
}

/**
 * Shown to signed-in accounts that haven't confirmed their email yet. Calling
 * stays locked until they open the link; this screen notices automatically.
 */
export function VerifyEmailPending({ session, onVerified, onSignOut }: { session: Session; onVerified: (s: Session) => void; onSignOut: () => void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);

  const recheck = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const s = await authApi.me();
      if (s?.emailVerified) onVerified(s);
    } catch {
      /* offline: try again later */
    } finally {
      checking.current = false;
    }
  }, [onVerified]);

  useEffect(() => {
    const id = window.setInterval(recheck, RECHECK_MS);
    window.addEventListener('focus', recheck);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', recheck);
    };
  }, [recheck]);

  const resend = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await authApi.resendVerification(session.email);
      setMessage({ ok: true, text: 'Sent. The new link replaces any earlier ones.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof AuthError ? err.message : 'Could not send the email. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h1>Confirm your email</h1>
      <p className="muted">
        We sent a link to <strong>{session.email}</strong>. Open it to start making calls on {brand.name}. It expires in an
        hour.
      </p>
      <p className="muted">Can't find it? Check your spam folder, or send a new one.</p>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'form-notice' : 'form-error'}>
          {message.text}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={recheck}>
        I've confirmed it
      </button>
      <button type="button" className="btn btn-secondary btn-block" onClick={resend} disabled={busy}>
        {busy ? 'Sending…' : 'Send a new link'}
      </button>
      <p className="login-switch">
        Wrong address?{' '}
        <button type="button" className="link-btn" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </Card>
  );
}

/** Opened from the emailed link (/#/verify/<token>). */
export function VerifyEmailLink({
  token,
  session,
  onContinue,
}: {
  token: string;
  /** The account signed in on this browser, if any (it may be a different device than sign-up). */
  session: Session | null | undefined;
  onContinue: (refreshed: Session | null) => void;
}) {
  const [state, setState] = useState<
    | { status: 'working' }
    | { status: 'done'; email: string | null }
    | { status: 'already'; email: string }
    | { status: 'failed'; message: string }
  >({ status: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the token is single-use
    started.current = true;
    authApi.verifyEmail(token).then(
      (email) => setState({ status: 'done', email }),
      async (err) => {
        // A used link opened again by someone already confirmed isn't a problem worth an error.
        const current = await authApi.me().catch(() => null);
        if (current?.emailVerified) return setState({ status: 'already', email: current.email });
        setState({ status: 'failed', message: err instanceof AuthError ? err.message : 'Something went wrong. Please try again.' });
      },
    );
  }, [token]);

  const continueOn = async () => onContinue(await authApi.me().catch(() => null));

  if (state.status === 'working')
    return (
      <Card busy>
        <h1>Confirming your email…</h1>
      </Card>
    );

  if (state.status === 'failed')
    return (
      <Card>
        <h1>This link has expired</h1>
        <p className="muted" role="alert">
          Verification links work once and expire after an hour.{' '}
          {session ? 'Continue to send yourself a new one.' : 'Sign in to send yourself a new one.'}
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={continueOn}>
          {session ? 'Continue' : 'Sign in'}
        </button>
      </Card>
    );

  if (state.status === 'already')
    return (
      <Card>
        <h1>Already confirmed</h1>
        <p className="muted" role="status">
          <strong>{state.email}</strong> is already confirmed, so this link isn't needed any more.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={continueOn}>
          Continue to {brand.name}
        </button>
      </Card>
    );

  const sameAccount = session && state.email && session.email === state.email;
  return (
    <Card>
      <h1>Email confirmed</h1>
      <p className="muted" role="status">
        {state.email ? <strong>{state.email}</strong> : 'Your address'} is confirmed. {sameAccount || !session ? `You're all set to call on ${brand.name}.` : ''}
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={continueOn}>
        {session ? `Continue to ${brand.name}` : 'Sign in'}
      </button>
    </Card>
  );
}
