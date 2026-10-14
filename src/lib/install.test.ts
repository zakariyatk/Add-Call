import { describe, expect, it } from 'vitest';
import { chooseInstallMode } from './install';

const base = { native: false, standalone: false, installed: false, canPrompt: false, ios: false };

describe('chooseInstallMode', () => {
  it('offers the browser install dialog when the browser allows it', () => {
    expect(chooseInstallMode({ ...base, canPrompt: true })).toBe('prompt');
  });

  it('shows Add to Home Screen steps on iPhone and iPad', () => {
    expect(chooseInstallMode({ ...base, ios: true })).toBe('ios');
  });

  it('shows nothing once installed, in the Android app, or where install is impossible', () => {
    expect(chooseInstallMode({ ...base, canPrompt: true, standalone: true })).toBe('none');
    expect(chooseInstallMode({ ...base, canPrompt: true, installed: true })).toBe('none');
    expect(chooseInstallMode({ ...base, ios: true, native: true })).toBe('none');
    expect(chooseInstallMode(base)).toBe('none');
  });
});
