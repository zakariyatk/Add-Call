import { describe, expect, it } from 'vitest';
import { handle, normalizeUsername, suggestUsername, usernameProblem } from './username';

describe('usernameProblem', () => {
  it('accepts Instagram-style handles', () => {
    for (const u of ['priya', 'priya.sharma', 'bob_builder', 'a1b', 'x_._y', 'abc123'.padEnd(30, 'z')]) expect(usernameProblem(u)).toBeNull();
  });

  it('explains what is wrong', () => {
    expect(usernameProblem('ab')).toMatch(/at least 3/);
    expect(usernameProblem('a'.repeat(31))).toMatch(/30 characters/);
    expect(usernameProblem('bob builder')).toMatch(/only letters/);
    expect(usernameProblem('bob-builder')).toMatch(/only letters/);
    expect(usernameProblem('.bob')).toMatch(/start or end/);
    expect(usernameProblem('bob.')).toMatch(/start or end/);
    expect(usernameProblem('bo..b')).toMatch(/two periods/);
    expect(usernameProblem('12345')).toMatch(/one letter/);
  });
});

describe('normalizeUsername', () => {
  it('drops @, spaces and capitals', () => {
    expect(normalizeUsername('  @Priya.Sharma ')).toBe('priya.sharma');
    expect(normalizeUsername('Bob Builder')).toBe('bobbuilder');
  });
});

describe('suggestUsername', () => {
  it('builds a valid handle from the name, else the email', () => {
    expect(suggestUsername('Priya Sharma', 'p@x.com')).toBe('priya.sharma');
    expect(suggestUsername('José Ñúñez', 'j@x.com')).toBe('jose.nunez');
    expect(suggestUsername('', 'bob.builder+1@x.com')).toBe('bob.builder.1');
    expect(suggestUsername('李', '42@x.com')).toBe('42.call');
    expect(usernameProblem(suggestUsername('李', '42@x.com'))).toBeNull();
  });
});

describe('handle', () => {
  it('adds the @', () => {
    expect(handle('priya')).toBe('@priya');
    expect(handle(null, 'priya@x.com')).toBe('priya@x.com');
  });
});
