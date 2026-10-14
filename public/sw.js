/*
 * Add Call service worker: shows incoming calls pushed by the call-push Edge
 * Function, even when no Add Call tab is open. It caches nothing and doesn't
 * touch network requests, so the app always loads fresh from the server.
 *
 * Incoming call: a notification with Answer / Decline that re-alerts (sound
 * and vibration) every few seconds while the call rings, like a phone.
 * Answer opens the app and picks up; Decline ends the call without opening it.
 */

const RING_MS = 30_000; // matches RING_TIMEOUT_MS in src/calls/protocol.ts
const REALERT_EVERY_MS = 6_000;
const VIBRATE = [700, 300, 700, 300, 700];
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/favicon-32.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const tagOf = (callId) => `call-${callId}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appClients = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });
/** An Add Call tab the person is looking at rings on its own. */
const appInFront = async () => (await appClients()).some((c) => c.visibilityState === 'visible' && c.focused);

function incomingOptions(call, renotify) {
  const who = call.name && call.name !== call.email ? `${call.name} (${call.email})` : call.email;
  return {
    body: `${who} is calling you.`,
    tag: tagOf(call.callId),
    renotify,
    requireInteraction: true,
    icon: ICON,
    badge: BADGE,
    vibrate: VIBRATE,
    timestamp: call.at,
    data: call,
    actions: [
      { action: 'decline', title: 'Decline' },
      { action: 'answer', title: 'Answer' },
    ],
  };
}

async function showMissed(call) {
  await self.registration.showNotification('Missed call', {
    body: `${call.name || call.email}${call.video ? ' tried to video call you.' : ' tried to call you.'}`,
    tag: tagOf(call.callId),
    icon: ICON,
    badge: BADGE,
    data: { type: 'missed', callId: call.callId },
  });
}

async function current(callId) {
  const [n] = await self.registration.getNotifications({ tag: tagOf(callId) });
  return n;
}

async function ring(call) {
  const title = call.video ? 'Incoming video call' : 'Incoming call';
  if (Date.now() - call.at > RING_MS) return showMissed(call);
  await self.registration.showNotification(title, incomingOptions(call, true));
  // Keep alerting until it's answered, declined, replaced by "Missed call" or
  // times out (the caller's app then sends "Missed call" if it's still open).
  while (Date.now() - call.at + REALERT_EVERY_MS < RING_MS) {
    await sleep(REALERT_EVERY_MS);
    const n = await current(call.callId);
    if (!n || n.data?.type !== 'incoming') return;
    if (await appInFront()) return;
    await self.registration.showNotification(title, incomingOptions(call, true));
  }
  await sleep(Math.max(0, RING_MS - (Date.now() - call.at)));
  const n = await current(call.callId);
  if (n && n.data?.type === 'incoming') n.close();
}

self.addEventListener('push', (event) => {
  let msg;
  try {
    msg = event.data?.json();
  } catch {
    return;
  }
  if (!msg || typeof msg.callId !== 'string') return;
  if (msg.type === 'incoming') event.waitUntil(ring(msg));
  else if (msg.type === 'missed') event.waitUntil(showMissed(msg));
});

async function tellApp(message) {
  const clients = await appClients();
  const client = clients.find((c) => c.focused) ?? clients[0];
  if (!client) return false;
  client.postMessage(message);
  return true;
}

async function openApp(message) {
  const clients = await appClients();
  const client = clients.find((c) => c.focused) ?? clients[0];
  if (client) {
    client.postMessage(message);
    try {
      await client.focus();
    } catch {
      /* not allowed: the message still reaches the tab */
    }
    return;
  }
  const params = message.type === 'answer' ? `?answer=${encodeURIComponent(message.callId)}` : '';
  await self.clients.openWindow(`/${params}#/recents`);
}

async function decline(call) {
  if (await tellApp({ type: 'decline', callId: call.callId })) return;
  if (!call.declineUrl || !call.declineToken) return;
  try {
    await fetch(call.declineUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline', callId: call.callId, token: call.declineToken }),
    });
  } catch {
    /* offline: the caller's ring times out */
  }
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  if (data.type !== 'incoming') return event.waitUntil(openApp({ type: 'open', callId: data.callId }));
  const stale = Date.now() - data.at > RING_MS;
  if (event.action === 'decline') return event.waitUntil(stale ? Promise.resolve() : decline(data));
  // Answer, or a tap on the notification itself (iOS and desktops without buttons).
  event.waitUntil(openApp({ type: stale ? 'open' : event.action === 'answer' ? 'answer' : 'show', callId: data.callId }));
});
