import { useState, type FormEvent } from 'react';
import { brand } from '../branding/brand.config';
import { isEmail, type PresenceUser } from '../calls/protocol';
import type { ConnectionStatus } from '../calls/CallController';
import type { CallRecord, Peer } from '../calls/types';
import { Icon } from '../components/Icon';
import { Avatar, CallButton, EmptyState, PageHeader } from '../components/ui';

export function PeopleView({
  presence,
  history,
  connection,
  onCall,
}: {
  presence: PresenceUser[];
  history: CallRecord[];
  connection: ConnectionStatus;
  onCall: (p: Peer, video: boolean) => void;
}) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = address.trim().toLowerCase();
  const online = [...presence]
    .filter((p) => !query || p.name.toLowerCase().includes(query) || p.email.includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  const callAddress = (video: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    const email = address.trim().toLowerCase();
    if (!isEmail(email)) return setError('Enter the email address they use for ' + brand.name + '.');
    setError(null);
    const known = presence.find((p) => p.email === email) ?? history.find((h) => h.peer.email === email)?.peer;
    onCall({ email, name: known?.name ?? email }, video);
  };

  return (
    <section>
      <PageHeader title="Contacts" />

      <form className="card dial-form" onSubmit={callAddress(false)} noValidate>
        <label className="field">
          <span>Find or call someone on {brand.name}</span>
          <span className="search">
            <Icon name="search" size={18} />
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="Name or email address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (error) setError(null);
              }}
            aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'dial-error' : undefined}
            />
          </span>
        </label>
        <div className="dial-actions">
          <button type="button" className="btn btn-secondary" onClick={callAddress(true)}>
            <Icon name="video" size={18} /> Video
          </button>
          <button type="submit" className="btn btn-primary">
            <Icon name="phone" size={18} /> Call
          </button>
        </div>
        {error && (
          <p id="dial-error" role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>

      <h2 className="group-label">
        Online now{online.length > 0 && ` · ${online.length}`}
      </h2>
      {connection === 'connecting' ? (
        <div className="list card" aria-busy="true" aria-label="Loading contacts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="list-row skeleton-row" aria-hidden="true">
              <span className="skeleton skeleton-avatar" />
              <span className="list-main">
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line is-short" />
              </span>
            </div>
          ))}
        </div>
      ) : connection === 'offline' ? (
        <EmptyState icon="wifiOff" title="You're offline">
          Not connected to {brand.name}. Reconnecting…
        </EmptyState>
      ) : online.length === 0 && query ? (
        <EmptyState icon="search" title="No one online matches">
          You can still call any email address with the buttons above.
        </EmptyState>
      ) : online.length === 0 ? (
        <EmptyState icon="users" title="No one else is online">
          Open {brand.name} in another browser and sign in with a different email to try a call.
        </EmptyState>
      ) : (
        <ul className="list card">
          {online.map((u) => (
            <li key={u.email} className="list-row">
              <span className="presence-avatar">
                <Avatar name={u.name} />
                <span className={`presence-dot ${u.busy ? 'is-busy' : ''}`} aria-hidden="true" />
              </span>
              <span className="list-main">
                <span className="list-title">{u.name}</span>
                <span className="list-sub">{u.busy ? 'On a call' : u.email}</span>
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Video call ${u.name}`}
                title="Video call"
                disabled={u.busy}
                onClick={() => onCall(u, true)}
              >
                <Icon name="video" size={20} />
              </button>
              <CallButton label={`Call ${u.name}`} disabled={u.busy} onClick={() => onCall(u, false)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
