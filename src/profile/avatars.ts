import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { squareImage } from '../chat/media';

/*
 * Profile pictures. Files live in the public "avatars" bucket under
 * <user id>/<random>.webp (see the chat_and_avatars migration); profiles keep
 * the path. Everyone's picture is looked up by email, in batches, and cached
 * here, so any <Avatar email=…> shows it without extra wiring.
 */

/** email → public URL, or null for "no picture" (also cached, so it isn't asked again). */
const urls = new Map<string, string | null>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const notify = () => listeners.forEach((fn) => fn());

export const avatarUrl = (path: string | null | undefined): string | null =>
  path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;

/** Records what we already know (e.g. from the conversation list), without asking the server. */
export function rememberAvatar(email: string, path: string | null | undefined): void {
  const url = avatarUrl(path);
  if (urls.get(email) === url) return;
  urls.set(email, url);
  notify();
}

/** Forgets everyone's picture (after signing in as someone else). */
export function resetAvatars(): void {
  urls.clear();
  pending.clear();
  notify();
}

async function flush() {
  flushTimer = null;
  const emails = [...pending];
  pending.clear();
  if (!emails.length) return;
  for (const e of emails) if (!urls.has(e)) urls.set(e, null);
  const { data, error } = await supabase.rpc('get_avatars', { p_emails: emails });
  if (error) {
    for (const e of emails) urls.delete(e); // try again next time it's shown
    return;
  }
  for (const row of (data ?? []) as { email: string; avatar_path: string | null }[]) urls.set(row.email, avatarUrl(row.avatar_path));
  notify();
}

function request(email: string) {
  if (urls.has(email) || pending.has(email)) return;
  pending.add(email);
  flushTimer ??= setTimeout(() => void flush(), 30);
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The picture for an email (null while unknown or when there is none). */
export function useAvatarUrl(email: string | null | undefined): string | null {
  const url = useSyncExternalStore(subscribe, () => (email ? (urls.get(email) ?? null) : null));
  useEffect(() => {
    if (email) request(email);
  }, [email]);
  return url;
}

/** Crops a chosen photo to a square, uploads it and makes it your picture. */
export async function uploadAvatar(file: File, me: { id: string; email: string }): Promise<void> {
  const blob = await squareImage(file, 512);
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${me.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(error.message || 'Could not upload your picture.');
  const { data: old, error: setError } = await supabase.rpc('set_avatar', { p_path: path });
  if (setError) {
    void supabase.storage.from('avatars').remove([path]);
    throw new Error(setError.message || 'Could not save your picture.');
  }
  if (typeof old === 'string' && old) void supabase.storage.from('avatars').remove([old]);
  rememberAvatar(me.email, path);
}

export async function removeAvatar(me: { email: string }): Promise<void> {
  const { data: old, error } = await supabase.rpc('set_avatar', { p_path: null });
  if (error) throw new Error(error.message || 'Could not remove your picture.');
  if (typeof old === 'string' && old) void supabase.storage.from('avatars').remove([old]);
  rememberAvatar(me.email, null);
}
