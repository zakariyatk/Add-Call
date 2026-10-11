import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol';

const p = (m: unknown) => parseClientMessage(typeof m === 'string' ? m : JSON.stringify(m));

describe('parseClientMessage', () => {
  it('accepts well-formed messages and normalises addresses', () => {
    expect(p({ type: 'call', callId: 'abcdef12', to: 'X@Y.io', video: true })).toEqual({ type: 'call', callId: 'abcdef12', to: 'x@y.io', video: true });
    expect(p({ type: 'hangup', callId: 'abcdef12' })).toEqual({ type: 'hangup', callId: 'abcdef12' });
    expect(p({ type: 'signal', callId: 'abcdef12', data: { sdp: { type: 'offer', sdp: 'v=0' } } })).not.toBeNull();
    expect(p({ type: 'signal', callId: 'abcdef12', data: { candidate: { candidate: 'candidate:1' } } })).not.toBeNull();
    expect(p({ type: 'signal', callId: 'abcdef12', data: { media: { muted: true, video: false } } })).not.toBeNull();
  });

  it('rejects anything malformed', () => {
    for (const bad of [
      'not json',
      'null',
      { type: 'nope' },
      // Identity comes from the session cookie; clients can't claim one.
      { type: 'hello', email: 'a@b.co', name: 'Ann' },
      { type: 'call', callId: '../../etc', to: 'a@b.co', video: false },
      { type: 'call', callId: 'abcdef12', to: 'a@b.co' },
      { type: 'signal', callId: 'abcdef12', data: { sdp: { type: 'pranswer', sdp: '' } } },
      { type: 'signal', callId: 'abcdef12', data: { candidate: null } },
      { type: 'signal', callId: 'abcdef12', data: { evil: true } },
    ])
      expect(p(bad)).toBeNull();
  });
});
