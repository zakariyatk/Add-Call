import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createAuth, VERIFY_HOURS } from './auth.ts';
import { openDatabase, type Database } from './db.ts';
import type { Email, Mailer } from './mailer.ts';
import { createSignaling } from './signaling.ts';

let server: Server | undefined;
let base: string;
let db: Database;
let clock: number;
let outbox: Email[];

const flush = () => new Promise((r) => setTimeout(r, 20));

async function start(mailer: Mailer | null = { kind: 'test', send: async (e) => void outbox.push(e) }) {
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 9, 11, 12);
  outbox = [];
  const auth = createAuth({ db, now: () => clock, publicUrl: 'https://call.example.com', mailer });
  // Same rule as server/app.ts: unverified accounts can't use calling.
  const signaling = createSignaling({
    authenticate: (req: IncomingMessage) => {
      const a = auth.authenticate(req);
      return a && (!auth.verificationRequired || a.user.emailVerified) ? { user: a.user, sessionId: a.sessionId } : null;
    },
  });
  server = createServer(async (req, res) => {
    if (!(await auth.handle(req, res))) res.writeHead(404).end();
  });
  signaling.attach(server);
  server.on('close', () => signaling.close());
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((r) => server!.close(r));
  server = undefined;
  db.close();
});

async function post(path: string, body: unknown, cookie?: string) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const me = async (cookie: string) => ((await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json()) as { user: { emailVerified: boolean } }).user;
const tokenFrom = (e: Email) => /#\/verify\/([\w-]+)/.exec(e.text)![1];
const canCall = (cookie: string) =>
  new Promise<boolean>((resolve) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, { headers: { cookie } });
    ws.on('message', () => (ws.close(), resolve(true)));
    ws.on('error', () => resolve(false));
  });

const ann = { name: 'Ann Lee', email: 'ann@example.com', password: 'ann-password' };

describe('email verification', () => {
  beforeEach(() => start());

  it('emails a link at sign-up; calling unlocks once it is opened', async () => {
    const signup = await post('/api/auth/signup', ann);
    expect(signup.body.user.emailVerified).toBe(false);
    await flush();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: 'ann@example.com', subject: 'Confirm your email for Add Call' });
    expect(outbox[0].text).toMatch(/^https:\/\/call\.example\.com\/#\/verify\/[\w-]{43}$/m);

    expect(await canCall(signup.cookie!)).toBe(false);

    // The link works without being signed in (e.g. opened on a phone).
    const verify = await post('/api/auth/verify', { token: tokenFrom(outbox[0]) });
    expect(verify).toMatchObject({ status: 200, body: { email: 'ann@example.com' } });
    expect((await me(signup.cookie!)).emailVerified).toBe(true);
    expect(await canCall(signup.cookie!)).toBe(true);

    // Single use.
    expect((await post('/api/auth/verify', { token: tokenFrom(outbox[0]) })).status).toBe(400);
  });

  it('advertises the requirement', async () => {
    expect(await (await fetch(`${base}/api/auth/providers`)).json()).toMatchObject({ emailVerification: true });
  });

  it('expires links after a day and resends on request', async () => {
    const { cookie } = await post('/api/auth/signup', ann);
    await flush();
    clock += (VERIFY_HOURS + 1) * 3_600_000;
    expect((await post('/api/auth/verify', { token: tokenFrom(outbox[0]) })).status).toBe(400);

    expect((await post('/api/auth/verify/resend', {}, cookie)).status).toBe(202);
    await flush();
    expect(outbox).toHaveLength(2);
    expect((await post('/api/auth/verify', { token: tokenFrom(outbox[1]) })).status).toBe(200);
    expect((await post('/api/auth/verify/resend', {}, cookie)).body).toEqual({ alreadyVerified: true });
  });

  it('cancels older links when a new one is sent, and limits resends', async () => {
    const { cookie } = await post('/api/auth/signup', ann);
    for (let i = 0; i < 3; i++) expect((await post('/api/auth/verify/resend', {}, cookie)).status).toBe(202);
    expect((await post('/api/auth/verify/resend', {}, cookie)).status).toBe(429);
    await flush();
    const tokens = outbox.map(tokenFrom);
    expect((await post('/api/auth/verify', { token: tokens[0] })).status).toBe(400);
    expect((await post('/api/auth/verify', { token: tokens.at(-1) })).status).toBe(200);
  });

  it('requires a session to resend', async () => {
    expect((await post('/api/auth/verify/resend', {})).status).toBe(401);
  });

  it('treats a completed password reset as proof of the address', async () => {
    await post('/api/auth/signup', ann);
    await post('/api/auth/forgot', { email: ann.email });
    await flush();
    const reset = outbox.find((m) => m.subject.startsWith('Reset'))!;
    const token = /#\/reset\/([\w-]+)/.exec(reset.text)![1];
    const r = await post('/api/auth/reset', { token, password: 'new-password-1' });
    expect(r.body.user.emailVerified).toBe(true);
  });

  it('lets the real owner take back an address someone else signed up with', async () => {
    // A squatter registers the address but can't verify it…
    const squatter = await post('/api/auth/signup', { ...ann, password: 'squatter-pass' });
    expect(await canCall(squatter.cookie!)).toBe(false);
    // …the owner uses "Forgot password?", which signs the squatter out.
    await post('/api/auth/forgot', { email: ann.email });
    await flush();
    const token = /#\/reset\/([\w-]+)/.exec(outbox.find((m) => m.subject.startsWith('Reset'))!.text)![1];
    const owner = await post('/api/auth/reset', { token, password: 'owners-password' });
    expect(owner.body.user.emailVerified).toBe(true);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: squatter.cookie! } })).status).toBe(401);
    expect(await canCall(owner.cookie!)).toBe(true);
  });
});

describe('without email configured', () => {
  beforeEach(() => start(null));

  it("doesn't require verification (there would be no way to complete it)", async () => {
    const signup = await post('/api/auth/signup', ann);
    expect(signup.body.user.emailVerified).toBe(false);
    expect(await (await fetch(`${base}/api/auth/providers`)).json()).toMatchObject({ emailVerification: false });
    expect(await canCall(signup.cookie!)).toBe(true);
  });
});

describe('existing accounts', () => {
  it('are treated as verified when the database is upgraded', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const path = join(mkdtempSync(join(tmpdir(), 'addcall-')), 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL); INSERT INTO users (email, name, password_hash, created_at) VALUES ('old@example.com', 'Old', 'x', 5);`);
    old.close();
    const upgraded = openDatabase(path);
    expect(upgraded.userByEmail('old@example.com')?.email_verified_at).toBe(5);
    upgraded.close();
  });
});
