import type { Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { Lockup } from '../components/Logo';
import { UsernameForm } from '../components/UsernameField';
import { suggestUsername } from '../profile/username';

/** Shown once after sign-in to anyone without a username yet. */
export function ChooseUsernameScreen({ session, onDone, onSignOut }: { session: Session; onDone: (username: string) => void; onSignOut: () => void }) {
  return (
    <main className="login-main reset-screen">
      <div className="login-card">
        <div className="login-brand is-visible">
          <Lockup size={32} />
        </div>
        <h1>Choose your username</h1>
        <p className="muted">
          People on {brand.name} find, call and message you by your @username. You can change it later in Settings.
        </p>
        <UsernameForm me={session} initial={suggestUsername(session.name, session.email)} submitLabel="Continue" onSaved={onDone} />
        <p className="login-switch">
          Not you?{' '}
          <button type="button" className="link-btn" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
