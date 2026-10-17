import type { ThemeMode } from './branding/brand.config';
import { brand } from './branding/brand.config';
import { RINGTONE_IDS, type RingtoneId } from './calls/ringtone';
import { readJson, storageKey, type KeyValueStore } from './lib/storage';

export interface Settings {
  theme: ThemeMode;
  noiseSuppression: boolean;
  startWithVideo: boolean;
  ringSound: boolean;
  ringtone: RingtoneId;
}

// The key must match the pre-paint theme script that vite.brand.ts writes into index.html.
export const SETTINGS_KEY = storageKey('settings');

export const DEFAULT_SETTINGS: Settings = {
  theme: brand.theme.defaultMode,
  noiseSuppression: true,
  startWithVideo: false,
  ringSound: true,
  ringtone: 'classic',
};

export function loadSettings(store: KeyValueStore): Settings {
  const saved = readJson<Partial<Settings>>(store, SETTINGS_KEY) ?? {};
  const theme = saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system' ? saved.theme : DEFAULT_SETTINGS.theme;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    theme,
    noiseSuppression: bool(saved.noiseSuppression, DEFAULT_SETTINGS.noiseSuppression),
    startWithVideo: bool(saved.startWithVideo, DEFAULT_SETTINGS.startWithVideo),
    ringSound: bool(saved.ringSound, DEFAULT_SETTINGS.ringSound),
    ringtone: RINGTONE_IDS.includes(saved.ringtone as RingtoneId) ? (saved.ringtone as RingtoneId) : DEFAULT_SETTINGS.ringtone,
  };
}

export function saveSettings(store: KeyValueStore, s: Settings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** Reflects the theme choice on <html>; "system" defers to the OS via CSS. */
export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
}
