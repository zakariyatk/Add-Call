import { describe, expect, it } from 'vitest';
import { memoryStore } from '../lib/storage';
import { createAuth, MIN_PASSWORD, nameFromEmail, SignInError } from './session';

describe('demo auth', () => {
  it('signs in, persists, and signs out', () => {
    const store = memoryStore();
    const auth = createAuth(store, () => 1000);
    expect(auth.current()).toBeNull();
    const s = auth.signIn('  Priya.Sharma@Example.com ', 'secret1');
    expect(s).toEqual({ email: 'priya.sharma@example.com', displayName: 'Priya Sharma', signedInAt: 1000 });
    expect(createAuth(store).current()).toEqual(s);
    auth.signOut();
    expect(auth.current()).toBeNull();
  });

  it('rejects bad input', () => {
    const auth = createAuth(memoryStore());
    expect(() => auth.signIn('not-an-email', 'secret1')).toThrow(SignInError);
    expect(() => auth.signIn('a@b.co', 'x'.repeat(MIN_PASSWORD - 1))).toThrow(/at least/);
  });

  it('ignores corrupt stored sessions', () => {
    const store = memoryStore();
    store.setItem('addcall.session', '{broken');
    expect(createAuth(store).current()).toBeNull();
    store.setItem('addcall.session', JSON.stringify({ email: 42 }));
    expect(createAuth(store).current()).toBeNull();
  });

  it('derives a display name from the email', () => {
    expect(nameFromEmail('john_doe-smith@x.io')).toBe('John Doe Smith');
  });
});
