import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthError, MIN_PASSWORD, authApi, type Session } from '../auth/api';
import type { ConnectionStatus } from '../calls/CallController';
import { disablePush, enablePush, pushState, type PushState } from '../calls/push';
import { brand, type ThemeMode } from '../branding/brand.config';
import { Icon } from '../components/Icon';
import { UsernameForm } from '../components/UsernameField';
import { Lockup } from '../components/Logo';
import { removeAvatar, uploadAvatar, useAvatarUrl } from '../profile/avatars';
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
  username,
  onUsername,
}: {
  connection: ConnectionStatus;
  /** Your @username (without the @). */
  username: string | null;
  onUsername: (u: string) => void;
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
        <div className="profile setting-row-wrap">
          <ProfilePicture session={session} />
          <span className="profile-text">
            <span className="profile-name">{session.name}</span>
            {username && <span className="profile-handle">@{username}</span>}
            <span className="profile-email">{session.email}</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </div>
        <UsernameRow session={session} username={username} onUsername={onUsername} />
      </div>

      <ChangePassword hasPassword={session.hasPassword !== false} google={!!session.google} />

      <div className="card settings-section">
        <h2>Appearance</h2>
        <div className="setting-row setting-row-wrap">
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

function UsernameRow({ session, username, onUsername }: { session: Session; username: string | null; onUsername: (u: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  if (editing)
    return (
      <div className="username-edit">
        <UsernameForm
          me={session}
          initial={username ?? ''}
          current={username}
          submitLabel="Save"
          onSaved={(u) => {
            onUsername(u);
            setEditing(false);
            setSaved(u !== username);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  return (
    <div className="setting-row">
      <span>
        <span className="setting-label">Username</span>
        <span className="setting-hint" role="status">
          {saved ? `Saved. People can now find you as @${username}.` : username ? `@${username} — people find, call and message you by it.` : 'Not chosen yet.'}
        </span>
      </span>
      <button type="button" className="btn btn-secondary" onClick={() => (setEditing(true), setSaved(false))}>
        {username ? 'Change' : 'Choose'}
      </button>
    </div>
  );
}

/** Your picture, with a camera button to change it (and Remove when you have one). */
function ProfilePicture({ session }: { session: Session }) {
  const picker = useRef<HTMLInputElement>(null);
  const url = useAvatarUrl(session.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-picture">
      <button
        type="button"
        className="avatar-edit"
        onClick={() => picker.current?.click()}
        disabled={busy}
        aria-label={url ? 'Change profile picture' : 'Add profile picture'}
        title={url ? 'Change picture' : 'Add picture'}
      >
        <Avatar name={session.name} email={session.email} size={64} />
        <span className="avatar-edit-badge" aria-hidden="true">
          {busy ? <span className="upload-spinner" /> : <Icon name="camera" size={16} />}
        </span>
      </button>
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void run(() => uploadAvatar(file, session));
        }}
      />
      {url && !busy && (
        <button type="button" className="link-btn avatar-remove" onClick={() => void run(() => removeAvatar(session))}>
          Remove
        </button>
      )}
      {error && (
        <p className="form-error avatar-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CallNotifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void pushState().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);

  const run = (fn: () => Promise<PushState | void>, next?: PushState) => async () => {
    setBusy(true);
    setError(null);
    try {
      setState((await fn()) || next || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change call notifications.');
    } finally {
      setBusy(false);
    }
  };

  const hint =
    state === 'on'
      ? `On — calls ring this device as a notification, even when ${brand.name} is closed.`
      : state === 'denied'
        ? `Blocked. Allow notifications for this site in your browser's settings to be told about calls.`
        : state === 'needs-install'
          ? `On iPhone and iPad, first add ${brand.name} to your Home Screen (Share → Add to Home Screen), then open it from there.`
          : state === 'unsupported'
            ? `This browser can't show call notifications. Keep ${brand.name} open to hear calls.`
            : `Get calls as a notification, even when ${brand.name} is closed.`;
  return (
    <div className="setting-row">
      <span>
        <span className="setting-label">Call notifications</span>
        <span className="setting-hint" role="status">
          {error ?? hint}
        </span>
      </span>
      {state === 'off' && (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={run(enablePush)}>
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
      )}
      {state === 'on' && (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={run(() => disablePush(), 'off')}>
          Turn off
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
