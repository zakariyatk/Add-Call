import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../src/calls/protocol.ts';
import { createSignaling, iceServersFromEnv } from './signaling.ts';

/** A test client that records every message and can wait for a given type. */
class Client {
  readonly ws: WebSocket;
  readonly inbox: ServerMessage[] = [];
  private waiters: { type: string; resolve: (m: ServerMessage) => void }[] = [];
  readonly open: Promise<void>;

  constructor(url: string, origin?: string) {
    this.ws = new WebSocket(url, origin ? { origin } : undefined);
    this.open = new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as ServerMessage;
      const i = this.waiters.findIndex((w) => w.type === m.type);
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
      else this.inbox.push(m);
    });
  }

  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }

  next<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    const i = this.inbox.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 2000);
      this.waiters.push({ type, resolve: (m) => (clearTimeout(t), resolve(m as Extract<ServerMessage, { type: T }>)) });
    });
  }

  /** Latest presence list, after letting pending broadcasts arrive. */
  async presence() {
    await new Promise((r) => setTimeout(r, 30));
    const all = this.inbox.filter((m) => m.type === 'presence');
    return all.length ? (all[all.length - 1] as Extract<ServerMessage, { type: 'presence' }>).users : null;
  }
}

let server: Server;
let signaling: ReturnType<typeof createSignaling>;
let url: string;
const clients: Client[] = [];

async function join(email: string, name = email.split('@')[0]) {
  const c = new Client(url);
  clients.push(c);
  await c.open;
  c.send({ type: 'hello', email, name });
  await c.next('welcome');
  return c;
}

beforeEach(async () => {
  server = createServer();
  signaling = createSignaling({ ringTimeoutMs: 200, iceServers: [{ urls: 'stun:example.org' }] });
  signaling.attach(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.ws.terminate());
  signaling.close();
  await new Promise((r) => server.close(r));
});

describe('signaling server', () => {
  it('welcomes users with ICE servers and broadcasts presence', async () => {
    const a = new Client(url);
    clients.push(a);
    await a.open;
    a.send({ type: 'hello', email: 'Ann@Example.com', name: 'Ann' });
    expect(await a.next('welcome')).toEqual({ type: 'welcome', you: { email: 'ann@example.com', name: 'Ann' }, iceServers: [{ urls: 'stun:example.org' }] });
    await join('bob@example.com', 'Bob');
    expect((await a.presence())?.map((u) => u.email).sort()).toEqual(['ann@example.com', 'bob@example.com']);
  });

  it('runs a full call: invite, ring, accept, relay SDP/ICE, hang up', async () => {
    const a = await join('ann@example.com', 'Ann');
    const b = await join('bob@example.com', 'Bob');

    a.send({ type: 'call', callId: 'call-0001', to: 'bob@example.com', video: true });
    expect(await b.next('incoming')).toEqual({ type: 'incoming', callId: 'call-0001', from: { email: 'ann@example.com', name: 'Ann' }, video: true });
    expect(await a.next('ringing')).toMatchObject({ callId: 'call-0001', to: { email: 'bob@example.com' } });
    expect((await a.presence())?.every((u) => u.busy)).toBe(true);

    b.send({ type: 'accept', callId: 'call-0001' });
    await a.next('accepted');

    a.send({ type: 'signal', callId: 'call-0001', data: { sdp: { type: 'offer', sdp: 'v=0 offer' } } });
    expect((await b.next('signal')).data).toEqual({ sdp: { type: 'offer', sdp: 'v=0 offer' } });
    b.send({ type: 'signal', callId: 'call-0001', data: { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host' } } });
    expect((await a.next('signal')).data).toMatchObject({ candidate: { candidate: expect.stringContaining('candidate:1') } });

    b.send({ type: 'hangup', callId: 'call-0001' });
    expect(await a.next('ended')).toEqual({ type: 'ended', callId: 'call-0001', reason: 'hangup' });
    expect(await b.next('ended')).toMatchObject({ reason: 'hangup' });
    expect((await a.presence())?.some((u) => u.busy)).toBe(false);
  });

  it('reports offline, busy, declined, cancelled and timeout', async () => {
    const a = await join('ann@example.com');
    const b = await join('bob@example.com');
    const c = await join('cat@example.com');

    a.send({ type: 'call', callId: 'call-0002', to: 'nobody@example.com', video: false });
    expect(await a.next('ended')).toMatchObject({ callId: 'call-0002', reason: 'offline' });

    a.send({ type: 'call', callId: 'call-0003', to: 'bob@example.com', video: false });
    await b.next('incoming');
    c.send({ type: 'call', callId: 'call-0004', to: 'bob@example.com', video: false });
    expect(await c.next('ended')).toMatchObject({ callId: 'call-0004', reason: 'busy' });

    b.send({ type: 'decline', callId: 'call-0003' });
    expect(await a.next('ended')).toMatchObject({ callId: 'call-0003', reason: 'declined' });
    expect(await b.next('ended')).toMatchObject({ callId: 'call-0003', reason: 'declined' });

    a.send({ type: 'call', callId: 'call-0005', to: 'bob@example.com', video: false });
    await b.next('incoming');
    a.send({ type: 'hangup', callId: 'call-0005' });
    expect(await b.next('ended')).toMatchObject({ callId: 'call-0005', reason: 'cancelled' });

    await a.next('ended');
    a.send({ type: 'call', callId: 'call-0006', to: 'bob@example.com', video: false });
    await b.next('incoming');
    // Nobody answers: the 200ms ring timeout ends it for both.
    expect(await b.next('ended')).toMatchObject({ callId: 'call-0006', reason: 'timeout' });
    expect(await a.next('ended')).toMatchObject({ callId: 'call-0006', reason: 'timeout' });
  });

  it('ends the call when a party disconnects', async () => {
    const a = await join('ann@example.com');
    const b = await join('bob@example.com');
    a.send({ type: 'call', callId: 'call-0007', to: 'bob@example.com', video: false });
    await b.next('incoming');
    b.send({ type: 'accept', callId: 'call-0007' });
    await a.next('accepted');
    b.ws.close();
    expect(await a.next('ended')).toMatchObject({ reason: 'disconnected' });
    expect(signaling.stats()).toEqual({ online: 1, calls: 0 });
  });

  it('does not relay for strangers, before acceptance, or to yourself', async () => {
    const a = await join('ann@example.com');
    const b = await join('bob@example.com');
    const eve = await join('eve@example.com');
    a.send({ type: 'call', callId: 'call-0008', to: 'bob@example.com', video: false });
    await b.next('incoming');
    a.send({ type: 'signal', callId: 'call-0008', data: { sdp: { type: 'offer', sdp: 'early' } } });
    eve.send({ type: 'signal', callId: 'call-0008', data: { sdp: { type: 'offer', sdp: 'evil' } } });
    eve.send({ type: 'hangup', callId: 'call-0008' });
    eve.send({ type: 'accept', callId: 'call-0008' });
    await new Promise((r) => setTimeout(r, 60));
    expect(b.inbox.filter((m) => m.type === 'signal' || m.type === 'ended')).toEqual([]);
    expect(a.inbox.filter((m) => m.type === 'accepted' || m.type === 'ended')).toEqual([]);

    a.send({ type: 'hangup', callId: 'call-0008' });
    await a.next('ended');
    a.send({ type: 'call', callId: 'call-0009', to: 'ann@example.com', video: false });
    expect(await a.next('ended')).toMatchObject({ reason: 'failed' });
  });

  it('requires hello first and rejects malformed input', async () => {
    const c = new Client(url);
    clients.push(c);
    await c.open;
    c.send({ type: 'call', callId: 'call-0010', to: 'x@y.io', video: false });
    expect(await c.next('error')).toMatchObject({ message: 'Say hello first.' });
    c.ws.send('{"type":"hello","email":"bad"}');
    expect((await c.next('error')).message).toBe('Malformed message.');
  });

  it('replaces an older session for the same address', async () => {
    const first = await join('ann@example.com');
    await join('ann@example.com');
    await first.next('replaced');
    expect(signaling.stats().online).toBe(1);
  });

  it('refuses cross-origin browsers', async () => {
    const evil = new Client(url, 'https://evil.example');
    await expect(evil.open).rejects.toThrow(/403/);
    const same = new Client(url, url.replace('ws://', 'http://').replace('/ws', ''));
    clients.push(same);
    await expect(same.open).resolves.toBeUndefined();
  });
});

describe('iceServersFromEnv', () => {
  it('uses public STUN by default and adds TURN when configured', () => {
    expect(iceServersFromEnv({})[0].urls).toContain('stun:stun.l.google.com:19302');
    const withTurn = iceServersFromEnv({ TURN_URL: 'turn:t.example:3478,turns:t.example:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' });
    expect(withTurn[1]).toEqual({ urls: ['turn:t.example:3478', 'turns:t.example:5349'], username: 'u', credential: 'p' });
  });
});
