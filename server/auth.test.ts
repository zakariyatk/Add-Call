import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth, parseCookies, SESSION_COOKIE } from './auth.ts';
import { openDatabase, type Database } from './db.ts';

let server: Server;
let base: string;
let db: Database;
let clock: number;
let revoked: unknown[];
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 9, 11);
  revoked = [];
  auth = createAuth({ db, now: () => clock, onSessionsRevoked: (s) => revoked.push(s) });
  server = createServer(async (req, res) => {
    if (await auth.handle(req, res)) return;
    const who = auth.authenticate(req);
    res.end(who ? who.user.email : 'anonymous');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  auth.close();
  await new Promise((r) => server.close(r));
  db.close();
});

/** A tiny cookie-keeping browser. */
function browser() {
  let cookie = '';
  async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    return { status: res.status, setCookie: set, body: text ? (text.startsWith('{') ? JSON.parse(text) : text) : null };
  }
  return { call, get cookie() { return cookie; } };
}

const ann = { name: 'Ann Lee', email: 'Ann@Example.com', password: 'correct horse' };

describe('accounts API', () => {
  it('signs up, stays signed in, signs out', async () => {
    const b = browser();
    const r = await b.call('/api/auth/signup', ann);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ user: { email: 'ann@example.com', name: 'Ann Lee', hasPassword: true, google: false, emailVerified: false } });
    expect(r.setCookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[\\w-]{43}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000$`));

    expect((await b.call('/api/auth/me')).body).toMatchObject({ user: { email: 'ann@example.com', name: 'Ann Lee' } });
    expect((await b.call('/whoami')).body).toBe('ann@example.com');

    expect((await b.call('/api/auth/logout', {})).status).toBe(204);
    expect(revoked).toHaveLength(1);
    expect((await b.call('/api/auth/me')).status).toBe(401);
  });

  it('stores only a hash of the password and of the session token', async () => {
    const b = browser();
    await b.call('/api/auth/signup', ann);
    const user = db.userByEmail('ann@example.com')!;
    expect(user.password_hash).toMatch(/^scrypt\$/);
    const token = parseCookies(b.cookie)[SESSION_COOKIE];
    expect(db.session(token)).toBeUndefined();
  });

  it('signs in with the right password only, with one generic error', async () => {
    await browser().call('/api/auth/signup', ann);
    const wrong = await browser().call('/api/auth/login', { email: 'ann@example.com', password: 'wrong password' });
    const unknown = await browser().call('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' });
    expect(wrong).toMatchObject({ status: 401, body: { error: 'Email or password is incorrect.' } });
    expect(unknown).toMatchObject({ status: 401, body: { error: 'Email or password is incorrect.' } });
    expect(wrong.setCookie).toBeNull();

    const ok = await browser().call('/api/auth/login', { email: ' ANN@example.com ', password: 'correct horse' });
    expect(ok).toMatchObject({ status: 200, body: { user: { email: 'ann@example.com' } } });
  });

  it('validates sign-up input and refuses duplicates', async () => {
    const b = browser();
    expect((await b.call('/api/auth/signup', { ...ann, password: 'short' })).body.error).toMatch(/at least 8/);
    expect((await b.call('/api/auth/signup', { ...ann, email: 'nope' })).body.error).toMatch(/valid email/);
    expect((await b.call('/api/auth/signup', { ...ann, name: '  ' })).body.error).toMatch(/name/);
    expect((await b.call('/api/auth/signup', ann)).status).toBe(201);
    expect(await browser().call('/api/auth/signup', { ...ann, email: 'ANN@example.com' })).toMatchObject({ status: 409 });
  });

  it('expires sessions after 30 days of inactivity and slides for active users', async () => {
    const b = browser();
    await b.call('/api/auth/signup', ann);
    clock += 20 * 86_400_000;
    expect((await b.call('/api/auth/me')).status).toBe(200); // renews to +30 days
    clock += 25 * 86_400_000;
    expect((await b.call('/api/auth/me')).status).toBe(200);
    clock += 31 * 86_400_000;
    expect((await b.call('/api/auth/me')).status).toBe(401);
  });

  it('changes the password and signs out other sessions only', async () => {
    const phone = browser();
    const laptop = browser();
    await phone.call('/api/auth/signup', ann);
    await laptop.call('/api/auth/login', ann);

    expect((await laptop.call('/api/auth/password', { currentPassword: 'nope', newPassword: 'brand new pass' })).status).toBe(400);
    expect((await laptop.call('/api/auth/password', { currentPassword: 'correct horse', newPassword: 'brand new pass' })).status).toBe(204);
    expect(revoked.at(-1)).toMatchObject({ userEmail: 'ann@example.com' });

    expect((await laptop.call('/api/auth/me')).status).toBe(200);
    expect((await phone.call('/api/auth/me')).status).toBe(401);
    expect((await browser().call('/api/auth/login', ann)).status).toBe(401);
    expect((await browser().call('/api/auth/login', { ...ann, password: 'brand new pass' })).status).toBe(200);
  });

  it('rate-limits password guessing per account', async () => {
    await browser().call('/api/auth/signup', ann);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await browser().call('/api/auth/login', { email: ann.email, password: `guess-${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    const blocked = await browser().call('/api/auth/login', ann);
    expect(blocked.status).toBe(429);
    clock += 16 * 60_000;
    expect((await browser().call('/api/auth/login', ann)).status).toBe(200);
  });

  it('refuses cross-site and non-JSON requests', async () => {
    expect((await browser().call('/api/auth/signup', ann, { origin: 'https://evil.example' })).status).toBe(403);
    const form = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a@b.co&password=x',
    });
    expect(form.status).toBe(415);
    expect((await browser().call('/api/auth/me', undefined, {})).status).toBe(401);
    expect((await fetch(`${base}/api/auth/login`)).status).toBe(405);
  });

  it('ignores forged or garbage cookies', async () => {
    const b = browser();
    expect((await b.call('/api/auth/me', undefined, { cookie: `${SESSION_COOKIE}=forged` })).status).toBe(401);
    expect((await b.call('/api/auth/me', undefined, { cookie: `${SESSION_COOKIE}=%E0%A4%A` })).status).toBe(401);
  });

  it('marks cookies Secure when configured', async () => {
    auth.close();
    auth = createAuth({ db, now: () => clock, secureCookies: true });
    const r = await browser().call('/api/auth/signup', ann);
    expect(r.setCookie).toContain('; Secure');
  });
});
