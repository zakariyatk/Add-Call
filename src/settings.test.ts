import { describe, expect, it } from 'vitest';
import { memoryStore } from './lib/storage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from './settings';

describe('settings', () => {
  it('defaults, round-trips and repairs bad values', () => {
    const store = memoryStore();
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    saveSettings(store, { ...DEFAULT_SETTINGS, theme: 'dark', ringSound: false });
    expect(loadSettings(store)).toMatchObject({ theme: 'dark', ringSound: false });
    store.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'neon', noiseSuppression: 'yes' }));
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });
});
