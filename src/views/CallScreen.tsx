import { useEffect, useRef } from 'react';
import { brand } from '../branding/brand.config';
import { connectedSeconds, type CallControl, type CallState } from '../calls/callMachine';
import { Icon, type IconName } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { Avatar } from '../components/ui';
import { formatDuration, formatPhone } from '../lib/format';

function statusText(state: CallState, now: number): string {
  switch (state.status) {
    case 'dialing':
      return 'Calling…';
    case 'ringing':
      return 'Ringing…';
    case 'connected':
      return formatDuration(connectedSeconds(state, now));
    case 'ended':
      return state.connectedAt ? `Call ended · ${formatDuration(connectedSeconds(state, now))}` : 'Call ended';
    default:
      return '';
  }
}

const CONTROLS: { control: CallControl; on: IconName; off: IconName; label: string }[] = [
  { control: 'muted', on: 'micOff', off: 'mic', label: 'Mute' },
  { control: 'speaker', on: 'speaker', off: 'speaker', label: 'Speaker' },
  { control: 'video', on: 'video', off: 'videoOff', label: 'Video' },
];

export function CallScreen({
  state,
  now,
  onToggle,
  onHangUp,
}: {
  state: CallState;
  now: number;
  onToggle: (c: CallControl) => void;
  onHangUp: () => void;
}) {
  const endRef = useRef<HTMLButtonElement>(null);
  useEffect(() => endRef.current?.focus(), []);

  if (!state.peer) return null;
  const title = state.peer.name ?? formatPhone(state.peer.number);
  const ended = state.status === 'ended';

  return (
    <div className="call-screen always-dark" role="dialog" aria-modal="true" aria-label={`Call with ${title}`}>
      <div className="call-brand">
        <LogoMark size={22} />
        <span>{brand.name}</span>
      </div>

      <div className="call-peer">
        <div className={`call-avatar ${state.status === 'dialing' || state.status === 'ringing' ? 'is-pulsing' : ''}`}>
          <Avatar name={state.peer.name} size={112} />
        </div>
        <h1>{title}</h1>
        {state.peer.name && <p className="call-number">{formatPhone(state.peer.number)}</p>}
        <p className="call-status" aria-live="polite">{statusText(state, now)}</p>
      </div>

      <div className="call-controls">
        {CONTROLS.map((c) => {
          const active = state[c.control];
          return (
            <button
              key={c.control}
              type="button"
              className="call-control"
              aria-pressed={active}
              disabled={ended}
              onClick={() => onToggle(c.control)}
            >
              <span className="call-control-icon">
                <Icon name={active ? c.on : c.off} size={24} />
              </span>
              <span>{c.label}</span>
            </button>
          );
        })}
        <button ref={endRef} type="button" className="call-control call-end" onClick={onHangUp} disabled={ended} aria-label="End call">
          <span className="call-control-icon">
            <Icon name="phoneOff" size={26} />
          </span>
          <span>End</span>
        </button>
      </div>
    </div>
  );
}
