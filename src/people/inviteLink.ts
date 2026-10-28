import { normalizeUsername, usernameProblem } from '../profile/username';

/*
 * Personal invite links: https://call.adddots.com/@username. Opening one shows
 * that person in People, ready to add (public/.htaccess serves the app there).
 */

/** The link that opens your profile in People. */
export const inviteUrl = (website: string, username: string) => `${website.replace(/\/+$/, '')}/@${username}`;

/** The username in an invite link's path ("/@priya" → "priya"), or null when the path isn't one. */
export function usernameFromPath(pathname: string): string | null {
  const m = /^\/@([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const u = normalizeUsername(raw);
  return usernameProblem(u) ? null : u;
}
