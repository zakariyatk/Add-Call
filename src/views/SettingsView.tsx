import { useState, type FormEvent } from 'react';
import { AuthError, MIN_PASSWORD, authApi, type Session } from '../auth/api';
import type { ConnectionStatus } from '../calls/CallController';
import { notifyPermission, requestNotifyPermission } from '../calls/notify';
import { brand, type ThemeMode } from '../branding/brand.config';
import { Lockup } from '../components/Logo';
import { Avatar, PageHeader, Switch } from '../components/ui';
import type { Settings } from '../settings';

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function SettingsView({
  session,
  settings,
  onChange,
  onSignOut,
  connection,
}: {
  connection: ConnectionStatus;
  session: Session;
  settings: Settings;
  onChange: (s: Settings) => void;
  onSignOut: () => void;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  return (
    <section className="settings">
      <PageHeader title="Settings" />

      <div className="card settings-section">
        <h2>Account</h2>
        <div className="profile">
          <Avatar name={session.name} size={48} />
          <span className="profile-text">
            <span className="profile-name">{session.name}</span>
            <span className="profile-email">{session.email}</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <ChangePassword hasPassword={session.hasPassword !== false} google={!!session.google} />

      <div className="card settings-section">
        <h2>Appearance</h2>
        <div className="setting-row">
          <span className="setting-label" id="theme-label">Theme</span>
          <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id} onClick={() => set('theme', t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card settings-section">
        <h2>Calling</h2>
        <Switch
          label="Noise suppression"
          hint="Reduce background noise on your microphone."
          checked={settings.noiseSuppression}
          onChange={(v) => set('noiseSuppression', v)}
        />
        <Switch label="Start calls with video" checked={settings.startWithVideo} onChange={(v) => set('startWithVideo', v)} />
        <Switch label="Ring sound" hint="Play a ringtone in this tab for incoming calls." checked={settings.ringSound} onChange={(v) => set('ringSound', v)} />
        <CallNotifications />
      </div>

      <div className="card settings-section about">
        <h2>About {brand.name}</h2>
        <Lockup size={40} />
        <p className="muted">{brand.tagline}</p>
        <dl>
          <dt>Version</dt>
          <dd>{brand.version}</dd>
          <dt>Calling</dt>
          <dd>LiveKit · {connection === 'online' ? 'connected' : connection === 'connecting' ? 'connecting' : 'not connected'}</dd>
        </dl>
      </div>
    </section>
  );
}

function CallNotifications() {
  const [permission, setPermission] = useState(notifyPermission);
  const hint =
    permission === 'granted'
      ? "On — you'll get a notification when someone calls while this tab is in the background."
      : permission === 'denied'
        ? `Blocked. Allow notifications for this site in your browser's settings to be told about calls.`
        : permission === 'unsupported'
          ? "This browser can't show notifications. Keep this tab open to hear calls."
          : 'Get a notification when someone calls while this tab is in the background.';
  return (
    <div className="setting-row">
      <span>
        <span className="setting-label">Call notifications</span>
        <span className="setting-hint" role="status">
          {hint}
        </span>
      </span>
      {permission === 'default' && (
        <button type="button" className="btn btn-secondary" onClick={() => void requestNotifyPermission().then(setPermission)}>
          Turn on
        </button>
      )}
    </div>
  );
}

function ChangePassword({ hasPassword: initiallyHasPassword, google }: { hasPassword: boolean; google: boolean }) {
  const [hasPassword, setHasPassword] = useState(initiallyHasPassword);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_PASSWORD) return setMessage({ ok: false, text: `Use at least ${MIN_PASSWORD} characters for your new password.` });
    setBusy(true);
    setMessage(null);
    try {
      await authApi.changePassword(current, next);
      setMessage({
        ok: true,
        text: hasPassword ? 'Password changed. Other devices have been signed out.' : 'Password added. You can now also sign in with your email.',
      });
      setHasPassword(true);
      setCurrent('');
      setNext('');
      setOpen(false);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof AuthError ? err.message : 'Could not change your password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card settings-section">
      <h2>Security</h2>
      {google && (
        <div className="setting-row">
          <span>
            <span className="setting-label">Google</span>
            <span className="setting-hint">Connected — you can sign in with Google.</span>
          </span>
        </div>
      )}
      {!open ? (
        <div className="setting-row">
          <span>
            <span className="setting-label">Password</span>
            {message?.ok ? (
              <span className="setting-hint" role="status">
                {message.text}
              </span>
            ) : (
              <span className="setting-hint">
                {hasPassword ? 'Changing it signs you out on other devices.' : 'Add one to also sign in with your email.'}
              </span>
            )}
          </span>
          <button type="button" className="btn btn-secondary" onClick={() => (setOpen(true), setMessage(null))}>
            {hasPassword ? 'Change' : 'Add password'}
          </button>
        </div>
      ) : (
        <form className="password-form" onSubmit={submit} noValidate>
          {hasPassword && (
            <label className="field">
              <span>Current password</span>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
            </label>
          )}
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="new-password-hint"
              autoFocus={!hasPassword}
            />
            <span id="new-password-hint" className="field-hint">
              At least {MIN_PASSWORD} characters.
            </span>
          </label>
          {message && !message.ok && (
            <p role="alert" className="form-error">
              {message.text}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => (setOpen(false), setMessage(null))}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || (hasPassword && !current) || !next}>
              {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Add password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
