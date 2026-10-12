import type { EndReason } from './protocol';
import type { CallRecord, Peer } from './types';

/*
 * Call lifecycle as a pure reducer. The CallController feeds it call-row and
 * LiveKit events; the UI renders from it.
 *
 *   outgoing: idle → calling → ringing → connecting → connected → ended → idle
 *   incoming: idle → incoming → connecting → connected → ended → idle
 *   any active state → ended (hang up, decline, busy, offline, timeout, failure)
 */

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'ended';

export interface CallState {
  status: CallStatus;
  callId: string | null;
  direction: 'outgoing' | 'incoming' | null;
  peer: Peer | null;
  startedAt: number | null;
  connectedAt: number | null;
  endedAt: number | null;
  endReason: EndReason | null;
  /** The call was answered (by either side). */
  answered: boolean;
  /** The caller asked for video. */
  videoRequested: boolean;
  muted: boolean;
  video: boolean;
  remoteMuted: boolean;
  remoteVideo: boolean;
}

export type CallAction =
  | { type: 'dial'; callId: string; peer: Peer; video: boolean; at: number }
  | { type: 'ringing'; callId: string; peer: Peer }
  | { type: 'incoming'; callId: string; peer: Peer; video: boolean; at: number }
  | { type: 'accept'; video: boolean }
  | { type: 'accepted'; callId: string }
  | { type: 'connected'; at: number }
  | { type: 'setMuted'; muted: boolean }
  | { type: 'setVideo'; video: boolean }
  | { type: 'remoteMedia'; muted: boolean; video: boolean }
  | { type: 'end'; reason: EndReason; at: number; callId?: string }
  | { type: 'reset' };

export const IDLE: CallState = {
  status: 'idle',
  callId: null,
  direction: null,
  peer: null,
  startedAt: null,
  connectedAt: null,
  endedAt: null,
  endReason: null,
  answered: false,
  videoRequested: false,
  muted: false,
  video: false,
  remoteMuted: false,
  remoteVideo: false,
};

// Explicitly boolean: an inferred type guard would wrongly narrow state that changes across awaits.
export const isActive = (s: CallStatus): boolean => s !== 'idle' && s !== 'ended';

export function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'dial':
      if (isActive(state.status)) return state; // one call at a time
      return {
        ...IDLE,
        status: 'calling',
        callId: action.callId,
        direction: 'outgoing',
        peer: action.peer,
        startedAt: action.at,
        videoRequested: action.video,
        video: action.video,
      };
    case 'ringing':
      return state.status === 'calling' && state.callId === action.callId ? { ...state, status: 'ringing', peer: action.peer } : state;
    case 'incoming':
      if (isActive(state.status)) return state;
      return {
        ...IDLE,
        status: 'incoming',
        callId: action.callId,
        direction: 'incoming',
        peer: action.peer,
        startedAt: action.at,
        videoRequested: action.video,
        remoteVideo: action.video,
      };
    case 'accept':
      return state.status === 'incoming' ? { ...state, status: 'connecting', answered: true, video: action.video } : state;
    case 'accepted':
      return (state.status === 'calling' || state.status === 'ringing') && state.callId === action.callId
        ? { ...state, status: 'connecting', answered: true }
        : state;
    case 'connected':
      return state.status === 'connecting' ? { ...state, status: 'connected', connectedAt: state.connectedAt ?? action.at } : state;
    case 'setMuted':
      return isActive(state.status) ? { ...state, muted: action.muted } : state;
    case 'setVideo':
      return isActive(state.status) ? { ...state, video: action.video } : state;
    case 'remoteMedia':
      return isActive(state.status) ? { ...state, remoteMuted: action.muted, remoteVideo: action.video } : state;
    case 'end':
      if (!isActive(state.status) || (action.callId && action.callId !== state.callId)) return state;
      return { ...state, status: 'ended', endedAt: action.at, endReason: action.reason };
    case 'reset':
      return state.status === 'ended' ? IDLE : state;
  }
}

/** Seconds connected so far (or in total, once ended). */
export function connectedSeconds(state: CallState, now: number): number {
  if (state.connectedAt === null) return 0;
  return Math.max(0, Math.floor(((state.endedAt ?? now) - state.connectedAt) / 1000));
}

/** The history entry for a call that has ended. */
export function toRecord(state: CallState): CallRecord | null {
  if (state.status !== 'ended' || !state.peer || state.startedAt === null || !state.callId) return null;
  if (state.endReason === 'elsewhere') return null; // the other tab or device keeps the record
  return {
    id: state.callId,
    peer: state.peer,
    direction: state.direction === 'outgoing' ? 'outgoing' : state.answered ? 'incoming' : 'missed',
    at: state.startedAt,
    duration: connectedSeconds(state, state.endedAt ?? state.startedAt),
    video: state.videoRequested || state.video,
  };
}

/** What the call screen says about how a call ended. */
export function endReasonText(state: CallState): string {
  const who = state.peer?.name ?? 'They';
  switch (state.endReason) {
    case 'declined':
      return state.direction === 'outgoing' ? 'Call declined' : 'Declined';
    case 'busy':
      return `${who} is on another call`;
    case 'offline':
      return `${who} isn't online right now`;
    case 'timeout':
      return state.direction === 'outgoing' ? 'No answer' : 'Missed call';
    case 'cancelled':
      return state.direction === 'outgoing' ? 'Call cancelled' : 'Missed call';
    case 'disconnected':
      return 'Connection lost';
    case 'failed':
      return 'Call failed';
    case 'elsewhere':
      return 'Answered on another device';
    default:
      return 'Call ended';
  }
}
