import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { CallButton, PageHeader } from '../components/ui';
import { formatPhone, isDialable, normalizeNumber } from '../lib/format';
import type { Contact, Peer } from '../calls/types';

const KEYS: [string, string][] = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

export function KeypadView({ contacts, onCall }: { contacts: Contact[]; onCall: (p: Peer) => void }) {
  const [number, setNumber] = useState('');
  const match = contacts.find((c) => normalizeNumber(number).length >= 6 && c.number.endsWith(normalizeNumber(number).replace(/^\+/, '')));

  const press = (k: string) => setNumber((n) => (n.length < 20 ? n + k : n));
  const dial = () => {
    if (isDialable(number)) onCall(match ? { name: match.name, number: match.number } : { name: null, number: normalizeNumber(number) });
  };

  // Typing on a physical keyboard works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[\d*#+]$/.test(e.key)) setNumber((n) => (n.length < 20 ? n + e.key : n));
      else if (e.key === 'Backspace') setNumber((n) => n.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="keypad-view">
      <PageHeader title="Keypad" />
      <div className="card keypad-card">
        <div className="dial-display" aria-live="polite">
          <output className="dial-number" aria-label="Number">{number ? formatPhone(number) : <span className="muted">Enter a number</span>}</output>
          <span className="dial-match">{match ? match.name : ' '}</span>
        </div>
        <div className="keypad" role="group" aria-label="Dial pad">
          {KEYS.map(([k, sub]) => (
            <button
              key={k}
              type="button"
              className="key"
              onClick={() => press(k)}
              onContextMenu={(e) => {
                if (k === '0') {
                  e.preventDefault();
                  press('+');
                }
              }}
              aria-label={sub ? `${k} ${sub}` : k}
            >
              <span className="key-digit">{k}</span>
              <span className="key-sub">{sub || ' '}</span>
            </button>
          ))}
        </div>
        <div className="keypad-actions">
          <span />
          {isDialable(number) ? <CallButton size="lg" label="Call" onClick={dial} /> : <span className="call-btn call-btn-lg is-disabled" aria-hidden="true"><Icon name="phone" size={26} /></span>}
          {number ? (
            <button type="button" className="icon-btn" onClick={() => setNumber((n) => n.slice(0, -1))} aria-label="Delete digit" title="Delete">
              <Icon name="backspace" size={22} />
            </button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </section>
  );
}
