import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelative, initials } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [62, '1:02'],
    [3723, '1:02:03'],
    [-4, '0:00'],
  ])('%i s → %s', (s, out) => expect(formatDuration(s)).toBe(out));
});

describe('formatRelative', () => {
  const now = new Date('2026-10-11T15:00:00').getTime();
  const ago = (ms: number) => formatRelative(now - ms, now);
  it('reads naturally', () => {
    expect(ago(20_000)).toBe('Just now');
    expect(ago(5 * 60_000)).toBe('5m ago');
    expect(ago(3 * 3_600_000)).toBe('3h ago');
    expect(formatRelative(new Date('2026-10-10T20:00:00').getTime(), now)).toBe('Yesterday');
    expect(formatRelative(new Date('2026-09-12T10:00:00').getTime(), now)).toBe('12 Sept');
  });
});

describe('initials', () => {
  it.each([
    ['Priya Sharma', 'PS'],
    ['madonna', 'M'],
    ['Jean Luc Picard', 'JP'],
    ['+91 98765', '#'],
  ])('%s → %s', (name, out) => expect(initials(name)).toBe(out));
});
