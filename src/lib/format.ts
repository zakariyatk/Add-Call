/** 5 → "0:05", 62 → "1:02", 3723 → "1:02:03". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Keeps digits, a leading "+", and the keypad's * and #. */
export function normalizeNumber(input: string): string {
  const trimmed = input.trim();
  const body = trimmed.replace(/[^\d*#]/g, '');
  return trimmed.startsWith('+') ? `+${body}` : body;
}

/** A number is worth dialling once it has at least three digits. */
export const isDialable = (input: string) => normalizeNumber(input).replace(/\D/g, '').length >= 3;

/** Readable grouping for display: "+91 98765 43210", "+1 415 555 0132", "98765 43210". */
export function formatPhone(input: string): string {
  const n = normalizeNumber(input);
  if (/^\+91\d{10}$/.test(n)) return `+91 ${n.slice(3, 8)} ${n.slice(8)}`;
  if (/^\+1\d{10}$/.test(n)) return `+1 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
  if (/^\d{10}$/.test(n)) return `${n.slice(0, 5)} ${n.slice(5)}`;
  return n;
}

/** "Just now", "5m ago", "3h ago", "Yesterday", "Mon", "12 Sep". */
export function formatRelative(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const then = new Date(at);
  const today = new Date(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(then)) / 86_400_000);
  if (days === 0) return `${Math.floor(min / 60)}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return then.toLocaleDateString('en-GB', { weekday: 'short' });
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Priya Sharma" → "PS", "madonna" → "M", a bare number → "#". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return '#';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}
