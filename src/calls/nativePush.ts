import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { browserStore, storageKey } from '../lib/storage';
import { supabase } from '../lib/supabase';
import type { PushState, WorkerMessage } from './push';

/*
 * Call notifications in the Android app: Firebase Cloud Messaging instead of
 * Web Push (the WebView has none). The native side (CallPushPlugin,
 * CallMessagingService) shows the incoming-call screen while the app is
 * closed; this file saves the phone's token for the signed-in account and
 * passes the notification buttons that opened the app on to it.
 */

interface CallPushPlugin {
  status(): Promise<{ available: boolean; permission: 'granted' | 'denied' | 'prompt'; fullScreen: boolean }>;
  register(options: { prompt: boolean }): Promise<{ token: string }>;
  unregister(): Promise<void>;
  cancelCall(options: { callId: string }): Promise<void>;
  openFullScreenSettings(): Promise<void>;
  addListener(event: 'action', fn: (action: WorkerMessage) => void): Promise<PluginListenerHandle>;
  addListener(event: 'token', fn: (data: { token: string }) => void): Promise<PluginListenerHandle>;
}

const CallPush = registerPlugin<CallPushPlugin>('CallPush');

const store = browserStore();
/** Asked for the notification permission once, at the first sign-in (calls are the point of the app). */
const askedKey = storageKey('nativePush.asked');
/** Turned off in Settings: don't turn it back on by itself. */
const offKey = storageKey('nativePush.off');

let savedToken: string | null = null;

async function save(token: string) {
  const { error } = await supabase.rpc('save_fcm_token', { p_token: token });
  if (error) throw new Error(error.message);
  savedToken = token;
}

export async function nativePushState(): Promise<PushState> {
  try {
    const s = await CallPush.status();
    if (!s.available) return 'unsupported';
    if (s.permission === 'denied') return 'denied';
    return s.permission === 'granted' && store.getItem(offKey) !== '1' ? 'on' : 'off';
  } catch {
    return 'unsupported';
  }
}

/** Settings → Call notifications on: asks for permission if needed and saves this phone. */
export async function enableNativePush(): Promise<PushState> {
  try {
    const { token } = await CallPush.register({ prompt: true });
    await save(token);
  } catch (err) {
    if ((err as { code?: string }).code === 'denied') return 'denied';
    throw err;
  }
  store.removeItem(offKey);
  return 'on';
}

/** Stops calls for the signed-in account ringing this phone. */
export async function disableNativePush({ keepDevice = false } = {}): Promise<void> {
  const token = savedToken ?? (await CallPush.register({ prompt: false }).then((r) => r.token, () => null));
  if (token) await supabase.rpc('delete_fcm_token', { p_token: token });
  savedToken = null;
  if (!keepDevice) {
    store.setItem(offKey, '1');
    await CallPush.unregister().catch(() => {});
  }
}

/**
 * After sign-in: saves this phone for whoever is signed in now. The first
 * time, it asks for the notification permission straight away, since ringing
 * is what the app is for; after that it never asks by itself.
 */
export async function syncNativePush(): Promise<void> {
  if (store.getItem(offKey) === '1') return;
  const prompt = store.getItem(askedKey) !== '1';
  store.setItem(askedKey, '1');
  try {
    const { token } = await CallPush.register({ prompt });
    await save(token);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'denied' && code !== 'unavailable') console.warn('[push] could not save this phone', err);
  }
}

/** Whether Android lets the incoming-call screen fill a locked phone (Android 14+ asks). */
export const canShowFullScreen = () => CallPush.status().then((s) => s.available && s.fullScreen, () => true);
export const openFullScreenSettings = () => CallPush.openFullScreenSettings();

/** Stops this phone's notification ringing for a call answered or ended in the app. */
export function cancelNativeCall(callId: string) {
  void CallPush.cancelCall({ callId }).catch(() => {});
}

/** Answer / show call / open chat, from the notification that opened the app; and new tokens to save. */
export function onNativeAction(fn: (m: WorkerMessage) => void): () => void {
  const handles = [
    CallPush.addListener('action', fn),
    CallPush.addListener('token', ({ token }) => {
      if (savedToken) void save(token).catch((err) => console.warn('[push] could not save this phone', err));
    }),
  ];
  return () => handles.forEach((h) => void h.then((x) => x.remove()));
}
