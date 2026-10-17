import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { rememberAvatar } from '../profile/avatars';
import { isEmail } from '../calls/protocol';
import { normalizeUsername, toPerson, type Person } from '../profile/username';

/*
 * "My list": the people you've added (by @username or email). Only you can
 * see your list; calls and messages work with anyone, listed or not. Kept in
 * memory for the signed-in account and loaded once per sign-in.
 */

interface State {
  contacts: Person[];
  loaded: boolean;
}

let state: State = { contacts: [], loaded: false };
let owner: string | null = null;
const listeners = new Set<() => void>();
const set = (next: State) => {
  state = next;
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

async function load(userId: string) {
  const { data, error } = await supabase.rpc('list_contacts');
  if (owner !== userId) return;
  if (error) return console.warn('[contacts]', error.message);
  const contacts = ((data ?? []) as Parameters<typeof toPerson>[0][]).map(toPerson);
  for (const c of contacts) rememberAvatar(c.email, c.avatarPath, c.username);
  set({ contacts, loaded: true });
}

/** Adds someone by @username or email; resolves to them. */
export async function addContact(query: string): Promise<Person> {
  const q = query.trim();
  const { data, error } = await supabase.rpc('add_contact', { p_query: isEmail(q.toLowerCase()) ? q.toLowerCase() : normalizeUsername(q) });
  if (error) throw new Error(error.message || 'Could not add this person.');
  const row = (data as Parameters<typeof toPerson>[0][] | null)?.[0];
  if (!row) throw new Error('Could not add this person.');
  const person = toPerson(row);
  rememberAvatar(person.email, person.avatarPath, person.username);
  if (!state.contacts.some((c) => c.id === person.id)) set({ ...state, contacts: [...state.contacts, person].sort(byName) });
  return person;
}

export async function removeContact(id: string): Promise<void> {
  const before = state;
  set({ ...state, contacts: state.contacts.filter((c) => c.id !== id) });
  const { error } = await supabase.rpc('remove_contact', { p_contact: id });
  if (error) {
    set(before);
    throw new Error(error.message || 'Could not remove this person.');
  }
}

/** Takes someone off the list on this device only (the server already did, e.g. when blocking). */
export function forgetContact(id: string) {
  if (state.contacts.some((c) => c.id === id)) set({ ...state, contacts: state.contacts.filter((c) => c.id !== id) });
}

/** Your list, loaded while someone is signed in. */
export function useContacts(userId: string | null) {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (owner === userId) return;
    owner = userId;
    set({ contacts: [], loaded: false });
    if (userId) void load(userId);
  }, [userId]);
  const isContact = useCallback((email: string) => snapshot.contacts.some((c) => c.email === email), [snapshot.contacts]);
  return { ...snapshot, isContact };
}

/** Runs an add/remove and keeps its error message for the screen. */
export function useContactAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, setError, run };
}
