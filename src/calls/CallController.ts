import type { RealtimeChannel } from '@supabase/supabase-js';
import { brand } from '../branding/brand.config';
import { supabase } from '../lib/supabase';
import { callReducer, IDLE, isActive, toRecord, type CallAction, type CallState } from './callMachine';
import type { MediaSession } from './media';
import { notifyIncomingCall } from './notify';
import { RING_TIMEOUT_MS, type CallRow, type PresenceUser } from './protocol';
import { Ringtone } from './ringtone';
import type { CallRecord, Peer } from './types';

/*
 * Owns everything about calling for the signed-in user: who's online
 * (Supabase Realtime presence), ringing / answering / hanging up (rows in the
 * `calls` table, changed through database functions and watched over
 * Realtime), camera / microphone, the LiveKit room and the call state. React
 * subscribes to snapshots (see useCalling); nothing here depends on React.
 */

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface CallSnapshot {
  call: CallState;
  connection: ConnectionStatus;
  /** Everyone else online right now. */
  presence: PresenceUser[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** A problem to show the user (permissions, connection). */
  notice: string | null;
  /** Which camera the local video comes from (front on phones by default). */
  facing: CameraFacing;
}

export type CameraFacing = 'user' | 'environment';

export interface CallPreferences {
  noiseSuppression: boolean;
  ringSound: boolean;
}

export interface CallUser {
  id: string;
  email: string;
  name: string;
}

interface PresenceMeta {
  email: string;
  name: string;
  busy: boolean;
}

/** How long the "Call ended" screen stays up. */
const ENDED_SCREEN_MS = 1800;

const camera = (facing: CameraFacing): MediaTrackConstraints => ({ width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facing });

const newCallId = () => crypto.randomUUID();

function mediaError(err: unknown, video: boolean): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return `Allow ${video ? 'camera and microphone' : 'microphone'} access in your browser to make calls.`;
  if (name === 'NotFoundError') return video ? 'No camera or microphone found.' : 'No microphone found.';
  if (name === 'NotReadableError') return 'Your microphone or camera is in use by another app.';
  if (!window.isSecureContext) return 'Calling needs a secure (HTTPS) connection.';
  return 'Could not start your microphone.';
}

const peerOf = (row: CallRow, meId: string): Peer =>
  row.caller_id === meId ? { email: row.callee_email, name: row.callee_name } : { email: row.caller_email, name: row.caller_name };

export class CallController {
  private snapshot: CallSnapshot = {
    call: IDLE,
    connection: 'offline',
    presence: [],
    localStream: null,
    remoteStream: null,
    notice: null,
    facing: 'user',
  };
  private listeners = new Set<() => void>();
  private me: CallUser | null = null;
  private online: RealtimeChannel | null = null;
  private inbox: RealtimeChannel | null = null;
  private media: MediaSession | null = null;
  private ringtone = new Ringtone('ring');
  private ringback = new Ringtone('ringback');
  private closeNotification: () => void = () => {};
  /** Both Realtime channels must be joined before calls can ring. */
  private joined = { online: false, inbox: false };
  private resetTimer: number | null = null;
  private ringTimer: number | null = null;
  private prefs: CallPreferences = { noiseSuppression: true, ringSound: true };

  constructor(private readonly onRecord: (r: CallRecord) => void) {}

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
    if (isActive(call.status) !== isActive(before.status)) void this.trackPresence();
    if (call.status === 'ended' && before.status !== 'ended') this.onEnded(call);
  }

  // ----- lifecycle -----
  connect(user: CallUser) {
    if (this.me?.id === user.id && this.online) return;
    this.disconnect();
    this.me = user;
    this.joined = { online: false, inbox: false };
    this.set({ connection: 'connecting' });

    // Calls to and from me, on my own private channel (the project allows only
    // private channels). Row-level security only delivers rows I'm part of.
    this.inbox = supabase
      .channel(`calls:${user.id}`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `callee_id=eq.${user.id}` }, (p) =>
        this.onRow(p.new as CallRow),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `caller_id=eq.${user.id}` }, (p) =>
        this.onRow(p.new as CallRow),
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          this.setJoined('inbox', true);
          void this.checkRinging();
        } else {
          if (status !== 'CLOSED') console.warn('[calls] incoming-call channel', status, err?.message ?? '');
          this.setJoined('inbox', false);
        }
      });

    // Who's online: a private channel only signed-in users can join.
    this.online = supabase
      .channel('online', { config: { private: true, presence: { key: user.id } } })
      .on('presence', { event: 'sync' }, () => this.syncPresence())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.setJoined('online', true);
        } else {
          this.setJoined('online', false); // supabase-js retries on its own
          if (status === 'CLOSED') this.set({ presence: [] });
        }
      });
  }

  private setJoined(channel: 'online' | 'inbox', joined: boolean) {
    this.joined = { ...this.joined, [channel]: joined };
    if (!this.me) return;
    const connection: ConnectionStatus = this.joined.online && this.joined.inbox ? 'online' : 'connecting';
    if (connection === this.snapshot.connection) return;
    this.set({ connection });
    if (connection === 'online') void this.trackPresence();
  }

  /** Picks up a call that started ringing before (or while) the inbox was joining. */
  private async checkRinging() {
    const me = this.me;
    if (!me) return;
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('callee_id', me.id)
      .eq('status', 'ringing')
      .gt('created_at', new Date(Date.now() - RING_TIMEOUT_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return console.warn('[calls] could not check for ringing calls', error.message);
    if (this.me === me && data?.[0]) this.onRow(data[0] as CallRow);
  }

  disconnect() {
    if (isActive(this.snapshot.call.status)) this.hangUp();
    for (const ch of [this.online, this.inbox]) if (ch) void supabase.removeChannel(ch);
    this.online = this.inbox = null;
    this.me = null;
    this.joined = { online: false, inbox: false };
    this.set({ connection: 'offline', presence: [] });
  }

  setPreferences(p: CallPreferences) {
    this.prefs = p;
    if (!p.ringSound) this.ringtone.stop();
  }

  dismissNotice = () => this.set({ notice: null });

  // ----- actions -----
  dial = async (peer: Peer, video: boolean) => {
    const me = this.me;
    if (isActive(this.snapshot.call.status) || !me) return;
    if (peer.email === me.email) return this.set({ notice: "You can't call yourself." });
    if (this.snapshot.connection !== 'online') return this.set({ notice: `Not connected to ${brand.name}. Check your connection and try again.` });
    const callId = newCallId();
    this.clearReset();
    this.dispatch({ type: 'dial', callId, peer, video, at: Date.now() });

    const online = this.snapshot.presence.find((p) => p.email === peer.email);
    if (!online) return this.dispatch({ type: 'end', reason: 'offline', at: Date.now() });
    if (online.busy) return this.dispatch({ type: 'end', reason: 'busy', at: Date.now() });

    const stream = await this.acquireMedia(video);
    if (!this.isCurrent(callId, 'calling')) {
      stream?.getTracks().forEach((t) => t.stop()); // hung up while the permission prompt was open
      return;
    }
    if (!stream) return this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
    this.dispatch({ type: 'setVideo', video: stream.getVideoTracks().length > 0 });

    const { data, error } = await supabase.rpc('start_call', { p_id: callId, p_email: peer.email, p_video: video });
    if (!this.isCurrent(callId, 'calling')) {
      if (!error) void this.endRow(callId, 'cancelled');
      return;
    }
    if (error) {
      this.set({ notice: error.message || 'Could not place the call.' });
      return this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
    }
    const row = data as CallRow;
    this.dispatch({ type: 'ringing', callId, peer: peerOf(row, me.id) });
    this.ringback.start();
    this.ringTimer = window.setTimeout(() => {
      if (!this.isCurrent(callId, 'ringing')) return;
      void this.endRow(callId, 'timeout');
      this.dispatch({ type: 'end', reason: 'timeout', at: Date.now() });
    }, RING_TIMEOUT_MS);
  };

  accept = async (video: boolean) => {
    const { call } = this.snapshot;
    if (call.status !== 'incoming' || !call.callId) return;
    const callId = call.callId;
    this.stopRinging();
    this.clearRingTimer();
    this.dispatch({ type: 'accept', video });
    const stream = await this.acquireMedia(video);
    if (!this.isCurrent(callId, 'connecting')) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (!stream) {
      void this.endRow(callId, 'failed');
      return this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
    }
    this.dispatch({ type: 'setVideo', video: stream.getVideoTracks().length > 0 });
    const { error } = await supabase.rpc('answer_call', { p_id: callId });
    if (!this.isCurrent(callId, 'connecting')) return;
    if (error) {
      this.set({ notice: error.message || 'This call has ended.' });
      return this.dispatch({ type: 'end', reason: 'failed', at: Date.now() });
    }
    await this.joinMedia(callId, stream);
  };

  decline = () => {
    const { call } = this.snapshot;
    if (call.status !== 'incoming' || !call.callId) return;
    void this.endRow(call.callId, 'declined');
    this.dispatch({ type: 'end', reason: 'declined', at: Date.now() });
  };

  hangUp = () => {
    const { call } = this.snapshot;
    if (!isActive(call.status) || !call.callId) return;
    if (call.status === 'incoming') return this.decline();
    const reason = call.status === 'calling' || call.status === 'ringing' ? 'cancelled' : 'hangup';
    void this.endRow(call.callId, reason);
    this.dispatch({ type: 'end', reason, at: Date.now() });
  };

  toggleMute = () => {
    const muted = !this.snapshot.call.muted;
    this.snapshot.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    void this.media?.setMuted(muted);
    this.dispatch({ type: 'setMuted', muted });
  };

  toggleVideo = async () => {
    const { call, localStream } = this.snapshot;
    if (!isActive(call.status) || call.status === 'incoming' || !localStream) return;
    if (call.video) {
      for (const t of localStream.getVideoTracks()) {
        t.stop();
        localStream.removeTrack(t);
      }
      await this.media?.setVideoTrack(null);
      this.dispatch({ type: 'setVideo', video: false });
    } else {
      let track: MediaStreamTrack | undefined;
      try {
        track = (await navigator.mediaDevices.getUserMedia({ video: camera(this.snapshot.facing) })).getVideoTracks()[0];
      } catch (err) {
        return this.set({ notice: mediaError(err, true) });
      }
      if (!track || !isActive(this.snapshot.call.status)) return track?.stop();
      localStream.addTrack(track);
      await this.media?.setVideoTrack(track);
      this.dispatch({ type: 'setVideo', video: true });
    }
    // A new MediaStream object makes React re-bind the local preview.
    this.set({ localStream: new MediaStream(localStream.getTracks()) });
  };

  /** Flips between the front and back camera (phones); keeps the call connected. */
  switchCamera = async () => {
    const { call, localStream, facing } = this.snapshot;
    if (!isActive(call.status) || !call.video || !localStream) return;
    const next: CameraFacing = facing === 'user' ? 'environment' : 'user';
    // Many phones can't open both cameras at once, so release the current one first.
    for (const t of localStream.getVideoTracks()) {
      t.stop();
      localStream.removeTrack(t);
    }
    let track: MediaStreamTrack | undefined;
    let used = next;
    try {
      track = (await navigator.mediaDevices.getUserMedia({ video: camera(next) })).getVideoTracks()[0];
    } catch {
      used = facing;
      track = await navigator.mediaDevices
        .getUserMedia({ video: camera(facing) })
        .then((s) => s.getVideoTracks()[0])
        .catch(() => undefined);
      this.set({ notice: "Couldn't switch camera." });
    }
    if (!isActive(this.snapshot.call.status)) return track?.stop();
    if (track) localStream.addTrack(track);
    await this.media?.setVideoTrack(track ?? null);
    if (!track) this.dispatch({ type: 'setVideo', video: false });
    this.set({ facing: used, localStream: new MediaStream(localStream.getTracks()) });
  };

  // ----- internals -----
  private isCurrent(callId: string, status: CallState['status']) {
    const { call } = this.snapshot;
    return call.callId === callId && call.status === status;
  }

  private async endRow(callId: string, reason: string) {
    const { error } = await supabase.rpc('end_call', { p_id: callId, p_reason: reason });
    if (error) console.warn('[calls] could not end call', error.message);
  }

  private async acquireMedia(video: boolean): Promise<MediaStream | null> {
    const audio: MediaTrackConstraints = { echoCancellation: true, autoGainControl: true, noiseSuppression: this.prefs.noiseSuppression };
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({ notice: window.isSecureContext ? 'This browser does not support calling.' : 'Calling needs a secure (HTTPS) connection.' });
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: video ? camera('user') : false });
      this.set({ localStream: stream, facing: 'user' });
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

  /** Both sides join the call's LiveKit room once it's accepted. */
  private async joinMedia(callId: string, stream: MediaStream) {
    const fail = (message: string) => {
      this.set({ notice: message });
      void this.endRow(callId, 'failed');
      this.dispatch({ type: 'end', reason: 'failed', at: Date.now(), callId });
    };
    const { data, error } = await supabase.functions.invoke<{ url: string; token: string }>('livekit-token', { body: { callId } });
    if (!this.isCurrent(callId, 'connecting')) return;
    if (error || !data) {
      let message = 'Could not connect the call.';
      try {
        const body = await (error as { context?: Response })?.context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
      return fail(message);
    }

    // LiveKit is large, so it loads only when the first call connects.
    let MediaSessionClass: typeof MediaSession;
    try {
      ({ MediaSession: MediaSessionClass } = await import('./media'));
    } catch {
      return fail('Could not load calling. Check your connection and try again.');
    }
    if (!this.isCurrent(callId, 'connecting')) return;
    this.media?.leave();
    const media: MediaSession = new MediaSessionClass({
      onRemoteStream: (remoteStream) => this.media === media && this.set({ remoteStream }),
      onRemoteMedia: (state) => this.media === media && this.dispatch({ type: 'remoteMedia', ...state }),
      onConnected: () => this.media === media && this.dispatch({ type: 'connected', at: Date.now() }),
      onPeerLeft: () => {
        if (this.media !== media || !isActive(this.snapshot.call.status)) return;
        void this.endRow(callId, 'disconnected');
        this.dispatch({ type: 'end', reason: 'disconnected', at: Date.now(), callId });
      },
      onDisconnected: () => {
        if (this.media !== media || !isActive(this.snapshot.call.status)) return;
        void this.endRow(callId, 'disconnected');
        this.dispatch({ type: 'end', reason: 'disconnected', at: Date.now(), callId });
      },
    });
    this.media = media;
    try {
      await media.join(data.url, data.token, stream);
      if (this.snapshot.call.muted) await media.setMuted(true);
    } catch (err) {
      console.warn('[calls] LiveKit', err);
      if (this.media === media && this.isCurrent(callId, 'connecting')) fail('Could not connect the call. Check your connection and try again.');
    }
  }

  private onRow(row: CallRow) {
    const me = this.me;
    if (!me || !row?.id) return;
    const { call } = this.snapshot;
    const mine = call.callId === row.id;

    if (row.status === 'ended') {
      if (mine) this.dispatch({ type: 'end', reason: row.end_reason ?? 'hangup', at: Date.now(), callId: row.id });
      return;
    }

    if (row.callee_id === me.id) {
      if (row.status === 'ringing' && !mine) {
        if (Date.now() - Date.parse(row.created_at) > RING_TIMEOUT_MS) return; // stale
        if (isActive(call.status)) return void this.endRow(row.id, 'busy');
        this.clearReset();
        const peer = peerOf(row, me.id);
        this.dispatch({ type: 'incoming', callId: row.id, peer, video: row.video, at: Date.now() });
        if (this.prefs.ringSound) this.ringtone.start();
        this.closeNotification = notifyIncomingCall(row.id, peer, row.video);
        this.ringTimer = window.setTimeout(() => {
          if (this.isCurrent(row.id, 'incoming')) this.dispatch({ type: 'end', reason: 'timeout', at: Date.now(), callId: row.id });
        }, RING_TIMEOUT_MS);
      } else if (row.status === 'accepted' && mine && call.status === 'incoming') {
        // Picked up in another tab or on another device.
        this.dispatch({ type: 'end', reason: 'elsewhere', at: Date.now(), callId: row.id });
      }
      return;
    }

    if (row.caller_id === me.id && row.status === 'accepted' && mine && (call.status === 'calling' || call.status === 'ringing')) {
      this.clearRingTimer();
      this.stopRinging();
      this.dispatch({ type: 'accepted', callId: row.id });
      const stream = this.snapshot.localStream;
      if (stream) void this.joinMedia(row.id, stream);
    }
  }

  private syncPresence() {
    const state = this.online?.presenceState<PresenceMeta>() ?? {};
    const users: PresenceUser[] = [];
    for (const [id, metas] of Object.entries(state)) {
      if (id === this.me?.id || !metas.length) continue;
      users.push({ email: metas[0].email, name: metas[0].name, busy: metas.some((m) => m.busy) });
    }
    this.set({ presence: users });
  }

  private async trackPresence() {
    if (!this.online || !this.me || this.snapshot.connection !== 'online') return;
    await this.online.track({ email: this.me.email, name: this.me.name, busy: isActive(this.snapshot.call.status) } satisfies PresenceMeta);
  }

  private stopRinging() {
    this.ringtone.stop();
    this.ringback.stop();
    this.closeNotification();
    this.closeNotification = () => {};
  }

  private onEnded(call: CallState) {
    this.stopRinging();
    this.clearRingTimer();
    this.media?.leave();
    this.media = null;
    this.snapshot.localStream?.getTracks().forEach((t) => t.stop());
    this.set({ localStream: null, remoteStream: null });
    const record = toRecord(call);
    if (record) this.onRecord(record);
    this.resetTimer = window.setTimeout(() => this.dispatch({ type: 'reset' }), ENDED_SCREEN_MS);
  }

  private clearRingTimer() {
    if (this.ringTimer !== null) window.clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  private clearReset() {
    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
    this.resetTimer = null;
    if (this.snapshot.call.status === 'ended') this.dispatch({ type: 'reset' });
  }
}
