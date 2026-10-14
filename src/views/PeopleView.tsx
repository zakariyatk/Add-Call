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
  onMessage,
}: {
  presence: PresenceUser[];
  history: CallRecord[];
  connection: ConnectionStatus;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
}) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const online = [...presence].sort((a, b) => a.name.localeCompare(b.name));

  const toAddress = (then: (p: Peer) => void) => (e?: FormEvent) => {
    e?.preventDefault();
    const email = address.trim().toLowerCase();
    if (!isEmail(email)) return setError('Enter the email address they use for ' + brand.name + '.');
    setError(null);
    const known = presence.find((p) => p.email === email) ?? history.find((h) => h.peer.email === email)?.peer;
    then({ email, name: known?.name ?? email });
  };
  const callAddress = (video: boolean) => toAddress((p) => onCall(p, video));

  return (
    <section>
      <PageHeader title="People" />

      <form className="card dial-form" onSubmit={callAddress(false)} noValidate>
        <label className="field">
          <span>Call or message someone on {brand.name}</span>
          <input
            type="email"
            inputMode="email"
            placeholder="name@example.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'dial-error' : undefined}
          />
        </label>
        <div className="dial-actions">
          <button type="button" className="btn btn-secondary" onClick={toAddress(onMessage)} aria-label="Message">
            <Icon name="message" size={18} /> <span className="hide-narrow">Message</span>
          </button>
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
      {connection !== 'online' ? (
        <EmptyState>{connection === 'connecting' ? 'Connecting…' : `Not connected to ${brand.name}. Reconnecting…`}</EmptyState>
      ) : online.length === 0 ? (
        <EmptyState>
          No one else is online. Open {brand.name} in another browser and sign in with a different email to try a call.
        </EmptyState>
      ) : (
        <ul className="list card">
          {online.map((u) => (
            <li key={u.email} className="list-row">
              <span className="presence-avatar">
                <Avatar name={u.name} email={u.email} />
                <span className={`presence-dot ${u.busy ? 'is-busy' : ''}`} aria-hidden="true" />
              </span>
              <span className="list-main">
                <span className="list-title">{u.name}</span>
                <span className="list-sub">{u.busy ? 'On a call' : u.email}</span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Message ${u.name}`} title="Message" onClick={() => onMessage(u)}>
                <Icon name="message" size={20} />
              </button>
              <button
                type="button"
                className="icon-btn hide-narrow"
                aria-label={`Video call ${u.name}`}
                title="Video call"
                disabled={u.busy}
                onClick={() => onCall(u, true)}
              >
                <Icon name="video" size={18} />
              </button>
              <CallButton label={`Call ${u.name}`} disabled={u.busy} onClick={() => onCall(u, false)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
