import { readJson, storageKey, type KeyValueStore } from '../lib/storage';

/*
 * Demo sign-in. There is no account backend yet: any well-formed email with a
 * password of at least MIN_PASSWORD characters signs in, and the session is
 * kept in the browser. Swap `signIn` for a real API call when one exists — the
 * rest of the app only depends on the Session shape.
 */

export interface Session {
  email: string;
  displayName: string;
  signedInAt: number;
}

export const MIN_PASSWORD = 6;
const KEY = storageKey('session');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SignInError extends Error {}

/** "priya.sharma@example.com" → "Priya Sharma". */
export function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function createAuth(store: KeyValueStore, now: () => number = Date.now) {
  return {
    current(): Session | null {
      const s = readJson<Session>(store, KEY);
      return s && typeof s.email === 'string' && EMAIL.test(s.email) ? s : null;
    },
    signIn(email: string, password: string): Session {
      const e = email.trim().toLowerCase();
      if (!EMAIL.test(e)) throw new SignInError('Enter a valid email address.');
      if (password.length < MIN_PASSWORD) throw new SignInError(`Password must be at least ${MIN_PASSWORD} characters.`);
      const session: Session = { email: e, displayName: nameFromEmail(e) || e, signedInAt: now() };
      store.setItem(KEY, JSON.stringify(session));
      return session;
    },
    signOut(): void {
      store.removeItem(KEY);
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
