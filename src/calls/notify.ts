import { brand } from '../branding/brand.config';
import { closeCallNotification, registerWorker } from './push';
import type { Peer } from './types';

/*
 * System notifications for incoming calls, so a call is noticed when the tab
 * is in the background or minimised. The browser only shows them after the
 * user allows notifications (Settings → Calling). With no tab open at all,
 * calls arrive as Web Push instead (see push.ts and public/sw.js).
 */

export type NotifyPermission = NotificationPermission | 'unsupported';

export const notifyPermission = (): NotifyPermission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/** Shows "Incoming call" if the tab isn't in front. Returns a function that closes it. */
export function notifyIncomingCall(callId: string, peer: Peer, video: boolean): () => void {
  if (notifyPermission() !== 'granted' || (document.visibilityState === 'visible' && document.hasFocus())) return () => {};
  // Through the service worker where there is one: that works on Android too,
  // gets Answer / Decline buttons, and replaces a pushed notification for the
  // same call instead of adding a second one.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const at = Date.now();
    void registerWorker().then((reg) =>
      reg?.showNotification(video ? 'Incoming video call' : 'Incoming call', {
        body: `${peer.name} (${peer.email}) is calling you on ${brand.name}.`,
        tag: `call-${callId}`,
        icon: '/icons/icon-192.png',
        requireInteraction: true,
        data: { type: 'incoming', callId, name: peer.name, email: peer.email, video, at },
        actions: [
          { action: 'decline', title: 'Decline' },
          { action: 'answer', title: 'Answer' },
        ],
      } as NotificationOptions),
    );
    return () => closeCallNotification(callId);
  }
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
