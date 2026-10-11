import { describe, expect, it } from 'vitest';
import { callReducer, connectedSeconds, endReasonText, IDLE, toRecord, type CallAction, type CallState } from './callMachine';

const peer = { email: 'aisha@example.com', name: 'Aisha Khan' };
const run = (actions: CallAction[], from: CallState = IDLE) => actions.reduce(callReducer, from);
const dial: CallAction = { type: 'dial', callId: 'call-1', peer, video: false, at: 0 };
const incoming: CallAction = { type: 'incoming', callId: 'call-2', peer, video: true, at: 0 };

describe('outgoing call', () => {
  it('calls, rings, connects and hangs up', () => {
    const s = run([
      dial,
      { type: 'ringing', callId: 'call-1', peer },
      { type: 'accepted', callId: 'call-1' },
      { type: 'connected', at: 2_000 },
      { type: 'setMuted', muted: true },
      { type: 'remoteMedia', muted: false, video: true },
      { type: 'end', reason: 'hangup', at: 65_000 },
    ]);
    expect(s).toMatchObject({ status: 'ended', muted: true, remoteVideo: true, endReason: 'hangup', answered: true });
    expect(connectedSeconds(s, 999_999)).toBe(63);
    expect(toRecord(s)).toEqual({ id: 'call-1', peer, direction: 'outgoing', at: 0, duration: 63, video: false });
    expect(callReducer(s, { type: 'reset' })).toBe(IDLE);
  });

  it('records an unanswered call with no duration', () => {
    const s = run([{ ...dial, video: true }, { type: 'end', reason: 'timeout', at: 30_000 }]);
    expect(toRecord(s)).toMatchObject({ direction: 'outgoing', duration: 0, video: true });
    expect(endReasonText(s)).toBe('No answer');
  });

  it('explains busy and offline', () => {
    expect(endReasonText(run([dial, { type: 'end', reason: 'busy', at: 1 }]))).toBe('Aisha Khan is on another call');
    expect(endReasonText(run([dial, { type: 'end', reason: 'offline', at: 1 }]))).toBe("Aisha Khan isn't online right now");
  });
});

describe('incoming call', () => {
  it('answers and logs as incoming', () => {
    const s = run([incoming, { type: 'accept', video: false }, { type: 'connected', at: 1_000 }, { type: 'end', reason: 'hangup', at: 11_000 }]);
    expect(toRecord(s)).toMatchObject({ id: 'call-2', direction: 'incoming', duration: 10, video: true });
  });

  it('logs as missed when the caller gives up or it is declined', () => {
    expect(toRecord(run([incoming, { type: 'end', reason: 'cancelled', at: 5 }]))?.direction).toBe('missed');
    expect(endReasonText(run([incoming, { type: 'end', reason: 'cancelled', at: 5 }]))).toBe('Missed call');
    expect(toRecord(run([incoming, { type: 'end', reason: 'declined', at: 5 }]))?.direction).toBe('missed');
  });

  it('starts with the caller’s camera state', () => {
    expect(run([incoming]).remoteVideo).toBe(true);
  });
});

describe('guards', () => {
  it('allows only one call at a time', () => {
    const s = run([dial]);
    expect(callReducer(s, incoming)).toBe(s);
    expect(callReducer(s, { ...dial, callId: 'other' })).toBe(s);
  });

  it('ignores events for another call or the wrong state', () => {
    expect(run([{ type: 'connected', at: 1 }])).toBe(IDLE);
    expect(run([{ type: 'end', reason: 'hangup', at: 1 }])).toBe(IDLE);
    expect(run([{ type: 'setVideo', video: true }])).toBe(IDLE);
    const s = run([dial]);
    expect(callReducer(s, { type: 'accepted', callId: 'nope' })).toBe(s);
    expect(callReducer(s, { type: 'end', reason: 'hangup', at: 1, callId: 'nope' })).toBe(s);
    expect(callReducer(s, { type: 'accept', video: false })).toBe(s);
    expect(toRecord(IDLE)).toBeNull();
  });

  it('counts connected time live', () => {
    const s = run([dial, { type: 'accepted', callId: 'call-1' }, { type: 'connected', at: 1_000 }]);
    expect(connectedSeconds(s, 11_500)).toBe(10);
  });
});
