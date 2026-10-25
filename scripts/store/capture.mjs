/* Store screenshots, step 1: the real app, with sample people and chats.

   Runs the app (npm run dev -- --port 5175) in Edge as a made-up signed-in
   user. Nothing reaches the real Supabase project: every request to it is
   answered here from the sample data below, and the live connection (who's
   online, ringing) is played by a stand-in. The faces are the sample photos
   in public/people. Saves one raw screen per scene to out/raw; compose.mjs
   turns them into the store images. */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const raw = join(here, 'out', 'raw');
mkdirSync(raw, { recursive: true });
const APP = process.env.APP_URL || 'http://localhost:5175/';
const only = process.argv[2] || 'all';          /* desk | phone | all */
const SUPA = 'zqwuztvbpfifmkwtjyyk';

/* ---------------- the sample world ---------------- */

const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const ME = { id: 'u-me', email: 'zak@example.com', name: 'Zak', username: 'zak' };
const P = [
  { id: 'u-1', email: 'priya@example.com', name: 'Priya Sharma', username: 'priya', face: 1, online: true },
  { id: 'u-2', email: 'omar@example.com', name: 'Omar Haddad', username: 'omar.h', face: 2, online: true, busy: true },
  { id: 'u-3', email: 'lena@example.com', name: 'Lena Fischer', username: 'lena', face: 3, online: true },
  { id: 'u-4', email: 'arjun@example.com', name: 'Arjun Rao', username: 'arjun', face: 4, online: false },
  { id: 'u-5', email: 'sara@example.com', name: 'Sara Novak', username: 'sara.n', face: 5, online: true },
  { id: 'u-6', email: 'maya@example.com', name: 'Maya Chen', username: 'maya', face: 6, online: false },
  { id: 'u-7', email: 'ammi@example.com', name: 'Ammi', username: 'ammi', face: 7, online: true }
];
const avatar = (p) => 'face-' + p.face + '.jpg';
const personRow = (p) => ({ id: p.id, email: p.email, name: p.name, username: p.username, avatar_path: avatar(p) });

let mid = 0;
function msg(conv, from, kind, body, minAgo, extra = {}) {
  const mine = from === ME.id;
  const peer = conv.peer;
  return Object.assign({
    id: 'm-' + (++mid), conversation_id: conv.id, sender_id: from, recipient_id: mine ? peer.id : ME.id,
    kind, body, attachment_path: null, attachment_name: null, attachment_size: null, attachment_mime: null,
    duration_ms: null, width: null, height: null, created_at: ago(minAgo),
    delivered_at: ago(minAgo - 0.2), read_at: mine ? ago(minAgo - 1) : ago(minAgo - 0.5), deleted_at: null
  }, extra);
}
const CONV = [
  { id: '00000000-0000-4000-8000-000000000001', peer: P[0], unread: 2 },
  { id: '00000000-0000-4000-8000-000000000002', peer: P[6], unread: 0 },
  { id: '00000000-0000-4000-8000-000000000003', peer: P[2], unread: 1 },
  { id: '00000000-0000-4000-8000-000000000004', peer: P[1], unread: 0 },
  { id: '00000000-0000-4000-8000-000000000005', peer: P[4], unread: 0 },
  { id: '00000000-0000-4000-8000-000000000006', peer: P[3], unread: 0 }
];
const MSGS = {
  '00000000-0000-4000-8000-000000000001': (c) => [
    msg(c, c.peer.id, 'text', 'Hey! Are we still on for the site visit tomorrow?', 64),
    msg(c, ME.id, 'text', 'Yes, 10 am at the new office 👍', 61),
    msg(c, c.peer.id, 'image', 'The lobby is finished!', 40, { attachment_path: 'demo/lobby.jpg', attachment_name: 'lobby.jpg', attachment_mime: 'image/jpeg', width: 1200, height: 900 }),
    msg(c, ME.id, 'text', 'Wow, that looks amazing 😍', 38),
    msg(c, ME.id, 'sticker', 'star-struck', 38),
    msg(c, c.peer.id, 'voice', '', 6, { attachment_path: 'demo/voice.webm', attachment_name: 'voice.webm', attachment_mime: 'audio/webm', duration_ms: 23000 }),
    msg(c, c.peer.id, 'text', 'Call me when you’re free?', 5, { read_at: null })
  ],
  '00000000-0000-4000-8000-000000000002': (c) => [msg(c, c.peer.id, 'text', 'Did you eat? 🙂', 80), msg(c, ME.id, 'text', 'Yes Ammi, call you tonight ❤️', 75)],
  '00000000-0000-4000-8000-000000000003': (c) => [msg(c, c.peer.id, 'sticker', 'party-popper', 130, { read_at: null })],
  '00000000-0000-4000-8000-000000000004': (c) => [msg(c, ME.id, 'text', 'Sent the drawings, check page 3', 300)],
  '00000000-0000-4000-8000-000000000005': (c) => [msg(c, c.peer.id, 'file', '', 1500, { attachment_path: 'demo/brief.pdf', attachment_name: 'Project brief.pdf', attachment_size: 1843200, attachment_mime: 'application/pdf' })],
  '00000000-0000-4000-8000-000000000006': (c) => [msg(c, ME.id, 'voice', '', 2900, { attachment_path: 'demo/v2.webm', attachment_name: 'v2.webm', attachment_mime: 'audio/webm', duration_ms: 41000 })]
};
const messages = {};
for (const c of CONV) messages[c.id] = MSGS[c.id](c);
function convRow(c) {
  const list = messages[c.id], last = list[list.length - 1];
  return {
    id: c.id, peer_id: c.peer.id, peer_email: c.peer.email, peer_name: c.peer.name, peer_avatar: avatar(c.peer), peer_username: c.peer.username,
    updated_at: last.created_at, unread: c.unread,
    last_id: last.id, last_sender_id: last.sender_id, last_kind: last.kind, last_body: last.body, last_attachment_name: last.attachment_name,
    last_duration_ms: last.duration_ms, last_created_at: last.created_at, last_delivered_at: last.delivered_at, last_read_at: last.read_at, last_deleted_at: null
  };
}
const HISTORY = [
  { p: P[0], direction: 'incoming', min: 12, duration: 754, video: true },
  { p: P[6], direction: 'outgoing', min: 95, duration: 1832, video: false },
  { p: P[1], direction: 'missed', min: 180, duration: 0, video: false },
  { p: P[2], direction: 'outgoing', min: 60 * 26, duration: 312, video: true },
  { p: P[4], direction: 'incoming', min: 60 * 30, duration: 95, video: false },
  { p: P[3], direction: 'missed', min: 60 * 50, duration: 0, video: true },
  { p: P[5], direction: 'outgoing', min: 60 * 74, duration: 1210, video: false }
].map((h, i) => ({ id: 'h-' + i, peer: { email: h.p.email, name: h.p.name, id: h.p.id }, direction: h.direction, at: NOW - h.min * 60000, duration: h.duration, video: h.video }));

/* a JWT-shaped token: the app only reads it, nothing checks it */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(NOW / 1000) + 3600 * 12;
const TOKEN = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: ME.id, email: ME.email, role: 'authenticated', exp: EXP, aud: 'authenticated' }) + '.sig';
const USER = { id: ME.id, aud: 'authenticated', role: 'authenticated', email: ME.email, email_confirmed_at: ago(99999),
  user_metadata: { name: ME.name, full_name: ME.name }, app_metadata: { provider: 'email' }, created_at: ago(99999) };
const SESSION = { access_token: TOKEN, refresh_token: 'demo', expires_in: 3600 * 12, expires_at: EXP, token_type: 'bearer', user: USER };

const face = (n) => readFileSync(join(root, 'public', 'people', 'face-' + n + '.jpg'));
const LOBBY = readFileSync(join(here, 'assets', 'lobby.jpg'));

/* ---------------- answering the app's requests ---------------- */

let ringing = null;     /* a call row to ring with, while set */
const RPC = {
  list_conversations: () => CONV.map(convRow),
  list_contacts: () => P.filter((p) => p.id !== 'u-7' || true).map(personRow),
  list_blocks: () => [],
  get_avatars: (body) => P.filter((p) => (body.p_emails || []).includes(p.email)).map((p) => ({ email: p.email, avatar_path: avatar(p), username: p.username })),
  find_person: () => [personRow(P[5])],
  username_problem: () => null,
  mark_read: () => null, mark_delivered: () => null, save_push_subscription: () => null, can_ring_offline: () => true,
  start_call: () => [{ ok: true }], end_call: () => null
};
async function supabase(route) {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path.startsWith('/auth/v1/user')) return json(USER);
  if (path.startsWith('/auth/v1/settings')) return json({ external: { google: true, email: true } });
  if (path.startsWith('/auth/v1/')) return json(SESSION);
  if (path.startsWith('/rest/v1/rpc/')) {
    const name = path.split('/').pop();
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* none */ }
    const fn = RPC[name];
    if (!fn) console.log('  (no answer for rpc', name + ')');
    return json(fn ? fn(body) : null);
  }
  if (path === '/rest/v1/messages') {
    const id = (url.searchParams.get('conversation_id') || '').replace('eq.', '');
    return json([...(messages[id] || [])].reverse());
  }
  if (path === '/rest/v1/profiles') return json(url.searchParams.get('select')?.includes('username') && req.headers()['accept']?.includes('vnd.pgrst.object') ? { username: ME.username, avatar_path: null } : [{ username: ME.username, avatar_path: null }]);
  if (path === '/rest/v1/calls') return json(ringing ? [ringing] : []);
  if (path.startsWith('/storage/v1/object/public/avatars/')) {
    const n = (path.match(/face-(\d)/) || [])[1] || 1;
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: face(n) });
  }
  if (path.startsWith('/storage/v1/object/sign/') && req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'image/jpeg', body: LOBBY });
  if (path.startsWith('/storage/v1/object/sign/')) {
    const file = path.split('/').pop();
    return json({ signedURL: '/object/sign/chat-media/demo/' + file + '?token=demo' });
  }
  if (path.includes('/storage/v1/object/') && path.includes('lobby')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: LOBBY });
  if (path.startsWith('/functions/v1/')) return json({});
  console.log('  (unanswered', req.method(), path + ')');
  return json({});
}

/* the live connection (Phoenix channels, protocol 2.0.0: arrays
   [join_ref, ref, topic, event, payload]): every join succeeds, and the
   "online" channel lists who's in the app */
function realtime(ws) {
  ws.onMessage((data) => {
    let m;
    try { m = JSON.parse(String(data)); } catch (e) { return; }
    const arr = Array.isArray(m);
    const [joinRef, ref, topic, event, payload] = arr ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
    const send = (jr, r, t, ev, pl) => ws.send(JSON.stringify(arr ? [jr, r, t, ev, pl] : { join_ref: jr, ref: r, topic: t, event: ev, payload: pl }));
    if (event === 'heartbeat') return send(null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} });
    if (event === 'phx_join') {
      const pg = (payload?.config?.postgres_changes || []).map((c, i) => Object.assign({ id: 1000 + i }, c));
      send(joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pg } });
      if (/online/.test(topic)) {
        const state = {};
        for (const p of P) if (p.online) state[p.id] = { metas: [{ phx_ref: 'r-' + p.id, busy: !!p.busy, email: '', name: '' }] };
        setTimeout(() => send(joinRef, null, topic, 'presence_state', state), 200);
      }
      return;
    }
    if (event === 'phx_leave') return send(joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} });
    if (ref) send(joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} });
  });
}

/* ---------------- the browser ---------------- */

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

async function open(kind, theme) {
  const desk = kind === 'desk';
  const ctx = await browser.newContext(desk
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme }
    : { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, colorScheme: theme });
  await ctx.route('https://' + SUPA + '.supabase.co/**', supabase);
  await ctx.routeWebSocket(/supabase\.co\/realtime/, realtime);
  await ctx.addInitScript(([session, key, hist, email, histKey]) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem(histKey, JSON.stringify(hist));
  }, [SESSION, 'sb-' + SUPA + '-auth-token', HISTORY, ME.email, 'addcall.history.' + ME.email]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[' + kind + '] pageerror', e.message));
  await p.goto(APP + '#/chats');
  await p.waitForTimeout(3500);
  return { ctx, p };
}
const settle = (p, ms) => p.waitForTimeout(ms || 1500);
async function shot(p, name) {
  await settle(p);
  await p.screenshot({ path: join(raw, name + '.png') });
  console.log('saved', name);
}
async function go(p, hash) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await settle(p, 2000);
}
async function ring(p, who, video) {
  ringing = { id: 'call-demo', caller_id: who.id, callee_id: ME.id, caller_name: who.name, caller_email: who.email, callee_name: ME.name, callee_email: ME.email,
    video, status: 'ringing', end_reason: null, created_at: new Date().toISOString(), answered_at: null, ended_at: null };
  /* the app checks for ringing calls when its inbox (re)joins: wake it */
  await p.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await p.reload();
  await settle(p, 4000);
}

async function scenes(kind) {
  const { ctx, p } = await open(kind, 'light');
  const desk = kind === 'desk';
  const pre = desk ? 'd' : 'p';

  await go(p, '#/chats');
  await shot(p, pre + '1-chats');
  await go(p, '#/chats/00000000-0000-4000-8000-000000000001');
  await shot(p, pre + '2-chat');
  await go(p, '#/recents');
  await shot(p, pre + '3-calls');
  await go(p, '#/people');
  await shot(p, pre + '4-people');
  await go(p, '#/settings');
  await shot(p, pre + '5-settings');

  /* the sticker panel, in a chat */
  await go(p, '#/chats/00000000-0000-4000-8000-000000000001');
  const smiley = await p.$('button[aria-label*="ticker" i], button[aria-label*="emoji" i]');
  if (smiley) { await smiley.click(); await settle(p, 1200); await shot(p, pre + '6-stickers'); await p.keyboard.press('Escape'); }
  else console.log('no sticker button');

  /* an incoming video call */
  await go(p, '#/chats');
  await ring(p, P[0], true);
  await shot(p, pre + '7-incoming');
  ringing = null;
  await ctx.close();

  /* dark theme */
  const d = await open(kind, 'dark');
  await go(d.p, '#/chats/00000000-0000-4000-8000-000000000001');
  await shot(d.p, pre + '8-dark-chat');
  await d.ctx.close();
}

if (only === 'all' || only === 'desk') await scenes('desk');
if (only === 'all' || only === 'phone') await scenes('phone');
await browser.close();
