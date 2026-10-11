import type { IceServer, SignalData } from './protocol';

/*
 * One WebRTC peer connection for one call. Both sides always negotiate an
 * audio and a video transceiver, so turning the camera on or off mid-call is
 * just a track swap — no renegotiation.
 *
 * The caller creates the offer; the callee answers. ICE candidates are
 * trickled through signaling and queued until the remote description is set.
 */

export interface PeerCallbacks {
  send: (data: SignalData) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
}

export class PeerSession {
  readonly pc: RTCPeerConnection;
  private readonly remote = new MediaStream();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private audio: RTCRtpTransceiver | null = null;
  private video: RTCRtpTransceiver | null = null;
  private closed = false;

  constructor(
    private readonly role: 'caller' | 'callee',
    iceServers: IceServer[],
    private readonly local: MediaStream,
    private readonly cb: PeerCallbacks,
  ) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const c = e.candidate.toJSON();
      this.cb.send({ candidate: { ...c, candidate: c.candidate ?? '' } });
    };
    this.pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      this.cb.onRemoteStream(this.remote);
    };
    this.pc.onconnectionstatechange = () => this.cb.onConnectionState(this.pc.connectionState);

    if (role === 'caller') {
      this.audio = this.pc.addTransceiver(local.getAudioTracks()[0] ?? 'audio', { direction: 'sendrecv', streams: [local] });
      this.video = this.pc.addTransceiver(local.getVideoTracks()[0] ?? 'video', { direction: 'sendrecv', streams: [local] });
    }
  }

  /** Caller: send the offer once the callee has accepted. */
  async start(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.cb.send({ sdp: { type: 'offer', sdp: offer.sdp ?? '' } });
  }

  async handle(data: SignalData): Promise<void> {
    if (this.closed) return;
    if ('sdp' in data) {
      if (data.sdp.type === 'offer' && this.role === 'callee') {
        await this.pc.setRemoteDescription(data.sdp);
        this.attachCalleeTracks();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.cb.send({ sdp: { type: 'answer', sdp: answer.sdp ?? '' } });
      } else if (data.sdp.type === 'answer' && this.role === 'caller') {
        await this.pc.setRemoteDescription(data.sdp);
      } else {
        return;
      }
      const queued = this.pendingCandidates;
      this.pendingCandidates = [];
      for (const c of queued) await this.addCandidate(c);
    } else if ('candidate' in data) {
      if (this.pc.remoteDescription) await this.addCandidate(data.candidate);
      else this.pendingCandidates.push(data.candidate);
    }
  }

  /** Swap the outgoing camera track (null = camera off). */
  async setVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    await this.video?.sender.replaceTrack(track);
  }

  close(): void {
    this.closed = true;
    this.pc.onicecandidate = this.pc.ontrack = this.pc.onconnectionstatechange = null;
    this.pc.close();
  }

  private attachCalleeTracks() {
    for (const t of this.pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      if (kind === 'audio' && !this.audio) this.audio = t;
      else if (kind === 'video' && !this.video) this.video = t;
    }
    for (const [t, track] of [
      [this.audio, this.local.getAudioTracks()[0] ?? null],
      [this.video, this.local.getVideoTracks()[0] ?? null],
    ] as const) {
      if (!t) continue;
      t.direction = 'sendrecv';
      void t.sender.replaceTrack(track);
      t.sender.setStreams?.(this.local);
    }
  }

  private async addCandidate(c: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(c);
    } catch {
      // A candidate for a transport we no longer use — harmless.
    }
  }
}
