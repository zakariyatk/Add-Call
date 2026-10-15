import { brand } from '../branding/brand.config';

/** A link that opens Add Call; with a username it also opens "Add friend" for them. */
export function inviteLink(username?: string | null): string {
  const base = window.location.origin + window.location.pathname;
  return username ? `${base}#/add/${encodeURIComponent(username)}` : base;
}

/**
 * Shares the app (and my @username) with the phone's share sheet, or copies
 * the link where there is none. Resolves to what happened, for a short notice.
 */
export async function shareInvite(username?: string | null): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = inviteLink(username);
  const text = username
    ? `Call and chat with me on ${brand.name}. My username is @${username}.`
    : `Call and chat with me on ${brand.name}.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: brand.name, text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
