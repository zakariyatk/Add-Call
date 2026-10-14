import { isNativeApp } from './platform';

/*
 * "Install the app" support. Chromium browsers (Chrome, Edge, Samsung Internet,
 * Android) fire `beforeinstallprompt` when the site is installable; we keep the
 * event so a button can open the browser's own install dialog. iPhone and iPad
 * have no such event, so there people are shown how to use Share → Add to Home
 * Screen instead. The listener is added when this module loads, because the
 * event can fire before React has rendered anything.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** What the install popup should offer. */
export type InstallMode = 'none' | 'prompt' | 'ios';

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own popup instead of the browser's mini-bar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Pure decision, kept separate so it can be tested. */
export function chooseInstallMode(env: { native: boolean; standalone: boolean; installed: boolean; canPrompt: boolean; ios: boolean }): InstallMode {
  if (env.native || env.standalone || env.installed) return 'none';
  if (env.canPrompt) return 'prompt';
  return env.ios ? 'ios' : 'none';
}

export const installMode = (): InstallMode =>
  chooseInstallMode({ native: isNativeApp, standalone: isStandalone(), installed, canPrompt: !!deferred, ios: isIos() });

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the browser's install dialog. Resolves true if the person installed. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // each event can be used once
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}
