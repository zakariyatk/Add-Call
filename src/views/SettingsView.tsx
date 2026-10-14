import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Session } from '../auth/api';
import type { ConnectionStatus } from '../calls/CallController';
import { disablePush, enablePush, pushState, type PushState } from '../calls/push';
import { brand, type ThemeMode } from '../branding/brand.config';
import { Icon } from '../components/Icon';
import { UsernameForm } from '../components/UsernameField';
import { AvatarEditor } from '../components/AvatarEditor';
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

/**
 * Your picture. Tapping it opens a menu like WhatsApp's (take or choose a
 * photo, view, remove); a new photo opens the move-and-scale editor first.
 */
function ProfilePicture({ session }: { session: Session }) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const url = useAvatarUrl(session.email);
  const [menu, setMenu] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  const pick = (input: HTMLInputElement | null) => {
    setMenu(false);
    input?.click();
  };
  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return setError('Choose a photo smaller than 25 MB.');
    setError(null);
    setEditing(file);
  };
  const remove = async () => {
    setMenu(false);
    setBusy(true);
    setError(null);
    try {
      await removeAvatar(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your picture.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-picture">
      <button
        type="button"
        className="avatar-edit"
        onClick={() => (url || touch ? setMenu(true) : pick(gallery.current))}
        disabled={busy}
        aria-haspopup="dialog"
        aria-label={url ? 'Profile picture options' : 'Add profile picture'}
        title={url ? 'Change picture' : 'Add picture'}
      >
        <Avatar name={session.name} email={session.email} size={64} />
        <span className="avatar-edit-badge" aria-hidden="true">
          {busy ? <span className="upload-spinner" /> : <Icon name="camera" size={16} />}
        </span>
      </button>
      <input ref={gallery} type="file" accept="image/*" hidden onChange={onPicked} />
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={onPicked} />
      {error && (
        <p className="form-error avatar-error" role="alert">
          {error}
        </p>
      )}

      {menu && (
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Profile picture" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Profile picture</p>
            {touch && (
              <button type="button" className="sheet-item" onClick={() => pick(camera.current)}>
                <Icon name="camera" size={22} /> Take photo
              </button>
            )}
            <button type="button" className="sheet-item" onClick={() => pick(gallery.current)} autoFocus>
              <Icon name="image" size={22} /> {url ? 'Choose new photo' : 'Choose photo'}
            </button>
            {url && (
              <button type="button" className="sheet-item" onClick={() => (setMenu(false), setViewing(true))}>
                <Icon name="search" size={22} /> View photo
              </button>
            )}
            {url && (
              <button type="button" className="sheet-item is-danger" onClick={() => void remove()}>
                <Icon name="trash" size={22} /> Remove photo
              </button>
            )}
            <button type="button" className="sheet-item sheet-cancel" onClick={() => setMenu(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewing && url && (
        <div className="lightbox always-dark" role="dialog" aria-modal="true" aria-label="Profile picture" onClick={() => setViewing(false)}>
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setViewing(false)} autoFocus>
              <Icon name="close" size={22} />
            </button>
            <button type="button" className="icon-btn" aria-label="Change picture" onClick={() => (setViewing(false), setMenu(true))}>
              <Icon name="camera" size={22} />
            </button>
          </div>
          <img src={url} alt={`${session.name}’s profile picture`} className="avatar-full" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {editing && (
        <AvatarEditor
          file={editing}
          onCancel={() => setEditing(null)}
          onDone={async (picture) => {
            await uploadAvatar(picture, session);
            setEditing(null);
          }}
        />
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

  const run = async (fn: () => Promise<PushState | void>, next?: PushState) => {
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
    state === 'denied'
      ? `Blocked. Allow notifications for this site in your browser's settings.`
      : state === 'needs-install'
        ? `On iPhone and iPad, first add ${brand.name} to your Home Screen (Share → Add to Home Screen), then open it from there.`
        : state === 'unsupported'
          ? `This browser can't show call notifications.`
          : busy
            ? 'Updating…'
            : `Ring this device for calls and messages, even when ${brand.name} is closed.`;
  return (
    <Switch
      label="Call notifications"
      hint={error ?? hint}
      checked={state === 'on'}
      disabled={busy || (state !== 'on' && state !== 'off')}
      onChange={(on) => void (on ? run(enablePush) : run(() => disablePush(), 'off'))}
    />
  );
}

