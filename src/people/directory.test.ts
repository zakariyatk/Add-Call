import { describe, expect, it } from 'vitest';
import { groupByLetter, letterOf, matchesQuery } from './directory';

const p = (name: string, username: string | null = null, email = `${name.toLowerCase()}@x.com`) => ({ name, username, email });

describe('letterOf', () => {
  it('uses the first letter, ignoring case and accents', () => {
    expect(letterOf('aisha')).toBe('A');
    expect(letterOf('  Émile')).toBe('E');
  });

  it('puts digits, symbols and other scripts under #', () => {
    for (const n of ['42', '_bob', 'محمد', '']) expect(letterOf(n)).toBe('#');
  });
});

describe('groupByLetter', () => {
  it('sorts into A–Z sections with # last', () => {
    const sections = groupByLetter([p('omar'), p('Faris'), p('9lives'), p('Aisha'), p('Fatima')]);
    expect(sections.map((s) => s.letter)).toEqual(['A', 'F', 'O', '#']);
    expect(sections[1].people.map((x) => x.name)).toEqual(['Faris', 'Fatima']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByLetter([])).toEqual([]);
  });
});

describe('matchesQuery', () => {
  const hana = p('Hana Yusuf', 'hana.y', 'hana@mail.com');

  it('matches name, username or email', () => {
    expect(matchesQuery(hana, 'yusuf')).toBe(true);
    expect(matchesQuery(hana, '@HANA.Y')).toBe(true);
    expect(matchesQuery(hana, 'mail.com')).toBe(true);
    expect(matchesQuery(hana, 'omar')).toBe(false);
  });

  it('matches everyone when nothing is typed', () => {
    expect(matchesQuery(hana, '  @ ')).toBe(true);
  });
});
