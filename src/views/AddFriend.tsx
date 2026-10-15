import { useEffect, useRef, useState, type FormEvent } from 'react';
import { brand } from '../branding/brand.config';
import type { Peer } from '../calls/types';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/QrCode';
import { Avatar } from '../components/ui';
import { addContact } from '../people/contacts';
import { inviteLink, shareInvite } from '../people/invite';
import { findPerson, handle, normalizeUsername, type Person } from '../profile/username';

type Step = { kind: 'search' } | { kind: 'results'; found: Person | null } | { kind: 'confirm'; person: Person } | { kind: 'done'; person: Person };

/**
 * "Add Friend": find someone by @username (or email), check it's them, add
 * them to my list. Also shows my own QR code and an invite link.
 */
export function AddFriend({
  me,
  myUsername,
  initialQuery,
  isListed,
  onClose,
  onCall,
  onMessage,
  onNotice,
}: {
  me: { email: string };
  myUsername: string | null;
  /** From an invite link or QR code: search for this person straight away. */
  initialQuery?: string;
  isListed: (email: string) => boolean;
  onClose: () => void;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
  onNotice: (text: string) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [query, setQuery] = useState(initialQuery ? normalizeUsername(initialQuery) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const started = useRef(false);

  const search = async (q = query) => {
    const value = q.trim();
    if (!value.replace(/^@/, '')) return setError('Type their @username.');
    setBusy(true);
    setError(null);
    try {
      const found = await findPerson(value);
      if (found && found.email === me.email) setError('That’s you. Type a friend’s username.');
      else setStep({ kind: 'results', found });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search right now.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialQuery && !started.current) {
      started.current = true;
      void search(initialQuery);
    }
    // Only for the link this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const add = async (person: Person) => {
    setBusy(true);
    setError(null);
    try {
      await addContact(person.username ?? person.email);
      setStep({ kind: 'done', person });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this person.');
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    const result = await shareInvite(myUsername);
    if (result === 'copied') onNotice('Invite link copied. Paste it in WhatsApp, SMS or email.');
    else if (result === 'failed') onNotice(`Couldn't share. Your link: ${inviteLink(myUsername)}`);
  };

  const back = () => {
    setError(null);
    if (step.kind === 'search' || step.kind === 'done') return onClose();
    if (step.kind === 'confirm') return setStep({ kind: 'results', found: step.person });
    setStep({ kind: 'search' });
  };

  const title = step.kind === 'results' ? 'Search Results' : step.kind === 'confirm' ? 'Add to My List' : step.kind === 'done' ? '' : 'Add Friend';

  return (
    <section className="add-friend" aria-label="Add friend">
      <header className="flow-header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={back}>
          <Icon name="chevronLeft" size={24} strokeWidth={2.2} />
        </button>
        <h1>{title}</h1>
      </header>

      {step.kind === 'search' && (
        <div className="flow-body">
          <div className="flow-hero">
            <span className="flow-hero-icon">
              <Icon name="userPlus" size={48} strokeWidth={1.7} />
              <span className="flow-hero-badge">
                <Icon name="at" size={18} strokeWidth={2.4} />
              </span>
            </span>
            <h2>Find by username</h2>
            <p className="muted">Type your friend’s @username to find and add them to your list</p>
          </div>
          <form
            className="flow-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void search();
            }}
            noValidate
          >
            <label className="handle-field">
              <span className="handle-at" aria-hidden="true">
                @
              </span>
              <input
                type="search"
                enterKeyHint="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="username"
                aria-label="Their username"
                value={query}
                onChange={(e) => (setQuery(e.target.value.replace(/^@+/, '')), setError(null))}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'add-error' : undefined}
              />
            </label>
            {error && (
              <p id="add-error" role="alert" className="form-error">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
              <Icon name="search" size={18} strokeWidth={2.2} /> {busy ? 'Searching…' : 'Search'}
            </button>
          </form>
          <p className="divider" role="separator">
            <span>OR</span>
          </p>
          {myUsername && (
            <button type="button" className="action-card" onClick={() => setShowQr(true)}>
              <span className="action-card-icon">
                <Icon name="qr" size={24} />
              </span>
              <span className="action-card-text">
                <span className="action-card-title">My QR code</span>
                <span className="action-card-sub">Let a friend scan it to add you</span>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          )}
          <button type="button" className="action-card" onClick={() => void invite()}>
            <span className="action-card-icon">
              <Icon name="share" size={24} />
            </span>
            <span className="action-card-text">
              <span className="action-card-title">Invite Friends</span>
              <span className="action-card-sub">Share your {brand.name} link</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      )}

      {step.kind === 'results' && (
        <div className="flow-body">
          <p className="results-count">{step.found ? '1 person found' : 'No one found'}</p>
          {step.found ? (
            <ResultRow person={step.found} listed={isListed(step.found.email)} onPick={(p) => setStep({ kind: 'confirm', person: p })} />
          ) : (
            <div className="results-empty">
              <p>
                No one on {brand.name} has the username <strong>@{normalizeUsername(query)}</strong>. Check the spelling, or invite them.
              </p>
              <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => void invite()}>
                <Icon name="share" size={18} /> Invite Friends
              </button>
              <button type="button" className="btn btn-soft btn-block btn-lg" onClick={() => setStep({ kind: 'search' })}>
                Search again
              </button>
            </div>
          )}
        </div>
      )}

      {step.kind === 'confirm' && (
        <div className="flow-body">
          <div className="confirm-card">
            <Avatar name={step.person.name} email={step.person.email} size={96} />
            <h2>{step.person.name}</h2>
            <p className="muted">{handle(step.person.username, '')}</p>
            {isListed(step.person.email) ? (
              <>
                <p className="confirm-question">{step.person.name} is already in your list</p>
                <PersonActions person={step.person} onCall={onCall} onMessage={onMessage} />
              </>
            ) : (
              <>
                <p className="confirm-question">Add {step.person.name} to your list?</p>
                <p className="muted">They’ll be one tap away for calls and messages.</p>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <button type="button" className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => void add(step.person)}>
                  <Icon name="userPlus" size={18} /> {busy ? 'Adding…' : 'Add to my list'}
                </button>
                <button type="button" className="btn btn-soft btn-block btn-lg" onClick={back}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step.kind === 'done' && (
        <div className="flow-body flow-done">
          <span className="flow-hero-icon is-done">
            <Icon name="check" size={52} strokeWidth={2.8} />
          </span>
          <h2>Added to your list</h2>
          <p className="muted">{step.person.name} is now in your list</p>
          <PersonActions person={step.person} onCall={onCall} onMessage={onMessage} />
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onClose}>
            Done
          </button>
          <button
            type="button"
            className="btn btn-soft btn-block btn-lg"
            onClick={() => {
              setQuery('');
              setStep({ kind: 'search' });
            }}
          >
            Add Another Friend
          </button>
        </div>
      )}

      {showQr && myUsername && <MyQrSheet username={myUsername} onClose={() => setShowQr(false)} onInvite={() => void invite()} />}
    </section>
  );
}

function ResultRow({ person, listed, onPick }: { person: Person; listed: boolean; onPick: (p: Person) => void }) {
  return (
    <button type="button" className="result-row" onClick={() => onPick(person)}>
      <Avatar name={person.name} email={person.email} size={50} />
      <span className="list-main">
        <span className="list-title">{person.name}</span>
        <span className="list-sub">{handle(person.username, '')}</span>
      </span>
      {listed ? (
        <span className="in-list">
          <Icon name="userCheck" size={16} /> In your list
        </span>
      ) : (
        <span className="pill-btn">Add</span>
      )}
    </button>
  );
}

function PersonActions({ person, onCall, onMessage }: { person: Person; onCall: (p: Peer, video: boolean) => void; onMessage: (p: Peer) => void }) {
  return (
    <div className="person-actions">
      <button type="button" className="btn btn-soft btn-lg" onClick={() => onCall(person, false)}>
        <Icon name="phone" size={18} /> Call
      </button>
      <button type="button" className="btn btn-soft btn-lg" onClick={() => onMessage(person)}>
        <Icon name="message" size={18} /> Message
      </button>
    </div>
  );
}

function MyQrSheet({ username, onClose, onInvite }: { username: string; onClose: () => void; onInvite: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet qr-sheet" role="dialog" aria-modal="true" aria-label="My QR code" onClick={(e) => e.stopPropagation()}>
        <h2>My QR code</h2>
        <p className="muted">Friends scan this with their phone camera to add you</p>
        <div className="qr-frame">
          <QrCode value={inviteLink(username)} size={220} label={`QR code to add @${username} on ${brand.name}`} />
        </div>
        <p className="qr-handle">@{username}</p>
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onInvite}>
          <Icon name="share" size={18} /> Share my link
        </button>
        <button type="button" className="btn btn-soft btn-block btn-lg" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}
