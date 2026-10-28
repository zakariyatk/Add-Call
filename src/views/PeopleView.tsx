import { useEffect, useRef, useState, type FormEvent } from 'react';
import { brand } from '../branding/brand.config';
import { type PresenceUser } from '../calls/protocol';
import type { Peer } from '../calls/types';
import { Icon } from '../components/Icon';
import { Avatar, CallButton, EmptyState, PageHeader, PresenceAvatar, type Presence } from '../components/ui';
import { addContact, removeContact, useContactAction } from '../people/contacts';
import { groupByLetter, matchesQuery } from '../people/directory';
import { findPerson, handle, type Person } from '../profile/username';

type Filter = 'all' | 'online';

/** My list as a contact book: one search box, All/Online filters and A–Z sections. */
export function PeopleView({
  me,
  presence,
  contacts,
  contactsLoaded,
  onCall,
  onMessage,
  lookup,
  onLookupDone,
}: {
  me: { email: string };
  presence: PresenceUser[];
  /** My list. */
  contacts: Person[];
  contactsLoaded: boolean;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
  /** A @username from an invite link, to look up straight away. */
  lookup?: string | null;
  onLookupDone?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [found, setFound] = useState<Person | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const action = useContactAction();

  const listed = new Set(contacts.map((c) => c.email));
  // Presence names nobody: it only says which account ids are online, matched here to your list.
  const statusOf = (id: string): Presence => {
    const live = presence.find((p) => p.id === id);
    return live ? (live.busy ? 'busy' : 'online') : 'offline';
  };
  const onlineCount = contacts.filter((c) => statusOf(c.id) !== 'offline').length;
  const shown = contacts.filter((c) => (filter === 'all' || statusOf(c.id) !== 'offline') && matchesQuery(c, query));
  const typed = query.trim().replace(/^@+/, '');

  const find = async (q: string) => {
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

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (!typed) return setSearchError('Type their @username (or email).');
    void find(query);
  };

  // An invite link: show that person, ready to add.
  useEffect(() => {
    if (!lookup) return;
    setQuery(`@${lookup}`);
    setFilter('all');
    void find(lookup);
    onLookupDone?.();
    // find only reads state it sets itself; run once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  const typing = (value: string) => {
    setQuery(value);
    setSearchError(null);
    setFound(null);
  };

  const add = (key: string, q: string) => void action.run(key, () => addContact(q));

  return (
    <section className="people">
      <PageHeader title="People">
        <button
          type="button"
          className="people-add"
          aria-label="Find someone to add"
          title="Find someone"
          onClick={() => {
            setFilter('all');
            searchInput.current?.focus();
          }}
        >
          <Icon name="plus" size={22} />
        </button>
      </PageHeader>

      <form className="people-search" role="search" onSubmit={search} noValidate>
        <label className="people-search-field">
          <Icon name="search" size={18} />
          <input
            ref={searchInput}
            type="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search your list or find @username"
            aria-label="Search your list or find someone by @username"
            value={query}
            onChange={(e) => typing(e.target.value)}
            aria-invalid={searchError ? true : undefined}
            aria-describedby={searchError ? 'find-error' : undefined}
          />
        </label>
        {typed && !found && (
          <button type="submit" className="people-find" disabled={searching}>
            <span className="people-find-icon">
              <Icon name="userPlus" size={18} />
            </span>
            <span className="list-main">
              <span className="list-title">{searching ? 'Finding…' : `Find @${typed} on ${brand.name}`}</span>
              <span className="list-sub">Search everyone, not just your list</span>
            </span>
          </button>
        )}
        {searchError && (
          <p id="find-error" role="alert" className="form-error">
            {searchError}
          </p>
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

      {contacts.length > 0 && (
        <div className="people-filters">
          <div className="people-chips" role="group" aria-label="Show">
            <button type="button" className="people-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All · {contacts.length}
            </button>
            <button type="button" className="people-chip" aria-pressed={filter === 'online'} onClick={() => setFilter('online')}>
              <span className="people-chip-dot" aria-hidden="true" />
              Online · {onlineCount}
            </button>
          </div>
          <button type="button" className="link-btn section-action" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      )}

      {!contactsLoaded ? (
        <EmptyState>Loading…</EmptyState>
      ) : contacts.length === 0 ? (
        <EmptyState icon="users" title="Your list is empty">
          Tap + and type someone’s @username to find them, then add them to your list.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>{typed ? 'No one in your list matches. Tap Find to search everyone.' : 'No one in your list is online right now.'}</EmptyState>
      ) : (
        <>
          {groupByLetter(shown).map((section) => (
            <div key={section.letter} className="people-section">
              <h2 className="people-letter">{section.letter}</h2>
              <ul className="people-list">
                {section.people.map((c) => (
                  <PersonRow
                    key={c.id}
                    person={c}
                    status={statusOf(c.id)}
                    editing={editing}
                    removing={action.busy === c.id}
                    onRemove={() => void action.run(c.id, () => removeContact(c.id))}
                    onCall={onCall}
                    onMessage={onMessage}
                  />
                ))}
              </ul>
            </div>
          ))}
          {!typed && <p className="people-tip">Tap + to find someone by their @username and add them.</p>}
        </>
      )}
    </section>
  );
}

function PersonRow({
  person,
  status,
  editing,
  removing,
  onRemove,
  onCall,
  onMessage,
}: {
  person: Person;
  status: Presence;
  editing: boolean;
  removing: boolean;
  onRemove: () => void;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
}) {
  const busy = status === 'busy';
  return (
    <li className="people-row">
      <PresenceAvatar name={person.name} email={person.email} status={status} size={46} />
      <button type="button" className="people-row-main" aria-label={`Message ${person.name}`} onClick={() => onMessage(person)}>
        <span className="list-title">{person.name}</span>
        <span className={`list-sub is-${status}`}>{status === 'online' ? 'Online' : busy ? 'On a call' : handle(person.username, person.email)}</span>
      </button>
      {editing ? (
        <button type="button" className="btn btn-secondary btn-danger btn-small" disabled={removing} onClick={onRemove}>
          <Icon name="userMinus" size={18} /> Remove
        </button>
      ) : (
        <>
          <button type="button" className="icon-btn people-action" aria-label={`Video call ${person.name}`} title="Video call" disabled={busy} onClick={() => onCall(person, true)}>
            <Icon name="video" size={21} />
          </button>
          <button type="button" className="icon-btn people-action" aria-label={`Call ${person.name}`} title="Call" disabled={busy} onClick={() => onCall(person, false)}>
            <Icon name="phone" size={21} />
          </button>
        </>
      )}
    </li>
  );
}
