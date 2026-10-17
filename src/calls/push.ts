import { isNativeApp } from '../lib/platform';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { cancelNativeCall, disableNativePush, enableNativePush, nativePushState, onNativeAction, syncNativePush } from './nativePush';

/*
 * Web Push for incoming calls: lets a call ring this browser (as a system
 * notification) even when no Add Call tab is open. The service worker
 * (public/sw.js) shows the notification; the call-push Edge Function sends it.
 *
 * iPhone and iPad only allow it once Add Call is added to the Home Screen.
 * The Android app uses Firebase instead (nativePush.ts), behind the same
 * functions.
 */

export type PushState =
  /** Notifications are on for this browser and the account. */
  | 'on'
  /** Can be turned on. */
  | 'off'
  /** The person blocked notifications for this site. */
  | 'denied'
  /** iOS Safari in a normal tab: needs Add to Home Screen first. */
  | 'needs-install'
  | 'unsupported';

/** A notification button that opened the app, read from the URL once. */
export type LaunchAction = { type: 'answer'; callId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Messages from the service worker (notification buttons) to an open tab. */
export type WorkerMessage = { type: 'answer' | 'decline' | 'show' | 'open' | 'open-chat'; callId?: string; conversationId?: string };

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers public/sw.js once. Safe to call often; resolves null where unsupported. */
export function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((err) => {
    console.warn('[push] service worker', err);
    return null;
  });
  return registration;
}

export async function pushState(): Promise<PushState> {
  if (isNativeApp) return nativePushState();
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registerWorker();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** base64url (VAPID public key) → bytes for PushManager.subscribe. */
export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  });
  if (error) throw new Error(error.message);
}

/** Asks for permission (must follow a tap) and saves this browser's subscription. */
export async function enablePush(): Promise<PushState> {
  if (isNativeApp) return enableNativePush();
  if (!pushSupported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registerWorker();
  if (!reg) throw new Error('This browser can’t receive call notifications.');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/call-push`);
    const { publicKey, error } = (await res.json().catch(() => ({}))) as { publicKey?: string; error?: string };
    if (!publicKey) throw new Error(error ?? 'Call notifications aren’t available right now.');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  }
  await save(sub);
  return 'on';
}

/**
 * Stops calls for the signed-in account ringing this browser. Signing out keeps
 * the browser's subscription (`keepBrowser`), so the next sign-in rings it again
 * without asking; turning notifications off in Settings removes it.
 */
export async function disablePush({ keepBrowser = false } = {}): Promise<void> {
  if (isNativeApp) return disableNativePush({ keepDevice: keepBrowser });
  const reg = pushSupported() ? await registerWorker() : null;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  if (!keepBrowser) await sub.unsubscribe().catch(() => false);
}

/** After sign-in: re-saves an existing subscription, so it belongs to whoever is signed in now. */
export async function syncPush(): Promise<void> {
  if (isNativeApp) return syncNativePush();
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await registerWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await save(sub).catch((err) => console.warn('[push] could not save subscription', err));
}

/** Reads (and removes) ?answer=<call id>, left by the notification's Answer button. */
export function takeLaunchAction(): LaunchAction | null {
  const url = new URL(window.location.href);
  const callId = url.searchParams.get('answer');
  if (!callId) return null;
  url.searchParams.delete('answer');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return UUID.test(callId) ? { type: 'answer', callId } : null;
}

/** Listens for Answer / Decline taps relayed by the service worker. */
export function onWorkerMessage(fn: (m: WorkerMessage) => void): () => void {
  if (isNativeApp) return onNativeAction((m) => (!m.callId || UUID.test(m.callId)) && (!m.conversationId || UUID.test(m.conversationId)) && fn(m));
  if (!('serviceWorker' in navigator)) return () => {};
  const handler = (e: MessageEvent) => {
    const m = e.data as WorkerMessage | null;
    if (!m || typeof m.type !== 'string') return;
    if ((m.callId === undefined || UUID.test(m.callId)) && (m.conversationId === undefined || UUID.test(m.conversationId))) fn(m);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

/** Closes the service worker's notification for a call answered or ended in this tab. */
export function closeCallNotification(callId: string): void {
  if (isNativeApp) return cancelNativeCall(callId);
  void registerWorker().then(async (reg) => {
    for (const n of (await reg?.getNotifications({ tag: `call-${callId}` })) ?? []) n.close();
  });
}
