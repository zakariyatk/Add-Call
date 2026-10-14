import { useEffect, useRef } from 'react';
import { brand } from '../branding/brand.config';
import { connectedSeconds, endReasonText, type CallState } from '../calls/callMachine';
import { Icon, type IconName } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { Avatar } from '../components/ui';
import { formatDuration } from '../lib/format';
import { useUsername } from '../profile/avatars';
import { handle } from '../profile/username';

function statusText(state: CallState, now: number): string {
  switch (state.status) {
    case 'calling':
      return 'Calling…';
    case 'ringing':
      return 'Ringing…';
    case 'incoming':
      return state.videoRequested ? 'Incoming video call' : 'Incoming call';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return formatDuration(connectedSeconds(state, now));
    case 'ended':
      return state.connectedAt ? `${endReasonText(state)} · ${formatDuration(connectedSeconds(state, now))}` : endReasonText(state);
    default:
      return '';
  }
}

/** Binds a MediaStream to a <video>; remote audio plays through it too. */
function StreamVideo({ stream, muted, className }: { stream: MediaStream; muted: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  });
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

function Control({
  icon,
  label,
  pressed,
  onClick,
  variant,
  disabled,
}: {
  icon: IconName;
  label: string;
  pressed?: boolean;
  onClick: () => void;
  variant?: 'end' | 'accept';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`call-control ${variant ? `call-${variant}` : ''}`}
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="call-control-icon">
        <Icon name={icon} size={variant ? 26 : 24} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function CallScreen({
  state,
  now,
  localStream,
  remoteStream,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMute,
  onToggleVideo,
}: {
  state: CallState;
  now: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: (video: boolean) => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
}) {
  // Focus Accept for an incoming call, End otherwise, so the keyboard lands on the likely action.
  const controlsRef = useRef<HTMLDivElement>(null);
  const incoming = state.status === 'incoming';
  useEffect(() => {
    const buttons = controlsRef.current?.querySelectorAll<HTMLButtonElement>(incoming ? '.call-accept' : '.call-end');
    buttons?.[buttons.length - 1]?.focus();
  }, [incoming]);

  const username = useUsername(state.peer?.email);
  if (!state.peer) return null;
  const ended = state.status === 'ended';
  const showRemoteVideo = !!remoteStream && state.remoteVideo && state.status === 'connected';
  const showSelfView = !!localStream && state.video && localStream.getVideoTracks().length > 0;

  return (
    <div
      className={`call-screen always-dark ${showRemoteVideo ? 'has-video' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${state.peer.name}`}
    >
      {/* Remote audio (and video) always plays through this element. */}
      {remoteStream && (
        <StreamVideo stream={remoteStream} muted={false} className={showRemoteVideo ? 'remote-video' : 'remote-video is-hidden'} />
      )}
      {showSelfView && <StreamVideo stream={localStream} muted className="self-view" />}

      <div className="call-brand">
        <LogoMark size={22} />
        <span>{brand.name}</span>
      </div>

      <div className="call-peer">
        {!showRemoteVideo && (
          <div className={`call-avatar ${['calling', 'ringing', 'incoming'].includes(state.status) ? 'is-pulsing' : ''}`}>
            <Avatar name={state.peer.name} email={state.peer.email} size={112} />
          </div>
        )}
        <h1>{state.peer.name}</h1>
        {(username || state.peer.name !== state.peer.email) && <p className="call-number">{handle(username, state.peer.email)}</p>}
        <p className="call-status" aria-live="polite">
          {statusText(state, now)}
          {state.status === 'connected' && state.remoteMuted && <span className="call-flag"> · {state.peer.name.split(' ')[0]} is muted</span>}
        </p>
      </div>

      <div className="call-controls" ref={controlsRef}>
        {state.status === 'incoming' ? (
          <>
            <Control icon="phoneOff" label="Decline" variant="end" onClick={onDecline} />
            {state.videoRequested && <Control icon="video" label="Video" variant="accept" onClick={() => onAccept(true)} />}
            <Control icon="phone" label="Accept" variant="accept" onClick={() => onAccept(false)} />
          </>
        ) : (
          <>
            <Control icon={state.muted ? 'micOff' : 'mic'} label={state.muted ? 'Unmute' : 'Mute'} pressed={state.muted} onClick={onToggleMute} disabled={ended || !localStream} />
            <Control icon={state.video ? 'video' : 'videoOff'} label="Camera" pressed={state.video} onClick={onToggleVideo} disabled={ended || !localStream} />
            <Control icon="phoneOff" label="End" variant="end" onClick={onHangUp} disabled={ended} />
          </>
        )}
      </div>
    </div>
  );
}
