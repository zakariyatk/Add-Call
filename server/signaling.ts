import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import {
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  RING_TIMEOUT_MS,
  SIGNALING_PATH,
  type ClientMessage,
  type EndReason,
  type IceServer,
  type ServerMessage,
  type UserInfo,
} from '../src/calls/protocol.ts';

/*
 * WebRTC signaling: presence, call invitations and relaying of SDP / ICE
 * between the two parties of a call. It never sees audio or video.
 *
 * Every connection is authenticated from the session cookie on the WebSocket
 * upgrade (see `authenticate`), so a browser can only appear as the account it
 * is signed in to. Unauthenticated upgrades get 401.
 */

export interface Identity {
  user: UserInfo;
  /** Which login session this connection belongs to (for sign-out). */
  sessionId: string;
}

export interface SignalingOptions {
  /** Resolves the signed-in user for an upgrade request, or null to refuse it. */
  authenticate: (req: IncomingMessage) => Identity | null;
  iceServers?: IceServer[];
  ringTimeoutMs?: number;
  /** Extra origins allowed to connect, besides the page's own host. */
  allowedOrigins?: string[];
}

interface Client {
  ws: WebSocket;
  user: UserInfo | null;
  sessionId: string;
  callId: string | null;
  alive: boolean;
  /** Message budget for the current rate-limit window. */
  budget: number;
}

interface Call {
  id: string;
  caller: string;
  callee: string;
  video: boolean;
  state: 'ringing' | 'active';
  timer: ReturnType<typeof setTimeout> | null;
}

const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 300;
const HEARTBEAT_MS = 30_000;

export const DEFAULT_ICE_SERVERS: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/** ICE servers from the environment: STUN by default, plus TURN when TURN_URL is set. */
export function iceServersFromEnv(env: NodeJS.ProcessEnv = process.env): IceServer[] {
  const stun = env.STUN_URLS ? [{ urls: env.STUN_URLS.split(',').map((s) => s.trim()) }] : DEFAULT_ICE_SERVERS;
  if (!env.TURN_URL) return stun;
  return [
    ...stun,
    { urls: env.TURN_URL.split(',').map((s) => s.trim()), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL },
  ];
}

function originAllowed(req: IncomingMessage, extra: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients
  if (extra.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function createSignaling(opts: SignalingOptions) {
  const iceServers = opts.iceServers ?? DEFAULT_ICE_SERVERS;
  const ringTimeout = opts.ringTimeoutMs ?? RING_TIMEOUT_MS;
  const allowedOrigins = opts.allowedOrigins ?? [];
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const connections = new Set<Client>();
  const byEmail = new Map<string, Client>();
  const calls = new Map<string, Call>();

  const send = (c: Client | undefined, msg: ServerMessage) => {
    if (c && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
  };

  const broadcastPresence = () => {
    const users = [...byEmail.values()]
      .filter((c) => c.user)
      .map((c) => ({ ...c.user!, busy: c.callId !== null }));
    for (const c of byEmail.values()) send(c, { type: 'presence', users });
  };

  const endCall = (call: Call, reason: EndReason) => {
    if (!calls.delete(call.id)) return;
    if (call.timer) clearTimeout(call.timer);
    for (const email of [call.caller, call.callee]) {
      const c = byEmail.get(email);
      if (c?.callId === call.id) {
        c.callId = null;
        send(c, { type: 'ended', callId: call.id, reason });
      }
    }
    broadcastPresence();
  };

  const otherParty = (call: Call, email: string) => byEmail.get(call.caller === email ? call.callee : call.caller);

  /** Disconnects a client (its call ends) with a final message. */
  function evict(c: Client, msg: ServerMessage, code: number) {
    const call = c.callId ? calls.get(c.callId) : undefined;
    if (call) endCall(call, 'disconnected');
    send(c, msg);
    if (c.user && byEmail.get(c.user.email) === c) byEmail.delete(c.user.email);
    c.user = null;
    c.ws.close(code, msg.type);
  }

  function register(client: Client, identity: Identity) {
    const previous = byEmail.get(identity.user.email);
    if (previous && previous !== client) evict(previous, { type: 'replaced' }, 4000);
    client.user = identity.user;
    byEmail.set(identity.user.email, client);
    send(client, { type: 'welcome', you: client.user, iceServers });
    broadcastPresence();
  }

  function handle(client: Client, msg: ClientMessage) {
    const me = client.user;
    if (!me) return;

    if (msg.type === 'call') {
      if (client.callId) return send(client, { type: 'error', message: 'You are already in a call.' });
      if (msg.to === me.email) return send(client, { type: 'ended', callId: msg.callId, reason: 'failed' });
      if (calls.has(msg.callId)) return send(client, { type: 'error', message: 'Duplicate call id.' });
      const callee = byEmail.get(msg.to);
      if (!callee?.user) return send(client, { type: 'ended', callId: msg.callId, reason: 'offline' });
      if (callee.callId) return send(client, { type: 'ended', callId: msg.callId, reason: 'busy' });

      const call: Call = { id: msg.callId, caller: me.email, callee: msg.to, video: msg.video, state: 'ringing', timer: null };
      call.timer = setTimeout(() => endCall(call, 'timeout'), ringTimeout);
      calls.set(call.id, call);
      client.callId = callee.callId = call.id;
      send(callee, { type: 'incoming', callId: call.id, from: me, video: call.video });
      send(client, { type: 'ringing', callId: call.id, to: callee.user });
      broadcastPresence();
      return;
    }

    const call = calls.get(msg.callId);
    if (!call || client.callId !== call.id) return; // stale or not ours: ignore quietly

    switch (msg.type) {
      case 'accept':
        if (call.state !== 'ringing' || me.email !== call.callee) return;
        call.state = 'active';
        if (call.timer) clearTimeout(call.timer);
        call.timer = null;
        send(byEmail.get(call.caller), { type: 'accepted', callId: call.id });
        return;
      case 'decline':
        if (call.state === 'ringing' && me.email === call.callee) endCall(call, 'declined');
        return;
      case 'hangup':
        endCall(call, call.state === 'ringing' && me.email === call.caller ? 'cancelled' : 'hangup');
        return;
      case 'signal':
        if (call.state === 'active') send(otherParty(call, me.email), { type: 'signal', callId: call.id, data: msg.data });
        return;
    }
  }

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, identity: Identity) => {
    const client: Client = { ws, user: null, sessionId: identity.sessionId, callId: null, alive: true, budget: RATE_LIMIT };
    connections.add(client);
    register(client, identity);
    ws.on('pong', () => (client.alive = true));
    ws.on('message', (raw, isBinary) => {
      if (--client.budget < 0) return ws.close(1008, 'rate limit');
      const msg = isBinary ? null : parseClientMessage(raw.toString());
      if (!msg) return send(client, { type: 'error', message: 'Malformed message.' });
      handle(client, msg);
    });
    ws.on('close', () => {
      connections.delete(client);
      const email = client.user?.email;
      if (!email || byEmail.get(email) !== client) return;
      const call = client.callId ? calls.get(client.callId) : undefined;
      if (call) endCall(call, 'disconnected');
      byEmail.delete(email);
      broadcastPresence();
    });
  });

  const interval = setInterval(() => {
    for (const c of connections) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, HEARTBEAT_MS);
  const refill = setInterval(() => {
    for (const c of connections) c.budget = RATE_LIMIT;
  }, RATE_WINDOW_MS);
  interval.unref?.();
  refill.unref?.();

  /** Takes over HTTP upgrades for the signaling path and leaves the rest (e.g. Vite HMR) alone. */
  function attach(server: Server) {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== SIGNALING_PATH) return;
      const refuse = (status: string) => {
        socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
      };
      if (!originAllowed(req, allowedOrigins)) return refuse('403 Forbidden');
      const identity = opts.authenticate(req);
      if (!identity) return refuse('401 Unauthorized');
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, identity));
    });
  }

  function close() {
    clearInterval(interval);
    clearInterval(refill);
    for (const call of [...calls.values()]) endCall(call, 'disconnected');
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  /** Closes connections whose login session ended (sign-out, password change). */
  function revoke(sel: string[] | { userEmail: string; except?: string }) {
    for (const c of [...connections]) {
      const hit = Array.isArray(sel) ? sel.includes(c.sessionId) : c.user?.email === sel.userEmail && c.sessionId !== sel.except;
      if (hit) evict(c, { type: 'signed-out' }, 4001);
    }
  }

  return { attach, close, revoke, stats: () => ({ online: byEmail.size, calls: calls.size }) };
}
