import type { CallRecord, Peer } from './types';

/*
 * Call lifecycle as a pure reducer, so it is testable and a real calling
 * backend (WebRTC, SIP, a CPaaS SDK) can later drive the same states:
 *
 *   idle → dialing → ringing → connected → ended → idle
 *                 ↘──────────↘────────────↗ (hang up at any point)
 */

export type CallStatus = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended';
export type CallControl = 'muted' | 'speaker' | 'video';

export interface CallState {
  status: CallStatus;
  peer: Peer | null;
  startedAt: number | null;
  connectedAt: number | null;
  endedAt: number | null;
  muted: boolean;
  speaker: boolean;
  video: boolean;
}

export type CallAction =
  | { type: 'dial'; peer: Peer; at: number; video?: boolean }
  | { type: 'ring' }
  | { type: 'connect'; at: number }
  | { type: 'toggle'; control: CallControl }
  | { type: 'hangup'; at: number }
  | { type: 'reset' };

export const IDLE: CallState = {
  status: 'idle',
  peer: null,
  startedAt: null,
  connectedAt: null,
  endedAt: null,
  muted: false,
  speaker: false,
  video: false,
};

const active = (s: CallStatus) => s === 'dialing' || s === 'ringing' || s === 'connected';

export function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case 'dial':
      if (active(state.status)) return state; // one call at a time
      return { ...IDLE, status: 'dialing', peer: action.peer, startedAt: action.at, video: !!action.video };
    case 'ring':
      return state.status === 'dialing' ? { ...state, status: 'ringing' } : state;
    case 'connect':
      return state.status === 'dialing' || state.status === 'ringing'
        ? { ...state, status: 'connected', connectedAt: action.at }
        : state;
    case 'toggle':
      return active(state.status) ? { ...state, [action.control]: !state[action.control] } : state;
    case 'hangup':
      return active(state.status) ? { ...state, status: 'ended', endedAt: action.at } : state;
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
export function toRecord(state: CallState, id: string): CallRecord | null {
  if (state.status !== 'ended' || !state.peer || state.startedAt === null) return null;
  return {
    id,
    name: state.peer.name,
    number: state.peer.number,
    direction: 'outgoing',
    at: state.startedAt,
    duration: connectedSeconds(state, state.endedAt ?? state.startedAt),
    video: state.video,
  };
}
