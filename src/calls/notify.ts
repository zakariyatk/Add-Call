import { brand } from '../branding/brand.config';
import type { Peer } from './types';

/*
 * System notifications for incoming calls, so a call is noticed when the tab
 * is in the background or minimised. The browser only shows them after the
 * user allows notifications (Settings → Calling).
 */

export type NotifyPermission = NotificationPermission | 'unsupported';

export const notifyPermission = (): NotifyPermission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows "Incoming call" if the tab isn't in front. Returns a function that closes it. */
export function notifyIncomingCall(callId: string, peer: Peer, video: boolean): () => void {
  if (notifyPermission() !== 'granted' || (document.visibilityState === 'visible' && document.hasFocus())) return () => {};
  let n: Notification;
  try {
    n = new Notification(video ? 'Incoming video call' : 'Incoming call', {
      body: `${peer.name} (${peer.email}) is calling you on ${brand.name}.`,
      tag: `call-${callId}`,
      icon: '/icons/icon-192.png',
      requireInteraction: true,
    });
  } catch {
    return () => {}; // e.g. Android Chrome only allows notifications from a service worker
  }
  // Clicking it brings the tab forward, where Accept and Decline are waiting.
  n.onclick = () => {
    window.focus();
    n.close();
  };
  return () => n.close();
}
