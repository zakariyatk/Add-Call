import { describe, expect, it } from 'vitest';
import { callReducer, connectedSeconds, IDLE, toRecord, type CallAction, type CallState } from './callMachine';

const peer = { name: 'Aisha Khan', number: '+919876543210' };
const run = (actions: CallAction[], from: CallState = IDLE) => actions.reduce(callReducer, from);

describe('call lifecycle', () => {
  it('dials, rings, connects and ends', () => {
    const s = run([
      { type: 'dial', peer, at: 0 },
      { type: 'ring' },
      { type: 'connect', at: 2_000 },
      { type: 'toggle', control: 'muted' },
      { type: 'hangup', at: 65_000 },
    ]);
    expect(s.status).toBe('ended');
    expect(s.muted).toBe(true);
    expect(connectedSeconds(s, 999_999)).toBe(63);
    expect(toRecord(s, 'x')).toEqual({ id: 'x', name: 'Aisha Khan', number: peer.number, direction: 'outgoing', at: 0, duration: 63, video: false });
    expect(callReducer(s, { type: 'reset' })).toBe(IDLE);
  });

  it('records an unanswered call with no duration', () => {
    const s = run([{ type: 'dial', peer, at: 0, video: true }, { type: 'hangup', at: 4_000 }]);
    expect(toRecord(s, 'y')).toMatchObject({ duration: 0, video: true });
  });

  it('allows only one call at a time', () => {
    const s = run([{ type: 'dial', peer, at: 0 }]);
    expect(callReducer(s, { type: 'dial', peer: { name: null, number: '100' }, at: 5 })).toBe(s);
  });

  it('ignores events that do not fit the current state', () => {
    expect(run([{ type: 'connect', at: 1 }])).toBe(IDLE);
    expect(run([{ type: 'hangup', at: 1 }])).toBe(IDLE);
    expect(run([{ type: 'toggle', control: 'video' }])).toBe(IDLE);
    const ended = run([{ type: 'dial', peer, at: 0 }, { type: 'hangup', at: 1 }]);
    expect(callReducer(ended, { type: 'connect', at: 2 })).toBe(ended);
    expect(toRecord(IDLE, 'z')).toBeNull();
  });

  it('counts connected time live', () => {
    const s = run([{ type: 'dial', peer, at: 0 }, { type: 'connect', at: 1_000 }]);
    expect(connectedSeconds(s, 11_500)).toBe(10);
  });
});
