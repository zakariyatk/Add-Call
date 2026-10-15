import { useEffect, useState, type ReactNode } from 'react';
import { brand } from '../branding/brand.config';
import type { ConnectionStatus } from '../calls/CallController';
import { type PresenceUser } from '../calls/protocol';
import type { Peer } from '../calls/types';
import { Icon, type IconName } from '../components/Icon';
import { Lockup } from '../components/Logo';
import { EmptyState, PresenceAvatar, PresenceDot } from '../components/ui';
import { addContact, removeContact, useContactAction } from '../people/contacts';
import { useUsername } from '../profile/avatars';
import { handle, type Person } from '../profile/username';
import { inviteLink, shareInvite } from '../people/invite';
import { AddFriend } from './AddFriend';

export function PeopleView({
  me,
  myUsername,
  presence,
  contacts,
  contactsLoaded,
  connection,
  addQuery,
  onAddDone,
  onCall,
  onMessage,
}: {
  me: { email: string };
  myUsername: string | null;
  presence: PresenceUser[];
  /** My list. */
  contacts: Person[];
  contactsLoaded: boolean;
  connection: ConnectionStatus;
  /** Set when opened from an invite link or QR code: "Add friend" for this @username. */
  addQuery: string | null;
  onAddDone: () => void;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useContactAction();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const listed = new Set(contacts.map((c) => c.email));
  const statusOf = (email: string) => presence.find((p) => p.email === email);
  const q = filter.trim().toLowerCase().replace(/^@/, '');
  const matches = (name: string, username: string | null | undefined) => !q || name.toLowerCase().includes(q) || !!username?.includes(q);
  const shown = contacts.filter((c) => matches(c.name, c.username));
  const others = presence.filter((p) => !listed.has(p.email) && matches(p.name, null)).sort((a, b) => a.name.localeCompare(b.name));

  const invite = async () => {
    const result = await shareInvite(myUsername);
    if (result === 'copied') setNotice('Invite link copied. Paste it in WhatsApp, SMS or email.');
    else if (result === 'failed') setNotice(`Couldn't share. Your link: ${inviteLink(myUsername)}`);
  };

  if (adding || addQuery)
    return (
      <>
        <AddFriend
          me={me}
          myUsername={myUsername}
          initialQuery={addQuery ?? undefined}
          isListed={(email) => listed.has(email)}
          onClose={() => (setAdding(false), onAddDone())}
          onCall={onCall}
          onMessage={onMessage}
          onNotice={setNotice}
        />
        {notice && <Toast text={notice} />}
      </>
    );

  return (
    <section className="people">
      <header className="home-header">
        <Lockup size={36} />
        <button type="button" className="icon-btn accent" aria-label="Add friend" title="Add friend" onClick={() => setAdding(true)}>
          <Icon name="userPlus" size={24} />
        </button>
      </header>

      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search your list" aria-label="Search your list" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>

      <button type="button" className="action-card" onClick={() => setAdding(true)}>
        <span className="action-card-icon">
          <Icon name="userPlus" size={26} />
        </span>
        <span className="action-card-text">
          <span className="action-card-title">Add Friend</span>
          <span className="action-card-sub">Find people by @username</span>
        </span>
        <Icon name="chevronRight" size={18} />
      </button>
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

      <div className="section-head">
        <h2 className="section-title">
          My list{contacts.length > 0 && ` (${contacts.length})`}
        </h2>
        {contacts.length > 0 && (
          <button type="button" className="link-btn section-action" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {action.error && (
        <p role="alert" className="form-error">
          {action.error}
        </p>
      )}
      {!contactsLoaded ? (
        <EmptyState>Loading…</EmptyState>
      ) : contacts.length === 0 ? (
        <EmptyState icon="users" title="Your list is empty">
          Tap “Add Friend” to find people by their @username.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>No one in your list matches “{filter.trim()}”.</EmptyState>
      ) : (
        <ul className="list people-list">
          {shown.map((c) => {
            const live = statusOf(c.email);
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
                      <button type="button" className="icon-btn accent" aria-label={`Call ${c.name}`} title="Call" disabled={live?.busy} onClick={() => onCall(c, false)}>
                        <Icon name="phone" size={22} />
                      </button>
                      <button type="button" className="icon-btn accent" aria-label={`Video call ${c.name}`} title="Video call" disabled={live?.busy} onClick={() => onCall(c, true)}>
                        <Icon name="video" size={22} />
                      </button>
                      <RowMenu
                        open={menu === c.id}
                        label={c.name}
                        onToggle={(open) => setMenu(open ? c.id : null)}
                        items={[
                          { icon: 'message', label: 'Message', onSelect: () => onMessage(c) },
                          { icon: 'userMinus', label: 'Remove from my list', danger: true, onSelect: () => void action.run(c.id, () => removeContact(c.id)) },
                        ]}
                      />
                    </>
                  )
                }
              />
            );
          })}
        </ul>
      )}

      <h2 className="section-title online-label">
        Online now{others.length > 0 && ` (${others.length})`}
      </h2>
      {connection === 'connecting' ? (
        <div className="list" aria-busy="true" aria-label="Loading people online">
          {[0, 1, 2].map((i) => (
            <div key={i} className="list-row" aria-hidden="true">
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
      ) : others.length === 0 ? (
        <EmptyState icon="users">{presence.length ? 'Everyone online is already in your list.' : 'No one else is online right now.'}</EmptyState>
      ) : (
        <ul className="list people-list">
          {others.map((u) => (
            <OnlineRow
              key={u.email}
              user={u}
              adding={action.busy === u.email}
              menuOpen={menu === u.email}
              onMenu={(open) => setMenu(open ? u.email : null)}
              onAdd={() => void action.run(u.email, () => addContact(u.email))}
              onCall={onCall}
              onMessage={onMessage}
            />
          ))}
        </ul>
      )}
      {notice && <Toast text={notice} />}
    </section>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <p className="toast" role="status">
      {text}
    </p>
  );
}

type MenuItem = { icon: IconName; label: string; danger?: boolean; onSelect: () => void };

/** The ⋮ button with a small menu of more actions. */
function RowMenu({ open, label, items, onToggle }: { open: boolean; label: string; items: MenuItem[]; onToggle: (open: boolean) => void }) {
  return (
    <span className="row-menu">
      <button type="button" className="icon-btn muted-btn" aria-label={`More for ${label}`} aria-expanded={open} aria-haspopup="menu" onClick={() => onToggle(!open)}>
        <Icon name="more" size={20} />
      </button>
      {open && (
        <>
          <span className="row-menu-backdrop" onClick={() => onToggle(false)} />
          <span className="row-menu-list" role="menu">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? 'is-danger' : undefined}
                onClick={() => {
                  onToggle(false);
                  it.onSelect();
                }}
                autoFocus={it === items[0]}
              >
                <Icon name={it.icon} size={18} /> {it.label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

function PersonRow({ person, online, busy, actions }: { person: Person; online: boolean; busy: boolean; actions: ReactNode }) {
  return (
    <li className="list-row">
      <PresenceAvatar name={person.name} email={person.email} status={busy ? 'busy' : online ? 'online' : 'offline'} />
      <span className="list-main">
        <span className="list-title">{person.name}</span>
        <span className="list-sub">
          <PresenceDot status={busy ? 'busy' : online ? 'online' : 'offline'} />
          {busy ? 'On a call' : online ? 'Online' : handle(person.username, 'Offline')}
        </span>
      </span>
      {actions}
    </li>
  );
}

function OnlineRow({
  user,
  adding,
  menuOpen,
  onMenu,
  onAdd,
  onCall,
  onMessage,
}: {
  user: PresenceUser;
  adding: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onAdd: () => void;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
}) {
  const username = useUsername(user.email);
  return (
    <li className="list-row">
      <PresenceAvatar name={user.name} email={user.email} status={user.busy ? 'busy' : 'online'} />
      <span className="list-main">
        <span className="list-title">{user.name}</span>
        <span className="list-sub">
          <PresenceDot status={user.busy ? 'busy' : 'online'} />
          {user.busy ? 'On a call' : handle(username, 'Online')}
        </span>
      </span>
      <button type="button" className="icon-btn accent" aria-label={`Call ${user.name}`} title="Call" disabled={user.busy} onClick={() => onCall(user, false)}>
        <Icon name="phone" size={22} />
      </button>
      <button type="button" className="icon-btn accent" aria-label={`Video call ${user.name}`} title="Video call" disabled={user.busy} onClick={() => onCall(user, true)}>
        <Icon name="video" size={22} />
      </button>
      <RowMenu
        open={menuOpen}
        label={user.name}
        onToggle={onMenu}
        items={[
          { icon: 'userPlus', label: adding ? 'Adding…' : 'Add to my list', onSelect: onAdd },
          { icon: 'message', label: 'Message', onSelect: () => onMessage(user) },
        ]}
      />
    </li>
  );
}
