import { describe, expect, it } from 'vitest';
import { sameSession, type Session } from './api';

const alice: Session = { id: 'a', email: 'a@x.com', name: 'Alice', google: false, emailVerified: true };

describe('sameSession', () => {
  it('treats a token refresh for the same account as the same session', () => {
    expect(sameSession(alice, { ...alice })).toBe(true);
  });

  it('notices real changes', () => {
    expect(sameSession(alice, { ...alice, id: 'b' })).toBe(false);
    expect(sameSession(alice, { ...alice, name: 'Alice M' })).toBe(false);
    expect(sameSession(alice, { ...alice, emailVerified: false })).toBe(false);
    expect(sameSession(alice, null)).toBe(false);
    expect(sameSession(null, null)).toBe(true);
  });
});
