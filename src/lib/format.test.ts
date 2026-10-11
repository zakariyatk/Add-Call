import { describe, expect, it } from 'vitest';
import { formatDuration, formatPhone, formatRelative, initials, isDialable, normalizeNumber } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [62, '1:02'],
    [3723, '1:02:03'],
    [-4, '0:00'],
  ])('%i s → %s', (s, out) => expect(formatDuration(s)).toBe(out));
});

describe('phone numbers', () => {
  it('normalises input, keeping a leading + and keypad symbols', () => {
    expect(normalizeNumber(' +91 98765-43210 ')).toBe('+919876543210');
    expect(normalizeNumber('(415) 555 0132')).toBe('4155550132');
    expect(normalizeNumber('*123#')).toBe('*123#');
  });

  it('formats common shapes', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+14155550132')).toBe('+1 415 555 0132');
    expect(formatPhone('9876543210')).toBe('98765 43210');
    expect(formatPhone('+4420')).toBe('+4420');
  });

  it('needs three digits to dial', () => {
    expect(isDialable('12')).toBe(false);
    expect(isDialable('+1 2')).toBe(false);
    expect(isDialable('100')).toBe(true);
  });
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
