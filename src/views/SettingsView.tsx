import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Session } from '../auth/api';
import type { ConnectionStatus } from '../calls/CallController';
import { disablePush, enablePush, pushState, type PushState } from '../calls/push';
import { canShowFullScreen, openFullScreenSettings } from '../calls/nativePush';
import { isNativeApp } from '../lib/platform';
import { brand, type ThemeMode } from '../branding/brand.config';
import { Icon, type IconName } from '../components/Icon';
import { UsernameForm } from '../components/UsernameField';
import { AvatarEditor } from '../components/AvatarEditor';
import { Lockup } from '../components/Logo';
import { removeAvatar, uploadAvatar, useAvatarUrl } from '../profile/avatars';
import { unblockUser } from '../people/blocks';
import { handle, type Person } from '../profile/username';
import { Avatar, Switch } from '../components/ui';
import type { Settings } from '../settings';
import type { SettingsPage } from './settingsPages';
import { previewRingtone, RINGTONE_IDS, type RingtoneId } from '../calls/ringtone';

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const RINGTONE_LABELS: Record<RingtoneId, string> = { classic: 'Classic', bright: 'Bright', soft: 'Soft' };

const PAGE_TITLES: Record<SettingsPage, string> = {
  profile: 'Edit profile',
  appearance: 'Appearance',
  calling: 'Calling',
  notifications: 'Notifications',
  blocked: 'Blocked people',
  about: `About ${brand.name}`,
  delete: 'Delete account',
};

export function SettingsView({
  page,
  onOpen,
  onBack,
  session,
  settings,
  onChange,
  onSignOut,
  connection,
  username,
  onUsername,
  blocked,
  onDeleteAccount,
}: {
  /** The page open inside Settings; null for the main list. */
  page: SettingsPage | null;
  onOpen: (page: SettingsPage) => void;
  onBack: () => void;
  connection: ConnectionStatus;
  /** People I blocked. */
  blocked: Person[];
  /** Deletes the account for good; throws when it couldn't. */
  onDeleteAccount: () => Promise<void>;
  /** Your @username (without the @). */
  username: string | null;
  onUsername: (u: string) => void;
  session: Session;
  settings: Settings;
  onChange: (s: Settings) => void;
  onSignOut: () => void;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const [notifications, setNotifications] = useState<PushState | null>(null);
  useEffect(() => {
    if (page) return;
    let live = true;
    void pushState().then((s) => live && setNotifications(s));
    return () => {
      live = false;
    };
  }, [page]);

  if (page)
    return (
      <section className="settings settings-page" aria-labelledby="settings-page-title">
        <header className="settings-page-header">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to Settings">
            <Icon name="back" size={22} />
          </button>
          <h1 id="settings-page-title">{PAGE_TITLES[page]}</h1>
        </header>

        {page === 'profile' && (
          <>
            <div className="settings-hero">
              <ProfilePicture session={session} size={104} />
              <span className="settings-hero-name">{session.name}</span>
            </div>
            <div className="settings-group">
              <UsernameRow session={session} username={username} onUsername={onUsername} />
            </div>
          </>
        )}

        {page === 'appearance' && (
          <div className="settings-group">
            <div className="setting-row setting-row-wrap">
              <span className="setting-label" id="theme-label">
                Theme
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id} onClick={() => set('theme', t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 'calling' && (
          <>
            <h2 className="settings-heading" id="ringtone-label">
              Ringtone
            </h2>
            <div className="settings-group" role="radiogroup" aria-labelledby="ringtone-label">
              {RINGTONE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={settings.ringtone === id}
                  className="settings-choice"
                  onClick={() => (set('ringtone', id), previewRingtone(id))}
                >
                  <span className="settings-row-title">{RINGTONE_LABELS[id]}</span>
                  {settings.ringtone === id && <Icon name="check" size={20} strokeWidth={2.2} />}
                </button>
              ))}
            </div>
            <div className="settings-group">
              <Switch label="Ring sound" hint="Play the ringtone in the app for incoming calls." checked={settings.ringSound} onChange={(v) => set('ringSound', v)} />
              <Switch
                label="Noise suppression"
                hint="Reduce background noise on your microphone."
                checked={settings.noiseSuppression}
                onChange={(v) => set('noiseSuppression', v)}
              />
              <Switch label="Start calls with video" checked={settings.startWithVideo} onChange={(v) => set('startWithVideo', v)} />
            </div>
          </>
        )}

        {page === 'notifications' && (
          <div className="settings-group">
            <CallNotifications />
          </div>
        )}

        {page === 'blocked' && <BlockedPeople blocked={blocked} />}

        {page === 'about' && (
          <div className="settings-group about">
            <Lockup size={40} />
            <p className="muted">{brand.tagline}</p>
            <dl>
              <dt>Version</dt>
              <dd>{brand.version}</dd>
              <dt>Calling</dt>
              <dd>LiveKit · {connection === 'online' ? 'connected' : connection === 'connecting' ? 'connecting' : 'not connected'}</dd>
            </dl>
          </div>
        )}

        {page === 'delete' && <DeleteAccount onDelete={onDeleteAccount} onCancel={onBack} />}
      </section>
    );

  return (
    <section className="settings" aria-labelledby="settings-title">
      <h1 id="settings-title" className="settings-title">
        Settings
      </h1>

      <div className="settings-hero">
        <ProfilePicture session={session} size={104} />
        <span className="settings-hero-name">{session.name}</span>
        {username && <span className="settings-hero-handle">@{username}</span>}
      </div>

      <InviteCard username={username} />

      <h2 className="settings-heading">Account</h2>
      <div className="settings-group">
        <NavRow icon="user" title="Edit profile" hint="Picture and @username" onClick={() => onOpen('profile')} />
        <NavRow icon="theme" title="Appearance" value={THEMES.find((t) => t.id === settings.theme)?.label} onClick={() => onOpen('appearance')} />
      </div>

      <h2 className="settings-heading">Calls and notifications</h2>
      <div className="settings-group">
        <NavRow icon="phone" title="Calling" hint="Ringtone, noise suppression, video" onClick={() => onOpen('calling')} />
        <NavRow
          icon="bell"
          title="Notifications"
          hint={`Ring when ${brand.name} is closed`}
          value={notifications === 'on' ? 'On' : notifications === null ? undefined : 'Off'}
          valueTone={notifications === 'on' ? 'ok' : undefined}
          onClick={() => onOpen('notifications')}
        />
      </div>

      <h2 className="settings-heading">Privacy and help</h2>
      <div className="settings-group">
        <NavRow icon="ban" title="Blocked people" value={blocked.length ? String(blocked.length) : 'None'} onClick={() => onOpen('blocked')} />
        <NavRow icon="shield" title="Privacy policy" href={`${brand.website}/privacy`} />
        <NavRow icon="help" title="Help and support" hint={brand.supportEmail} href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} help`)}`} />
        <NavRow icon="info" title={`About ${brand.name}`} value={brand.version} onClick={() => onOpen('about')} />
      </div>

      <div className="settings-group">
        <NavRow icon="logout" title="Sign out" onClick={onSignOut} plain />
        <NavRow icon="trash" title="Delete account" onClick={() => onOpen('delete')} plain danger />
      </div>
    </section>
  );
}

/** One line of the Settings list: an icon, a title, and what it opens. */
function NavRow({
  icon,
  title,
  hint,
  value,
  valueTone,
  onClick,
  href,
  plain,
  danger,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  value?: string;
  valueTone?: 'ok';
  onClick?: () => void;
  /** Opens outside the app (a web page, an email). */
  href?: string;
  /** An action, not a page: no arrow. */
  plain?: boolean;
  danger?: boolean;
}) {
  const content = (
    <>
      <span className="settings-row-icon" aria-hidden="true">
        <Icon name={icon} size={19} />
      </span>
      <span className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </span>
      {value && <span className={`settings-row-value ${valueTone === 'ok' ? 'is-ok' : ''}`}>{value}</span>}
      {!plain && (
        <span className="settings-row-go" aria-hidden="true">
          <Icon name="forward" size={16} strokeWidth={2} />
        </span>
      )}
    </>
  );
  const className = `settings-row ${danger ? 'is-danger' : ''}`;
  if (href)
    return (
      <a className={className} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
        {content}
      </a>
    );
  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

/** Shares your @username, so friends can find and call you. */
function InviteCard({ username }: { username: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = `Call me on ${brand.name}${username ? `: I'm @${username}` : ''}. ${brand.website}`;
  const invite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: brand.name, text });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      /* nothing to fall back to */
    }
  };
  return (
    <button type="button" className="invite-card" onClick={() => void invite()}>
      <span className="invite-card-text">
        <span className="invite-card-title">Invite friends</span>
        <span className="invite-card-hint" role="status">
          {copied ? 'Invite copied. Paste it in a message to a friend.' : 'Share your @username so they can call you'}
        </span>
      </span>
      <span className="invite-card-art" aria-hidden="true">
        <span className="invite-card-bubble">
          <span />
          <span />
        </span>
        <span className="invite-card-plus">
          <Icon name="plus" size={18} strokeWidth={2.6} />
        </span>
      </span>
    </button>
  );
}

function BlockedPeople({ blocked }: { blocked: Person[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unblock = async (p: Person) => {
    setBusy(p.id);
    setError(null);
    try {
      await unblockUser(p.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unblock this person.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <p className="settings-note">
        {blocked.length ? 'People you block can’t call or message you.' : 'No one. Block someone from your chat with them (⋮ → Block).'}
      </p>
      {blocked.length > 0 && (
        <ul className="settings-group list blocked-list">
          {blocked.map((p) => (
            <li key={p.id} className="list-row">
              <Avatar name={p.name} email={p.email} size={36} />
              <span className="list-main">
                <span className="list-title">{p.name}</span>
                <span className="list-sub">{handle(p.username, p.email)}</span>
              </span>
              <button type="button" className="btn btn-secondary btn-small" disabled={busy === p.id} onClick={() => void unblock(p)}>
                {busy === p.id ? 'Unblocking…' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </>
  );
}

/** Deletes the account, after saying exactly what goes with it. */
function DeleteAccount({ onDelete, onCancel }: { onDelete: () => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account right now. Please try again.');
      setBusy(false);
    }
  };
  return (
    <div className="settings-group delete-account" role="group" aria-labelledby="delete-account-title">
      <p id="delete-account-title" className="setting-label">
        Delete your account?
      </p>
      <p className="setting-hint">
        This can’t be undone. Your profile, @username and picture, all your chats (for both people, with their photos, files and voice
        messages), your call records, your list and the people you blocked are deleted straight away. You can sign up again later with
        the same email, as a new account.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="delete-account-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger-fill" onClick={() => void run()} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </div>
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
function ProfilePicture({ session, size = 64 }: { session: Session; size?: number }) {
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
        <Avatar name={session.name} email={session.email} size={size} />
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
      ? isNativeApp
        ? `Turned off. Allow notifications for ${brand.name} in your phone's Settings → Apps → ${brand.name}.`
        : `Blocked. Allow notifications for this site in your browser's settings.`
      : state === 'needs-install'
        ? `On iPhone and iPad, first add ${brand.name} to your Home Screen (Share → Add to Home Screen), then open it from there.`
        : state === 'unsupported'
          ? isNativeApp
            ? `Not available in this version of the app.`
            : `This browser can't show call notifications.`
          : busy
            ? 'Updating…'
            : `Ring this ${isNativeApp ? 'phone' : 'device'} for calls and messages, even when ${brand.name} is closed.`;
  return (
    <>
      <Switch
        label="Call notifications"
        hint={error ?? hint}
        checked={state === 'on'}
        disabled={busy || (state !== 'on' && state !== 'off')}
        onChange={(on) => void (on ? run(enablePush) : run(() => disablePush(), 'off'))}
      />
      {isNativeApp && state === 'on' && <FullScreenCalls />}
    </>
  );
}

/** Android 14+ asks people to allow the incoming-call screen over a locked phone. */
function FullScreenCalls() {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    let live = true;
    const check = () => void canShowFullScreen().then((ok) => live && setAllowed(ok));
    check();
    // Coming back from the phone's settings.
    document.addEventListener('visibilitychange', check);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  if (allowed) return null;
  return (
    <div className="setting-row">
      <span>
        <span className="setting-label">Incoming call screen</span>
        <span className="setting-hint">Allow {brand.name} to show calls full screen when your phone is locked.</span>
      </span>
      <button type="button" className="btn btn-secondary" onClick={() => void openFullScreenSettings()}>
        Allow
      </button>
    </div>
  );
}

