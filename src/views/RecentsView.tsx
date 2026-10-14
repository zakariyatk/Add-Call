import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, CallButton, EmptyState, PageHeader } from '../components/ui';
import { formatDuration, formatRelative } from '../lib/format';
import type { CallRecord, Peer } from '../calls/types';

const DIRECTION_LABEL = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed' } as const;

export function RecentsView({
  recents,
  now,
  onCall,
}: {
  recents: CallRecord[];
  now: number;
  onCall: (p: Peer, video: boolean) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const rows = recents.filter((r) => filter === 'all' || r.direction === 'missed');

  return (
    <section>
      <PageHeader title="Calls">
        <div className="segmented" role="group" aria-label="Filter calls">
          {(['all', 'missed'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : 'Missed'}
            </button>
          ))}
        </div>
      </PageHeader>

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
        <ul className="list card">
          {rows.map((r) => (
            <li key={r.id} className="list-row">
              <Avatar name={r.peer.name} />
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
              <CallButton label={`${r.video ? 'Video call' : 'Call'} ${r.peer.name}`} onClick={() => onCall(r.peer, r.video)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
