import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth, RESET_MINUTES, SESSION_COOKIE } from './auth.ts';
import { openDatabase, type Database } from './db.ts';
import type { Email, Mailer } from './mailer.ts';

let server: Server;
let base: string;
let db: Database;
let clock: number;
let outbox: Email[];
let revoked: unknown[];

/** Lets background email sends settle. */
const flush = () => new Promise((r) => setTimeout(r, 20));

async function start(options: { publicUrl?: string; devLinks?: boolean; mailer?: Mailer | null } = {}) {
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 9, 11, 12);
  outbox = [];
  revoked = [];
  const mailer: Mailer = { kind: 'test', send: async (e) => void outbox.push(e) };
  const auth = createAuth({
    db,
    now: () => clock,
    publicUrl: 'https://call.example.com',
    mailer,
    onSessionsRevoked: (s) => revoked.push(s),
    ...options,
  });
  server = createServer(async (req, res) => {
    if (!(await auth.handle(req, res))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise((r) => server.close(r));
  db.close();
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.get('set-cookie') };
}

const ann = { name: 'Ann Lee', email: 'ann@example.com', password: 'original-pass' };
const session = (setCookie: string | null) => setCookie?.split(';')[0] ?? '';
const tokenFrom = (email: Email) => /#\/reset\/([\w-]+)/.exec(email.text)![1];

async function forgot(email = ann.email, headers?: Record<string, string>) {
  const r = await post('/api/auth/forgot', { email }, headers);
  await flush();
  return r;
}

describe('forgot password', () => {
  beforeEach(() => start());

  it('emails a single-use link that signs you in with the new password', async () => {
    const signup = await post('/api/auth/signup', ann);
    const oldSession = session(signup.setCookie);

    expect((await forgot('ANN@example.com')).status).toBe(202);
    expect(outbox).toHaveLength(1);
    const mail = outbox[0];
    expect(mail.to).toBe('ann@example.com');
    expect(mail.subject).toBe('Reset your Add Call password');
    expect(mail.text).toMatch(/^https:\/\/call\.example\.com\/#\/reset\/[\w-]{43}$/m);
    expect(mail.html).toContain('Choose a new password');
    expect(mail.text).toContain(`expires in ${RESET_MINUTES} minutes`);

    const token = tokenFrom(mail);
    expect((await post('/api/auth/reset/check', { token })).body).toEqual({ valid: true });

    const reset = await post('/api/auth/reset', { token, password: 'brand-new-pass' });
    expect(reset.status).toBe(200);
    expect(reset.body.user.email).toBe('ann@example.com');
    expect(reset.setCookie).toContain(`${SESSION_COOKIE}=`);

    // Old sessions are gone, call sockets told to close.
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: oldSession } });
    expect(me.status).toBe(401);
    expect(revoked).toEqual([{ userEmail: 'ann@example.com' }]);

    // New password works, old one doesn't, link is used up.
    expect((await post('/api/auth/login', { email: ann.email, password: 'brand-new-pass' })).status).toBe(200);
    expect((await post('/api/auth/login', ann)).status).toBe(401);
    expect((await post('/api/auth/reset', { token, password: 'another-pass-1' })).status).toBe(400);
    expect((await post('/api/auth/reset/check', { token })).body).toEqual({ valid: false });

    // A security notice follows the change.
    await flush();
    expect(outbox.at(-1)?.subject).toBe('Your Add Call password was changed');
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const r = await forgot('nobody@example.com');
    expect(r).toMatchObject({ status: 202, body: { ok: true } });
    expect(outbox).toEqual([]);
  });

  it('stores only a hash of the token', async () => {
    await post('/api/auth/signup', ann);
    await forgot();
    const token = tokenFrom(outbox[0]);
    expect(db.reset(token)).toBeUndefined();
  });

  it('expires links after an hour', async () => {
    await post('/api/auth/signup', ann);
    await forgot();
    clock += (RESET_MINUTES + 1) * 60_000;
    const r = await post('/api/auth/reset', { token: tokenFrom(outbox[0]), password: 'brand-new-pass' });
    expect(r).toMatchObject({ status: 400, body: { error: expect.stringMatching(/expired/) } });
  });

  it('invalidates older links when a new one is requested', async () => {
    await post('/api/auth/signup', ann);
    await forgot();
    await forgot();
    const [first, second] = outbox.map(tokenFrom);
    expect((await post('/api/auth/reset', { token: first, password: 'brand-new-pass' })).status).toBe(400);
    expect((await post('/api/auth/reset', { token: second, password: 'brand-new-pass' })).status).toBe(200);
  });

  it('still enforces the password rules', async () => {
    await post('/api/auth/signup', ann);
    await forgot();
    const r = await post('/api/auth/reset', { token: tokenFrom(outbox[0]), password: 'short' });
    expect(r.body.error).toMatch(/at least 8/);
    expect((await post('/api/auth/login', ann)).status).toBe(200);
  });

  it('limits reset emails per address', async () => {
    await post('/api/auth/signup', ann);
    for (let i = 0; i < 3; i++) expect((await forgot()).status).toBe(202);
    expect((await forgot()).status).toBe(429);
    expect(outbox).toHaveLength(3);
    clock += 61 * 60_000;
    expect((await forgot()).status).toBe(202);
  });

  it('ignores a forged Host header: links always use PUBLIC_URL', async () => {
    await post('/api/auth/signup', ann);
    await forgot(ann.email, { 'x-forwarded-host': 'evil.example' });
    const res = await fetch(`${base}/api/auth/forgot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'evil.example' },
      body: JSON.stringify({ email: ann.email }),
    });
    expect(res.status).toBe(202);
    await flush();
    for (const m of outbox) expect(m.text).toContain('https://call.example.com/#/reset/');
    expect(outbox.some((m) => m.text.includes('evil'))).toBe(false);
  });

  it('lets Google-only accounts set a first password', async () => {
    db.insertUser('g@example.com', 'G User', '', clock, 'google-sub-1');
    await forgot('g@example.com');
    expect((await post('/api/auth/reset', { token: tokenFrom(outbox[0]), password: 'first-password' })).body.user).toMatchObject({
      hasPassword: true,
      google: true,
    });
  });

  it('emails a notice when the password is changed in Settings', async () => {
    const s = session((await post('/api/auth/signup', ann)).setCookie);
    await post('/api/auth/password', { currentPassword: ann.password, newPassword: 'changed-pass-1' }, { cookie: s });
    await flush();
    expect(outbox.map((m) => m.subject)).toEqual(['Your Add Call password was changed']);
    expect(outbox[0].text).toContain('https://call.example.com');
  });

  it('reports the feature as available', async () => {
    expect(await (await fetch(`${base}/api/auth/providers`)).json()).toMatchObject({ passwordReset: true });
  });
});

describe('when reset is not safely available', () => {
  it('is off without a mailer', async () => {
    await start({ mailer: null });
    expect(await (await fetch(`${base}/api/auth/providers`)).json()).toMatchObject({ passwordReset: false });
    expect((await post('/api/auth/forgot', { email: ann.email })).status).toBe(404);
  });

  it('is off in production without PUBLIC_URL (no Host-header links)', async () => {
    await start({ publicUrl: undefined });
    expect((await post('/api/auth/forgot', { email: ann.email })).status).toBe(404);
  });

  it('uses the request host only in development', async () => {
    await start({ publicUrl: undefined, devLinks: true });
    await post('/api/auth/signup', ann);
    await forgot();
    expect(outbox[0].text).toContain(`${base}/#/reset/`);
  });
});
