import type { Session } from '../auth/session';
import type { ConnectionStatus } from '../calls/signalingClient';
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
          <Avatar name={session.displayName} size={48} />
          <span className="profile-text">
            <span className="profile-name">{session.displayName}</span>
            <span className="profile-email">{session.email}</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

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
      </div>

      <div className="card settings-section about">
        <h2>About {brand.name}</h2>
        <Lockup size={40} />
        <p className="muted">{brand.tagline}</p>
        <dl>
          <dt>Version</dt>
          <dd>{brand.version}</dd>
          <dt>Calling</dt>
          <dd>WebRTC, peer to peer · {connection === 'online' ? 'connected' : connection === 'connecting' ? 'connecting' : 'not connected'}</dd>
        </dl>
      </div>
    </section>
  );
}
