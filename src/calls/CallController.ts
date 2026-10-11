import { brand } from '../branding/brand.config';
import { callReducer, IDLE, isActive, toRecord, type CallAction, type CallState } from './callMachine';
import { PeerSession } from './peer';
import type { IceServer, PresenceUser, ServerMessage, SignalData, UserInfo } from './protocol';
import { Ringtone } from './ringtone';
import { SignalingClient, type ConnectionStatus } from './signalingClient';
import type { CallRecord, Peer } from './types';

/*
 * Owns everything about calling for the signed-in user: the signaling socket,
 * camera / microphone, the WebRTC peer connection and the call state. React
 * subscribes to snapshots (see useCalling); nothing here depends on React.
 */

export interface CallSnapshot {
  call: CallState;
  connection: ConnectionStatus;
  /** Everyone else online on this server. */
  presence: PresenceUser[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** A problem to show the user (permissions, connection). */
  notice: string | null;
}

export interface CallPreferences {
  noiseSuppression: boolean;
  ringSound: boolean;
}

/** How long the "Call ended" screen stays up. */
const ENDED_SCREEN_MS = 1800;

const newCallId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

function mediaError(err: unknown, video: boolean): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return `Allow ${video ? 'camera and microphone' : 'microphone'} access in your browser to make calls.`;
  if (name === 'NotFoundError') return video ? 'No camera or microphone found.' : 'No microphone found.';
  if (name === 'NotReadableError') return 'Your microphone or camera is in use by another app.';
  if (!window.isSecureContext) return 'Calling needs a secure (HTTPS) connection.';
  return 'Could not start your microphone.';
}

export class CallController {
  private snapshot: CallSnapshot = {
    call: IDLE,
    connection: 'offline',
    presence: [],
    localStream: null,
    remoteStream: null,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private signaling: SignalingClient;
  private me: UserInfo | null = null;
  private iceServers: IceServer[] = [];
  private peer: PeerSession | null = null;
  private ringtone = new Ringtone();
  private resetTimer: number | null = null;
  private prefs: CallPreferences = { noiseSuppression: true, ringSound: true };

  constructor(private readonly onRecord: (r: CallRecord) => void) {
    this.signaling = new SignalingClient(
      (m) => this.onServerMessage(m),
      (connection) => this.set({ connection, ...(connection === 'replaced' ? { notice: `${brand.name} was opened in another tab or device.` } : {}) }),
    );
  }

  // ----- store interface for useSyncExternalStore -----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<CallSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private dispatch(action: CallAction) {
    const before = this.snapshot.call;
    const call = callReducer(before, action);
    if (call === before) return;
    this.set({ call });
    if (call.status === 'ended' && before.status !== 'ended') this.onEnded(call);
  }

  // ----- lifecycle -----
  connect(user: UserInfo) {
    this.me = user;
    this.signaling.start(user);
  }

  disconnect() {
    if (isActive(this.snapshot.call.status)) this.hangUp();
    this.signaling.stop();
    this.set({ connection: 'offline', presence: [] });
  }

  setPreferences(p: CallPreferences) {
    this.prefs = p;
    if (!p.ringSound) this.ringtone.stop();
  }

  dismissNotice = () => this.set({ notice: null });

  // ----- actions -----
  dial = async (peer: Peer, video: boolean) => {
    if (isActive(this.snapshot.call.status) || !this.me) return;
    if (peer.email === this.me.email) return this.set({ notice: "You can't call yourself." });
    if (this.snapshot.connection !== 'online') return this.set({ notice: `Not connected to ${brand.name}. Check your connection and try again.` });
    const callId = newCallId();
    this.clearReset();
    this.dispatch({ type: 'dial', callId, peer, video, at: Date.now() });
    const stream = await this.acquireMedia(video);
    if (this.snapshot.call.callId !== callId || this.snapshot.call.status !== 'calling') {
      stream?.getTracks().forEach((t) => t.stop()); // hung up while the permission prompt was open
      return;
    }
    if (!stream) return this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
    this.dispatch({ type: 'setVideo', video: stream.getVideoTracks().length > 0 });
    if (!this.signaling.send({ type: 'call', callId, to: peer.email, video })) this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
  };

  accept = async (video: boolean) => {
    const { call } = this.snapshot;
    if (call.status !== 'incoming' || !call.callId) return;
    this.ringtone.stop();
    this.dispatch({ type: 'accept', video });
    const stream = await this.acquireMedia(video);
    if (this.snapshot.call.callId !== call.callId || this.snapshot.call.status !== 'connecting') {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (!stream) {
      this.signaling.send({ type: 'decline', callId: call.callId });
      return this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
    }
    this.dispatch({ type: 'setVideo', video: stream.getVideoTracks().length > 0 });
    this.createPeer('callee', call.callId, stream);
    this.signaling.send({ type: 'accept', callId: call.callId });
  };

  decline = () => {
    const { call } = this.snapshot;
    if (call.status !== 'incoming' || !call.callId) return;
    this.signaling.send({ type: 'decline', callId: call.callId });
    this.dispatch({ type: 'end', reason: 'declined', at: Date.now() });
  };

  hangUp = () => {
    const { call } = this.snapshot;
    if (!isActive(call.status) || !call.callId) return;
    if (call.status === 'incoming') return this.decline();
    this.signaling.send({ type: 'hangup', callId: call.callId });
    this.dispatch({ type: 'end', reason: call.status === 'calling' || call.status === 'ringing' ? 'cancelled' : 'hangup', at: Date.now() });
  };

  toggleMute = () => {
    const muted = !this.snapshot.call.muted;
    this.snapshot.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.dispatch({ type: 'setMuted', muted });
    this.sendMediaState();
  };

  toggleVideo = async () => {
    const { call, localStream } = this.snapshot;
    if (!isActive(call.status) || call.status === 'incoming' || !localStream) return;
    if (call.video) {
      for (const t of localStream.getVideoTracks()) {
        t.stop();
        localStream.removeTrack(t);
      }
      await this.peer?.setVideoTrack(null);
      this.dispatch({ type: 'setVideo', video: false });
    } else {
      let track: MediaStreamTrack | undefined;
      try {
        track = (await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })).getVideoTracks()[0];
      } catch (err) {
        return this.set({ notice: mediaError(err, true) });
      }
      if (!track || !isActive(this.snapshot.call.status)) return track?.stop();
      localStream.addTrack(track);
      await this.peer?.setVideoTrack(track);
      this.dispatch({ type: 'setVideo', video: true });
    }
    // A new MediaStream object makes React re-bind the local preview.
    this.set({ localStream: new MediaStream(localStream.getTracks()) });
    this.sendMediaState();
  };

  // ----- internals -----
  private async acquireMedia(video: boolean): Promise<MediaStream | null> {
    const audio: MediaTrackConstraints = { echoCancellation: true, autoGainControl: true, noiseSuppression: this.prefs.noiseSuppression };
    const camera: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({ notice: window.isSecureContext ? 'This browser does not support calling.' : 'Calling needs a secure (HTTPS) connection.' });
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: video ? camera : false });
      this.set({ localStream: stream });
      return stream;
    } catch (err) {
      if (video) {
        // No camera, or camera refused: fall back to a voice call.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio });
          this.set({ localStream: stream, notice: 'Camera unavailable — continuing with voice only.' });
          return stream;
        } catch {
          /* report the original error below */
        }
      }
      this.set({ notice: mediaError(err, video) });
      return null;
    }
  }

  private createPeer(role: 'caller' | 'callee', callId: string, stream: MediaStream) {
    this.peer?.close();
    this.peer = new PeerSession(role, this.iceServers, stream, {
      send: (data) => this.signaling.send({ type: 'signal', callId, data }),
      onRemoteStream: (remoteStream) => this.set({ remoteStream }),
      onConnectionState: (state) => {
        if (state === 'connected') {
          this.dispatch({ type: 'connected', at: Date.now() });
          this.sendMediaState();
        } else if (state === 'failed') {
          this.signaling.send({ type: 'hangup', callId });
          this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
        }
      },
    });
  }

  private sendMediaState() {
    const { call } = this.snapshot;
    if (!call.callId || !this.peer) return;
    this.signaling.send({ type: 'signal', callId: call.callId, data: { media: { muted: call.muted, video: call.video } } });
  }

  private onServerMessage(msg: ServerMessage) {
    const { call } = this.snapshot;
    switch (msg.type) {
      case 'welcome':
        this.me = msg.you;
        this.iceServers = msg.iceServers;
        break;
      case 'presence':
        this.set({ presence: msg.users.filter((u) => u.email !== this.me?.email) });
        break;
      case 'incoming':
        if (isActive(call.status)) {
          this.signaling.send({ type: 'decline', callId: msg.callId });
          break;
        }
        this.clearReset();
        this.dispatch({ type: 'incoming', callId: msg.callId, peer: msg.from, video: msg.video, at: Date.now() });
        if (this.prefs.ringSound) this.ringtone.start();
        break;
      case 'ringing':
        this.dispatch({ type: 'ringing', callId: msg.callId, peer: msg.to });
        break;
      case 'accepted':
        if (call.callId !== msg.callId || !this.snapshot.localStream) break;
        this.dispatch({ type: 'accepted', callId: msg.callId });
        this.createPeer('caller', msg.callId, this.snapshot.localStream);
        void this.peer!.start().catch(() => this.hangUp());
        break;
      case 'signal':
        if (call.callId !== msg.callId) break;
        if ('media' in msg.data) this.dispatch({ type: 'remoteMedia', ...msg.data.media });
        else void this.peer?.handle(msg.data as Exclude<SignalData, { media: unknown }>).catch(() => this.hangUp());
        break;
      case 'ended':
        this.dispatch({ type: 'end', reason: msg.reason, at: Date.now(), callId: msg.callId });
        break;
      case 'error':
        console.warn('[signaling]', msg.message);
        break;
    }
  }

  private onEnded(call: CallState) {
    this.ringtone.stop();
    this.peer?.close();
    this.peer = null;
    this.snapshot.localStream?.getTracks().forEach((t) => t.stop());
    this.set({ localStream: null, remoteStream: null });
    const record = toRecord(call);
    if (record) this.onRecord(record);
    this.resetTimer = window.setTimeout(() => this.dispatch({ type: 'reset' }), ENDED_SCREEN_MS);
  }

  private clearReset() {
    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    if (this.snapshot.call.status === 'ended') this.dispatch({ type: 'reset' });
  }
}
