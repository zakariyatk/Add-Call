/** Contact-book helpers for the People page: A–Z sections and the search filter. */

export interface Section<T> {
  letter: string;
  people: T[];
}

/** The section a name sorts under: its first letter, or # for digits, symbols and other scripts. */
export function letterOf(name: string): string {
  const first = name.trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** Sorts people by name into A–Z sections, with # last. */
export function groupByLetter<T extends { name: string }>(people: T[]): Section<T>[] {
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const sections = new Map<string, T[]>();
  for (const p of sorted) {
    const letter = letterOf(p.name);
    sections.set(letter, [...(sections.get(letter) ?? []), p]);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map(([letter, people]) => ({ letter, people }));
}

/** True when a name, @username or email contains what was typed (case-insensitive, leading @ ignored). */
export function matchesQuery(p: { name: string; username: string | null; email: string }, query: string): boolean {
  const q = query.trim().replace(/^@+/, '').toLowerCase();
  if (!q) return true;
  return [p.name, p.username ?? '', p.email].some((s) => s.toLowerCase().includes(q));
}
