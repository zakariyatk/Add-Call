/*
 * Signaling protocol shared by the browser and the server (server/signaling.ts).
 * Messages are JSON over a WebSocket at /ws. The server only introduces peers
 * and relays WebRTC offers, answers and ICE candidates; audio and video flow
 * directly between the browsers (or through TURN when configured). The socket
 * is authenticated by the session cookie when it opens.
 *
 * Keep this file free of imports: it is compiled for both runtimes.
 */

export const SIGNALING_PATH = '/ws';
/** An unanswered call stops ringing after this long. */
export const RING_TIMEOUT_MS = 30_000;
export const MAX_MESSAGE_BYTES = 64 * 1024;

export interface UserInfo {
  email: string;
  name: string;
}

export interface PresenceUser extends UserInfo {
  /** In a call or ringing. */
  busy: boolean;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** WebRTC payloads relayed between the two browsers in a call. */
export type SignalData =
  | { sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } }
  | { media: { muted: boolean; video: boolean } };

export type EndReason = 'declined' | 'busy' | 'offline' | 'timeout' | 'hangup' | 'disconnected' | 'cancelled' | 'failed';

export type ClientMessage =
  | { type: 'call'; callId: string; to: string; video: boolean }
  | { type: 'accept'; callId: string }
  | { type: 'decline'; callId: string }
  | { type: 'hangup'; callId: string }
  | { type: 'signal'; callId: string; data: SignalData };

export type ServerMessage =
  | { type: 'welcome'; you: UserInfo; iceServers: IceServer[] }
  | { type: 'presence'; users: PresenceUser[] }
  | { type: 'incoming'; callId: string; from: UserInfo; video: boolean }
  | { type: 'ringing'; callId: string; to: UserInfo }
  | { type: 'accepted'; callId: string }
  | { type: 'ended'; callId: string; reason: EndReason }
  | { type: 'signal'; callId: string; data: SignalData }
  /** Another tab or device signed in with the same address. */
  | { type: 'replaced' }
  /** This login session ended (signed out elsewhere, password changed). */
  | { type: 'signed-out' }
  | { type: 'error'; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL.test(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{6,64}$/.test(v);

function isSignalData(d: unknown): d is SignalData {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if ('sdp' in o) {
    const s = o.sdp as Record<string, unknown> | null;
    return !!s && (s.type === 'offer' || s.type === 'answer') && typeof s.sdp === 'string';
  }
  if ('candidate' in o) {
    const c = o.candidate as Record<string, unknown> | null;
    return !!c && typeof c.candidate === 'string';
  }
  if ('media' in o) {
    const m = o.media as Record<string, unknown> | null;
    return !!m && typeof m.muted === 'boolean' && typeof m.video === 'boolean';
  }
  return false;
}

/** Validates an untrusted message from a client; null when malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  switch (m.type) {
    case 'call':
      return isId(m.callId) && isEmail(m.to) && typeof m.video === 'boolean'
        ? { type: 'call', callId: m.callId, to: m.to.toLowerCase(), video: m.video }
        : null;
    case 'accept':
    case 'decline':
    case 'hangup':
      return isId(m.callId) ? { type: m.type, callId: m.callId } : null;
    case 'signal':
      return isId(m.callId) && isSignalData(m.data) ? { type: 'signal', callId: m.callId, data: m.data } : null;
    default:
      return null;
  }
}
