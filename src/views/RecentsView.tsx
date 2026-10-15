import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, EmptyState, PageHeader } from '../components/ui';
import { formatDuration, formatRelative } from '../lib/format';
import type { CallRecord, Peer } from '../calls/types';

const DIRECTION_LABEL = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed' } as const;

export function RecentsView({
  recents,
  now,
  onCall,
  onMessage,
}: {
  recents: CallRecord[];
  now: number;
  onCall: (p: Peer, video: boolean) => void;
  onMessage: (p: Peer) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const rows = recents.filter((r) => filter === 'all' || r.direction === 'missed');

  return (
    <section className="recents">
      <PageHeader title="Calls" />
      <div className="segmented segmented-full" role="group" aria-label="Filter calls">
          {(['all', 'missed'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : 'Missed'}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        filter === 'missed' ? (
          <EmptyState icon="missed" title="No missed calls">
            Calls you don't answer will show up here.
          </EmptyState>
        ) : (
          <EmptyState icon="phone" title="No calls yet">
            Start a voice or video call from Contacts.
          </EmptyState>
        )
      ) : (
        <ul className="list people-list calls-list">
          {rows.map((r) => (
            <li key={r.id} className="list-row">
              <Avatar name={r.peer.name} email={r.peer.email} />
              <span className="list-main">
                <span className={`list-title ${r.direction === 'missed' ? 'is-missed' : ''}`}>{r.peer.name}</span>
                <span className="list-sub">
                  <span className={`dir dir-${r.direction}`}>
                    <Icon name={r.direction} size={14} />
                  </span>
                  {DIRECTION_LABEL[r.direction]}
                  {r.video ? ' video' : ''}
                  {r.duration > 0 && <> · {formatDuration(r.duration)}</>}
                </span>
              </span>
              <span className="list-meta">{formatRelative(r.at, now)}</span>
              <button type="button" className="icon-btn accent" aria-label={`Message ${r.peer.name}`} title="Message" onClick={() => onMessage(r.peer)}>
                <Icon name="message" size={21} />
              </button>
              <button
                type="button"
                className="icon-btn accent"
                aria-label={`${r.video ? 'Video call' : 'Call'} ${r.peer.name}`}
                title={r.video ? 'Video call' : 'Call'}
                onClick={() => onCall(r.peer, r.video)}
              >
                <Icon name={r.video ? 'video' : 'phone'} size={22} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
