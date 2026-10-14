import { supabase } from '../lib/supabase';
import { isEmail } from '../calls/protocol';
import { rememberAvatar, rememberUsername } from './avatars';

/*
 * @usernames, like Instagram handles: 3–30 letters, numbers, periods and
 * underscores, not starting or ending with a period, no two periods in a row,
 * at least one letter. Stored lowercase and unique (see the
 * usernames_and_contacts migration, which has the same rules and the final say).
 */

export const USERNAME_MAX = 30;

/** Lowercase, drop a leading @ and spaces, keep only allowed characters. */
export function normalizeUsername(input: string): string {
  return input
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, USERNAME_MAX + 5);
}

/** Why a username can't be used (checked in the browser), or null. Taken names are checked by the server. */
export function usernameProblem(u: string): string | null {
  if (u.length < 3) return 'Use at least 3 characters.';
  if (u.length > USERNAME_MAX) return `Use ${USERNAME_MAX} characters or fewer.`;
  if (!/^[a-z0-9._]+$/.test(u)) return 'Use only letters, numbers, periods and underscores.';
  if (u.startsWith('.') || u.endsWith('.')) return 'A username can’t start or end with a period.';
  if (u.includes('..')) return 'A username can’t have two periods in a row.';
  if (/^[0-9._]+$/.test(u)) return 'Include at least one letter.';
  return null;
}

/** A first suggestion from someone's name or email ("Priya Sharma" → "priya.sharma"). */
export function suggestUsername(name: string, email: string): string {
  const from = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.{2,}/g, '.')
      .slice(0, USERNAME_MAX)
      .replace(/\.+$/, '');
  const candidates = [from(name), from(email.split('@')[0] ?? '')];
  return candidates.find((c) => !usernameProblem(c)) ?? (candidates.find((c) => c.length >= 1) ?? 'user') + '.call';
}

/** "@priya.sharma", or the fallback when there's no username yet. */
export const handle = (username: string | null | undefined, fallback = '') => (username ? `@${username}` : fallback);

/** The server's verdict: null when free (or already yours), else the reason. */
export async function checkUsername(u: string): Promise<string | null> {
  const local = usernameProblem(u);
  if (local) return local;
  const { data, error } = await supabase.rpc('username_problem', { p_username: u });
  if (error) throw new Error(error.message || 'Could not check this username.');
  return (data as string | null) ?? null;
}

export async function saveUsername(u: string, me: { email: string }): Promise<string> {
  const { data, error } = await supabase.rpc('set_username', { p_username: u });
  if (error) throw new Error(error.message || 'Could not save your username.');
  const saved = data as string;
  rememberUsername(me.email, saved);
  return saved;
}

/** Your own username and picture (null username: not chosen yet). */
export async function loadMyProfile(id: string, email: string): Promise<{ username: string | null; avatarPath: string | null }> {
  const { data, error } = await supabase.from('profiles').select('username, avatar_path').eq('id', id).maybeSingle<{ username: string | null; avatar_path: string | null }>();
  if (error) throw new Error(error.message);
  rememberAvatar(email, data?.avatar_path ?? null, data?.username ?? null);
  return { username: data?.username ?? null, avatarPath: data?.avatar_path ?? null };
}

export interface Person {
  id: string;
  username: string | null;
  name: string;
  email: string;
  avatarPath: string | null;
}

interface PersonRow {
  id: string;
  username: string | null;
  name: string;
  email: string;
  avatar_path: string | null;
}

export const toPerson = (r: PersonRow): Person => ({ id: r.id, username: r.username, name: r.name || r.username || r.email, email: r.email, avatarPath: r.avatar_path });

/** Finds one person by exact @username or email (null when nobody matches). */
export async function findPerson(query: string): Promise<Person | null> {
  const q = query.trim();
  const { data, error } = await supabase.rpc('find_person', { p_query: isEmail(q.toLowerCase()) ? q.toLowerCase() : normalizeUsername(q) });
  if (error) throw new Error(error.message || 'Could not search right now.');
  const row = (data as PersonRow[] | null)?.[0];
  if (!row) return null;
  rememberAvatar(row.email, row.avatar_path, row.username);
  return toPerson(row);
}
