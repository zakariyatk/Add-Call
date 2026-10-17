import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { rememberAvatar } from '../profile/avatars';
import { forgetContact } from './contacts';
import { toPerson, type Person } from '../profile/username';

/*
 * Blocking and reporting. Blocking works both ways (see the safety
 * migration): neither person can call or message the other until the blocker
 * unblocks, and blocking takes them off your list. Only you can see who you
 * blocked. Reports go to the team, never to the person reported.
 */

interface State {
  blocked: Person[];
  loaded: boolean;
}

let state: State = { blocked: [], loaded: false };
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

async function load(userId: string) {
  const { data, error } = await supabase.rpc('list_blocks');
  if (owner !== userId) return;
  if (error) return console.warn('[blocks]', error.message);
  const blocked = ((data ?? []) as Parameters<typeof toPerson>[0][]).map(toPerson);
  for (const p of blocked) rememberAvatar(p.email, p.avatarPath, p.username);
  set({ blocked, loaded: true });
}

export async function blockUser(person: Person): Promise<void> {
  const before = state;
  if (!state.blocked.some((p) => p.id === person.id)) set({ ...state, blocked: [person, ...state.blocked] });
  const { error } = await supabase.rpc('block_user', { p_user: person.id });
  if (error) {
    set(before);
    throw new Error(error.message || 'Could not block this person.');
  }
  forgetContact(person.id);
}

export async function unblockUser(id: string): Promise<void> {
  const before = state;
  set({ ...state, blocked: state.blocked.filter((p) => p.id !== id) });
  const { error } = await supabase.rpc('unblock_user', { p_user: id });
  if (error) {
    set(before);
    throw new Error(error.message || 'Could not unblock this person.');
  }
}

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'other';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam or scam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Nudity, violence or hateful content' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'other', label: 'Something else' },
];

export const REPORT_DETAILS_MAX = 1000;

/** Sends a report about someone (and optionally one message they sent you). */
export async function reportUser(userId: string, reason: ReportReason, details: string, messageId?: string): Promise<void> {
  const { error } = await supabase.rpc('report_user', {
    p_user: userId,
    p_reason: reason,
    p_details: details.trim().slice(0, REPORT_DETAILS_MAX),
    p_message: messageId ?? null,
  });
  if (error) throw new Error(error.message || 'Could not send the report.');
}

/** The people you blocked, loaded while someone is signed in. */
export function useBlocks(userId: string | null) {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (owner === userId) return;
    owner = userId;
    set({ blocked: [], loaded: false });
    if (userId) void load(userId);
  }, [userId]);
  const isBlocked = useCallback((id: string) => snapshot.blocked.some((p) => p.id === id), [snapshot.blocked]);
  return { ...snapshot, isBlocked };
}
