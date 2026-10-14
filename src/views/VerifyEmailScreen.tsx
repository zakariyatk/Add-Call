import { useEffect, useRef, useState } from 'react';
import { AuthError, authApi, type Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup } from '../components/Logo';

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

/** Opened from the "Sign in" button in the emailed code message (/#/verify/<token>): signs in on this device. */
export function VerifyEmailLink({ token, onContinue }: { token: string; onContinue: (s: Session | null) => void }) {
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the token is single-use
    started.current = true;
    authApi.verifyEmail(token).then(
      async () => onContinue(await authApi.me().catch(() => null)),
      async (err) => {
        // Already signed in here (say, with the code): nothing to report.
        const current = await authApi.me().catch(() => null);
        if (current) return onContinue(current);
        setFailed(err instanceof AuthError ? err.message : 'Something went wrong. Please try again.');
      },
    );
  }, [token, onContinue]);

  if (!failed)
    return (
      <Card busy>
        <h1>Signing you in…</h1>
      </Card>
    );

  return (
    <Card>
      <h1>This link has expired</h1>
      <p className="muted" role="alert">
        Sign-in links work once and expire after an hour. Enter your email again to get a new code.
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={() => onContinue(null)}>
        Continue to {brand.name}
      </button>
    </Card>
  );
}
