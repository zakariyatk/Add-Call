import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, CallButton, EmptyState, PageHeader } from '../components/ui';
import { formatPhone, normalizeNumber } from '../lib/format';
import type { Contact, Peer } from '../calls/types';

export function ContactsView({ contacts, onCall }: { contacts: Contact[]; onCall: (p: Peer, video?: boolean) => void }) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = normalizeNumber(q).replace(/\D/g, '');
    const matches = contacts
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (digits.length > 0 && c.number.includes(digits)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, Contact[]>();
    for (const c of matches) {
      const letter = c.name[0].toUpperCase();
      map.set(letter, [...(map.get(letter) ?? []), c]);
    }
    return [...map.entries()];
  }, [contacts, query]);

  return (
    <section>
      <PageHeader title="Contacts" />
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search name or number" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search contacts" />
      </label>

      {groups.length === 0 ? (
        <EmptyState>No contacts match “{query}”.</EmptyState>
      ) : (
        groups.map(([letter, list]) => (
          <div key={letter} className="group">
            <h2 className="group-label">{letter}</h2>
            <ul className="list card">
              {list.map((c) => (
                <li key={c.id} className="list-row">
                  <Avatar name={c.name} />
                  <span className="list-main">
                    <span className="list-title">
                      {c.name}
                      {c.favorite && (
                        <span className="fav" title="Favourite" aria-label="Favourite">
                          <Icon name="star" size={13} />
                        </span>
                      )}
                    </span>
                    <span className="list-sub">{formatPhone(c.number)}</span>
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Video call ${c.name}`} title="Video call" onClick={() => onCall(c, true)}>
                    <Icon name="video" size={18} />
                  </button>
                  <CallButton label={`Call ${c.name}`} onClick={() => onCall(c)} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
