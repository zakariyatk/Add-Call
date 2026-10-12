import { Room, RoomEvent, Track, type LocalTrackPublication, type RemoteParticipant } from 'livekit-client';

/*
 * Audio and video for one call, through a LiveKit room. The controller hands
 * over the microphone / camera tracks it already captured, so permission
 * prompts and the local preview work the same as before; LiveKit carries
 * them to the other person (relaying when networks block a direct path).
 */

export interface MediaEvents {
  /** The other person's audio and video (null until they arrive). */
  onRemoteStream: (stream: MediaStream | null) => void;
  onRemoteMedia: (state: { muted: boolean; video: boolean }) => void;
  /** Both people are in the room. */
  onConnected: () => void;
  /** The other person left (or their connection dropped for good). */
  onPeerLeft: () => void;
  /** We lost the room and LiveKit couldn't reconnect. */
  onDisconnected: () => void;
}

export class MediaSession {
  private readonly room = new Room({ adaptiveStream: false, dynacast: true });
  private readonly published = new Map<'audio' | 'video', LocalTrackPublication>();
  private leaving = false;
  private remoteStream: MediaStream | null = null;

  constructor(private readonly events: MediaEvents) {
    const update = () => this.update();
    this.room
      .on(RoomEvent.ParticipantConnected, () => {
        update();
        events.onConnected();
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        update();
        if (!this.leaving) events.onPeerLeft();
      })
      .on(RoomEvent.TrackSubscribed, update)
      .on(RoomEvent.TrackUnsubscribed, update)
      .on(RoomEvent.TrackMuted, update)
      .on(RoomEvent.TrackUnmuted, update)
      .on(RoomEvent.TrackPublished, update)
      .on(RoomEvent.TrackUnpublished, update)
      .on(RoomEvent.Disconnected, () => {
        if (!this.leaving) events.onDisconnected();
      });
  }

  async join(url: string, token: string, stream: MediaStream) {
    await this.room.connect(url, token);
    for (const track of stream.getTracks()) await this.publish(track);
    this.update();
    if (this.peer()) this.events.onConnected();
  }

  async setMuted(muted: boolean) {
    const pub = this.published.get('audio');
    if (pub) await (muted ? pub.mute() : pub.unmute());
  }

  /** Swaps the camera track (null turns the camera off) without reconnecting. */
  async setVideoTrack(track: MediaStreamTrack | null) {
    const current = this.published.get('video');
    this.published.delete('video');
    if (current?.track) await this.room.localParticipant.unpublishTrack(current.track, false);
    if (track) await this.publish(track);
  }

  leave() {
    this.leaving = true;
    void this.room.disconnect();
  }

  private async publish(track: MediaStreamTrack) {
    if (this.leaving) return;
    const kind = track.kind === 'video' ? 'video' : 'audio';
    const pub = await this.room.localParticipant.publishTrack(track, {
      source: kind === 'video' ? Track.Source.Camera : Track.Source.Microphone,
      // The tracks belong to the controller (it stops them when the call ends).
      stopMicTrackOnMute: false,
    });
    this.published.set(kind, pub);
  }

  private peer(): RemoteParticipant | undefined {
    return this.room.remoteParticipants.values().next().value;
  }

  private update() {
    const peer = this.peer();
    if (!peer) {
      if (this.remoteStream) this.events.onRemoteStream((this.remoteStream = null));
      return;
    }
    const tracks: MediaStreamTrack[] = [];
    for (const pub of peer.trackPublications.values()) {
      if (!pub.isSubscribed || !pub.track) continue;
      if (pub.kind === Track.Kind.Video && pub.isMuted) continue;
      tracks.push(pub.track.mediaStreamTrack);
    }
    const same =
      this.remoteStream &&
      this.remoteStream.getTracks().length === tracks.length &&
      tracks.every((t) => this.remoteStream!.getTracks().includes(t));
    if (!same) this.events.onRemoteStream((this.remoteStream = tracks.length ? new MediaStream(tracks) : null));
    this.events.onRemoteMedia({ muted: !peer.isMicrophoneEnabled, video: peer.isCameraEnabled });
  }
}
