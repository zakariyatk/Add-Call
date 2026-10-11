import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth, OAUTH_STATE_COOKIE, SESSION_COOKIE } from './auth.ts';
import { openDatabase, type Database } from './db.ts';
import type { GoogleConfig } from './google.ts';
import { hashPassword } from './passwords.ts';

/*
 * A stand-in for Google's OAuth endpoints: signs ID tokens with its own RSA
 * key, publishes the public key as a JWKS, and checks PKCE and the client
 * secret at the token endpoint like Google does.
 */
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-secret';
const googleKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rogueKey = generateKeyPairSync('rsa', { modulusLength: 2048 });

function jwt(claims: Record<string, unknown>, key: KeyObject = googleKey.privateKey, kid = 'k1') {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${enc({ alg: 'RS256', kid, typ: 'JWT' })}.${enc(claims)}`;
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`;
}

let fake: Server;
let app: Server;
let db: Database;
let fakeUrl: string;
let appUrl: string;
let clock: number;
/** What the next ID token will say; tests tweak it. */
let claims: (nonce: string) => Record<string, unknown>;
let signWith: KeyObject;
let lastTokenRequest: URLSearchParams | null;
const issued = new Map<string, { challenge: string; nonce: string; redirectUri: string }>();

async function listen(server: Server) {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 11, 12);
  lastTokenRequest = null;
  signWith = googleKey.privateKey;
  claims = (nonce) => ({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'Ann.Lee@gmail.com',
    email_verified: true,
    name: 'Ann Lee',
    nonce,
    iat: clock / 1000,
    exp: clock / 1000 + 3600,
  });

  fake = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/certs') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.end(JSON.stringify({ keys: [{ ...googleKey.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] }));
    }
    if (url.pathname === '/token') {
      let body = '';
      for await (const c of req) body += c;
      const p = new URLSearchParams(body);
      lastTokenRequest = p;
      const grant = issued.get(p.get('code')!);
      const pkceOk = grant && createHash('sha256').update(p.get('code_verifier')!).digest('base64url') === grant.challenge;
      if (!grant || !pkceOk || p.get('client_secret') !== CLIENT_SECRET || p.get('redirect_uri') !== grant.redirectUri) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'invalid_grant' }));
      }
      issued.delete(p.get('code')!);
      return res.end(JSON.stringify({ id_token: jwt(claims(grant.nonce), signWith), access_token: 'x' }));
    }
    res.writeHead(404).end();
  });
  fakeUrl = await listen(fake);

  db = openDatabase(':memory:');
  const google: GoogleConfig = {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    endpoints: { auth: `${fakeUrl}/auth`, token: `${fakeUrl}/token`, jwks: `${fakeUrl}/certs`, issuers: ['https://accounts.google.com'] },
  };
  const auth = createAuth({ db, now: () => clock, google });
  app = createServer(async (req, res) => {
    if (!(await auth.handle(req, res))) res.writeHead(404).end();
  });
  appUrl = await listen(app);
});

afterEach(async () => {
  await Promise.all([new Promise((r) => app.close(r)), new Promise((r) => fake.close(r))]);
  db.close();
});

const cookieValue = (setCookies: string[], name: string) => setCookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0].split('=')[1];

/** Runs the browser side: start → (user approves at "Google") → callback. */
async function signInWithGoogle(opts: { tamperState?: boolean; dropCookie?: boolean; error?: string } = {}) {
  const start = await fetch(`${appUrl}/api/auth/google`, { redirect: 'manual' });
  const location = new URL(start.headers.get('location')!);
  const stateCookie = cookieValue(start.headers.getSetCookie(), OAUTH_STATE_COOKIE)!;
  const q = location.searchParams;
  const code = `code-${Math.random()}`;
  issued.set(code, { challenge: q.get('code_challenge')!, nonce: q.get('nonce')!, redirectUri: q.get('redirect_uri')! });

  const back = new URLSearchParams(opts.error ? { error: opts.error, state: q.get('state')! } : { code, state: opts.tamperState ? 'forged' : q.get('state')! });
  const cb = await fetch(`${q.get('redirect_uri')}?${back}`, {
    redirect: 'manual',
    headers: opts.dropCookie ? {} : { cookie: `${OAUTH_STATE_COOKIE}=${stateCookie}` },
  });
  const session = cookieValue(cb.headers.getSetCookie(), SESSION_COOKIE);
  return { start, location, cb, session, redirectTo: cb.headers.get('location'), replay: () => fetch(`${q.get('redirect_uri')}?${back}`, { redirect: 'manual', headers: { cookie: `${OAUTH_STATE_COOKIE}=${stateCookie}` } }) };
}

const me = async (session?: string) => {
  const r = await fetch(`${appUrl}/api/auth/me`, { headers: session ? { cookie: `${SESSION_COOKIE}=${session}` } : {} });
  return r.status === 200 ? ((await r.json()) as { user: Record<string, unknown> }).user : null;
};

describe('Sign in with Google', () => {
  it('advertises the provider', async () => {
    expect(await (await fetch(`${appUrl}/api/auth/providers`)).json()).toMatchObject({ google: true });
  });

  it('sends the user to Google with state, nonce and a PKCE challenge', async () => {
    const { location, start } = await signInWithGoogle();
    expect(start.status).toBe(302);
    expect(location.origin + location.pathname).toBe(`${fakeUrl}/auth`);
    const q = location.searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(`${appUrl}/api/auth/google/callback`);
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state')).toMatch(/^[\w-]{32}$/);
    expect(q.get('nonce')).toMatch(/^[\w-]{32}$/);
    expect(start.headers.getSetCookie()[0]).toMatch(new RegExp(`^${OAUTH_STATE_COOKIE}=[\\w-]+; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600`));
  });

  it('creates a Google-only account and signs in', async () => {
    const r = await signInWithGoogle();
    expect(r.cb.status).toBe(302);
    expect(r.redirectTo).toBe('/');
    expect(r.session).toBeTruthy();
    expect(cookieValue(r.cb.headers.getSetCookie(), OAUTH_STATE_COOKIE)).toBe(''); // cleared
    expect(await me(r.session)).toEqual({ email: 'ann.lee@gmail.com', name: 'Ann Lee', hasPassword: false, google: true, emailVerified: true });
    expect(lastTokenRequest?.get('client_secret')).toBe(CLIENT_SECRET);
    expect(lastTokenRequest?.get('grant_type')).toBe('authorization_code');
  });

  it('signs the same Google account back into the same user', async () => {
    await signInWithGoogle();
    claims = ((base) => (nonce) => ({ ...base(nonce), email: 'new-address@gmail.com', name: 'Renamed' }))(claims);
    const again = await signInWithGoogle();
    expect((await me(again.session))?.email).toBe('ann.lee@gmail.com');
  });

  it('links Google to an existing password account with the same verified email', async () => {
    db.insertUser('ann.lee@gmail.com', 'Ann (password)', await hashPassword('pw-12345678'), clock);
    const r = await signInWithGoogle();
    expect(await me(r.session)).toEqual({ email: 'ann.lee@gmail.com', name: 'Ann (password)', hasPassword: true, google: true, emailVerified: true });
    expect(db.userByEmail('ann.lee@gmail.com')?.google_sub).toBe('1234567890');
  });

  it('refuses an email already linked to a different Google account', async () => {
    db.insertUser('ann.lee@gmail.com', 'Ann', '', clock, 'other-google-id');
    const r = await signInWithGoogle();
    expect(r.redirectTo).toBe('/?auth_error=google_conflict');
    expect(r.session).toBeUndefined();
  });

  it('rejects login CSRF: forged state, missing cookie, or a replayed callback', async () => {
    expect((await signInWithGoogle({ tamperState: true })).redirectTo).toBe('/?auth_error=google_expired');
    expect((await signInWithGoogle({ dropCookie: true })).redirectTo).toBe('/?auth_error=google_expired');
    const ok = await signInWithGoogle();
    expect(ok.session).toBeTruthy();
    expect((await ok.replay()).headers.get('location')).toBe('/?auth_error=google_expired');
  });

  it('expires sign-ins that take longer than 10 minutes', async () => {
    const start = await fetch(`${appUrl}/api/auth/google`, { redirect: 'manual' });
    const q = new URL(start.headers.get('location')!).searchParams;
    clock += 11 * 60_000;
    const cb = await fetch(`${appUrl}/api/auth/google/callback?code=x&state=${q.get('state')}`, {
      redirect: 'manual',
      headers: { cookie: `${OAUTH_STATE_COOKIE}=${q.get('state')}` },
    });
    expect(cb.headers.get('location')).toBe('/?auth_error=google_expired');
  });

  it('reports a cancelled consent screen', async () => {
    expect((await signInWithGoogle({ error: 'access_denied' })).redirectTo).toBe('/?auth_error=google_cancelled');
  });

  it.each([
    ['a token signed by someone else', () => (signWith = rogueKey.privateKey), 'google_failed'],
    ['the wrong audience', () => (claims = ((b) => (n) => ({ ...b(n), aud: 'someone-else' }))(claims)), 'google_failed'],
    ['the wrong issuer', () => (claims = ((b) => (n) => ({ ...b(n), iss: 'https://evil.example' }))(claims)), 'google_failed'],
    ['an expired token', () => (claims = ((b) => (n) => ({ ...b(n), exp: clock / 1000 - 600 }))(claims)), 'google_failed'],
    ['a mismatched nonce', () => (claims = ((b) => () => ({ ...b('x'), nonce: 'replayed' }))(claims)), 'google_failed'],
    ['an unverified email', () => (claims = ((b) => (n) => ({ ...b(n), email_verified: false }))(claims)), 'google_unverified'],
  ])('rejects %s', async (_label, tamper, code) => {
    tamper();
    const r = await signInWithGoogle();
    expect(r.redirectTo).toBe(`/?auth_error=${code}`);
    expect(r.session).toBeUndefined();
    expect(db.userByEmail('ann.lee@gmail.com')).toBeUndefined();
  });

  it('lets a Google-only account add a password, then sign in with it', async () => {
    const r = await signInWithGoogle();
    const set = await fetch(`${appUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${r.session}` },
      body: JSON.stringify({ currentPassword: '', newPassword: 'now-i-have-one' }),
    });
    expect(set.status).toBe(204);
    const login = await fetch(`${appUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ann.lee@gmail.com', password: 'now-i-have-one' }),
    });
    expect(login.status).toBe(200);
  });

  it("can't be used to sign in with an empty password", async () => {
    await signInWithGoogle();
    const login = await fetch(`${appUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ann.lee@gmail.com', password: '' }),
    });
    expect(login.status).toBe(400);
  });
});

describe('without Google configured', () => {
  it('hides the provider and refuses the routes', async () => {
    const db2 = openDatabase(':memory:');
    const auth = createAuth({ db: db2 });
    const s = createServer(async (req, res) => void (await auth.handle(req, res)));
    const url = await listen(s);
    expect(await (await fetch(`${url}/api/auth/providers`)).json()).toMatchObject({ google: false });
    expect((await fetch(`${url}/api/auth/google`, { redirect: 'manual' })).status).toBe(404);
    await new Promise((r) => s.close(r));
    db2.close();
  });
});
