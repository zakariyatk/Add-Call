import { describe, expect, it } from 'vitest';
import { inviteUrl, usernameFromPath } from './inviteLink';

describe('inviteUrl', () => {
  it('puts @username after the website', () => {
    expect(inviteUrl('https://call.adddots.com', 'priya')).toBe('https://call.adddots.com/@priya');
    expect(inviteUrl('https://call.adddots.com/', 'priya.s')).toBe('https://call.adddots.com/@priya.s');
  });
});

describe('usernameFromPath', () => {
  it('reads the username from an invite link', () => {
    expect(usernameFromPath('/@priya')).toBe('priya');
    expect(usernameFromPath('/@Priya_S/')).toBe('priya_s');
    expect(usernameFromPath('/@bob.builder')).toBe('bob.builder');
  });

  it('ignores other paths and invalid names', () => {
    for (const p of ['/', '/privacy', '/@', '/@ab', '/@bob/extra', '/@bob-builder', '/@%E0%A4', '/x/@bob']) expect(usernameFromPath(p)).toBeNull();
  });
});
