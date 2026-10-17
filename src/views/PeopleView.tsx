import { useState, type FormEvent, type ReactNode } from 'react';
import { brand } from '../branding/brand.config';
import { type PresenceUser } from '../calls/protocol';
import type { Peer } from '../calls/types';
import { Icon } from '../components/Icon';
import { Avatar, CallButton, EmptyState, PageHeader, PresenceAvatar } from '../components/ui';
import { addContact, removeContact, useContactAction } from '../people/contacts';
import { findPerson, handle, type Person } from '../profile/username';

export function PeopleView({
  me,
  presence,
  contacts,
  contactsLoaded,
  onCall,
  onMessage,
}: {
  me: { email: string };
  presence: PresenceUser[];
  /** My list. */
  contacts: Person[];
  contactsLoaded: boolean;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const action = useContactAction();

  const listed = new Set(contacts.map((c) => c.email));
  // Presence names nobody: it only says which account ids are online, matched here to your list.
  const statusOf = (id: string) => presence.find((p) => p.id === id);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q.replace(/^@/, '')) return setSearchError('Type their @username (or email).');
    setSearching(true);
    setSearchError(null);
    setFound(null);
    try {
      const person = await findPerson(q);
      if (!person) setSearchError(`No one on ${brand.name} has that username. Check the spelling.`);
      else if (person.email === me.email) setSearchError('That’s you.');
      else setFound(person);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Could not search right now.');
    } finally {
      setSearching(false);
    }
  };

  const add = (key: string, q: string) => void action.run(key, () => addContact(q));

  return (
    <section className="people">
      <PageHeader title="People" />

      <form className="card dial-form find-form" onSubmit={search} noValidate>
        <label className="field">
          <span>Find someone by username</span>
          <span className="handle-input">
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
              value={query}
              onChange={(e) => (setQuery(e.target.value.replace(/^@+/, '')), setSearchError(null))}
              aria-invalid={searchError ? true : undefined}
              aria-describedby={searchError ? 'find-error' : 'find-hint'}
            />
          </span>
        </label>
        <div className="dial-actions">
          <button type="submit" className="btn btn-primary" disabled={searching}>
            <Icon name="search" size={18} /> {searching ? 'Finding…' : 'Find'}
          </button>
        </div>
        {searchError ? (
          <p id="find-error" role="alert" className="form-error">
            {searchError}
          </p>
        ) : (
          !found && (
            <p id="find-hint" className="field-hint find-hint">
              You can call or message anyone you find, and add them to your list. An email address works too.
            </p>
          )
        )}
        {found && (
          <div className="found-person">
            <Avatar name={found.name} email={found.email} size={52} />
            <span className="list-main">
              <span className="list-title">{found.name}</span>
              <span className="list-sub">{handle(found.username, found.email)}</span>
            </span>
            <div className="found-actions">
              {listed.has(found.email) ? (
                <span className="in-list">
                  <Icon name="userCheck" size={18} /> In your list
                </span>
              ) : (
                <button type="button" className="btn btn-secondary" disabled={action.busy === found.id} onClick={() => add(found.id, found.username ?? found.email)}>
                  <Icon name="userPlus" size={18} /> {action.busy === found.id ? 'Adding…' : 'Add to my list'}
                </button>
              )}
              <button type="button" className="icon-btn" aria-label={`Message ${found.name}`} title="Message" onClick={() => onMessage(found)}>
                <Icon name="message" size={20} />
              </button>
              <button type="button" className="icon-btn" aria-label={`Video call ${found.name}`} title="Video call" onClick={() => onCall(found, true)}>
                <Icon name="video" size={20} />
              </button>
              <CallButton label={`Call ${found.name}`} onClick={() => onCall(found, false)} />
            </div>
          </div>
        )}
        {action.error && (
          <p role="alert" className="form-error">
            {action.error}
          </p>
        )}
      </form>

      <div className="section-head">
        <h2 className="group-label">My list{contacts.length > 0 && ` · ${contacts.length}`}</h2>
        {contacts.length > 0 && (
          <button type="button" className="link-btn section-action" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {!contactsLoaded ? (
        <EmptyState>Loading…</EmptyState>
      ) : contacts.length === 0 ? (
        <EmptyState>Your list is empty. Find people by their @username above and tap “Add to my list”.</EmptyState>
      ) : (
        <ul className="list card">
          {contacts.map((c) => {
            const live = statusOf(c.id);
            return (
              <PersonRow
                key={c.id}
                person={c}
                online={!!live}
                busy={!!live?.busy}
                actions={
                  editing ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-danger btn-small"
                      disabled={action.busy === c.id}
                      onClick={() => void action.run(c.id, () => removeContact(c.id))}
                    >
                      <Icon name="userMinus" size={18} /> Remove
                    </button>
                  ) : (
                    <>
                      <button type="button" className="icon-btn" aria-label={`Message ${c.name}`} title="Message" onClick={() => onMessage(c)}>
                        <Icon name="message" size={20} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn hide-narrow"
                        aria-label={`Video call ${c.name}`}
                        title="Video call"
                        disabled={live?.busy}
                        onClick={() => onCall(c, true)}
                      >
                        <Icon name="video" size={20} />
                      </button>
                      <CallButton label={`Call ${c.name}`} disabled={live?.busy} onClick={() => onCall(c, false)} />
                    </>
                  )
                }
              />
            );
          })}
        </ul>
      )}

    </section>
  );
}

function PersonRow({ person, online, busy, actions }: { person: Person; online: boolean; busy: boolean; actions: ReactNode }) {
  return (
    <li className="list-row">
      <PresenceAvatar name={person.name} email={person.email} status={busy ? 'busy' : online ? 'online' : 'offline'} />
      <span className="list-main">
        <span className="list-title">{person.name}</span>
        <span className="list-sub">
          {busy ? 'On a call' : handle(person.username, person.email)}
          {online && !busy && <span className="online-text"> · online</span>}
        </span>
      </span>
      {actions}
    </li>
  );
}
