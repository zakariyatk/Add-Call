import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { brand } from '../src/branding/brand.config.ts';
import { isEmail } from '../src/calls/protocol.ts';
import type { Database, UserRow } from './db.ts';
import { createGoogleSignIn, GoogleError, type GoogleConfig, type GoogleProfile } from './google.ts';
import { passwordChangedEmail, passwordResetEmail } from './emails.ts';
import type { Email, Mailer } from './mailer.ts';
import { hashPassword, needsRehash, verifyPassword } from './passwords.ts';

/*
 * Email + password accounts with server-side sessions.
 *
 *   POST /api/auth/signup    { name, email, password }        → 201 { user }
 *   POST /api/auth/login     { email, password }              → 200 { user }
 *   POST /api/auth/logout                                     → 204
 *   GET  /api/auth/me                                         → 200 { user } | 401
 *   POST /api/auth/password  { currentPassword, newPassword } → 204
 *   GET  /api/auth/providers                     → { google, passwordReset }
 *   POST /api/auth/forgot       { email }            → 202 (always; emails a reset link)
 *   POST /api/auth/reset/check  { token }            → { valid }
 *   POST /api/auth/reset        { token, password }  → 200 { user } (signed in)
 *   GET  /api/auth/google            → redirect to Google (see google.ts)
 *   GET  /api/auth/google/callback   → session, then redirect to the app
 *
 * The session is a random 256-bit token in an HttpOnly, SameSite=Lax cookie;
 * only its SHA-256 is stored. POSTs must be JSON from this origin (CSRF).
 */

export const SESSION_COOKIE = `${brand.storageKey}_session`;
/** Short-lived cookie tying a Google sign-in to the browser that started it. */
export const OAUTH_STATE_COOKIE = `${brand.storageKey}_oauth`;
/** How long a password-reset link works. */
export const RESET_MINUTES = 60;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const SESSION_DAYS = 30;
const DAY = 86_400_000;
const MAX_BODY = 10 * 1024;

export interface PublicUser {
  email: string;
  name: string;
  /** False for accounts created with Google that never set a password. */
  hasPassword: boolean;
  google: boolean;
}

export interface AuthOptions {
  db: Database;
  now?: () => number;
  /** Trust X-Forwarded-For / X-Forwarded-Proto (set when behind a reverse proxy). */
  trustProxy?: boolean;
  /** Force the Secure cookie flag (otherwise it follows the request's protocol). */
  secureCookies?: boolean;
  allowedOrigins?: string[];
  /** Called when sessions end, so open call connections can be closed. */
  onSessionsRevoked?: (sessionIds: string[] | { userEmail: string; except?: string }) => void;
  /** Enables "Sign in with Google". */
  google?: GoogleConfig | null;
  /** The app's public origin, e.g. https://call.example.com (for the Google callback URL). */
  publicUrl?: string;
  /** Sends password-reset and security emails; without it, reset is unavailable. */
  mailer?: Mailer | null;
  /**
   * Development only: build email links from the request's Host when
   * publicUrl is unset. Never in production — a forged Host header would put
   * an attacker's domain in the reset link.
   */
  devLinks?: boolean;
}

export const toPublic = (u: UserRow): PublicUser => ({ email: u.email, name: u.name, hasPassword: u.password_hash !== '', google: !!u.google_sub });
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Fixed-window attempt counter, e.g. 10 tries per 15 minutes per key. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return {
    /** Records an attempt; returns seconds to wait if the key is over the limit. */
    hit(key: string): number | null {
      const t = now();
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      const h = hits.get(key);
      if (!h || h.reset <= t) {
        hits.set(key, { count: 1, reset: t + windowMs });
        return null;
      }
      h.count++;
      return h.count > limit ? Math.ceil((h.reset - t) / 1000) : null;
    },
    clear: (key: string) => void hits.delete(key),
  };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

export function createAuth(opts: AuthOptions) {
  const { db } = opts;
  const now = opts.now ?? Date.now;
  const ipLimiter = createRateLimiter(30, 15 * 60_000, now);
  const emailLimiter = createRateLimiter(10, 15 * 60_000, now);
  // Verifying against a dummy hash for unknown emails keeps response time the
  // same, so sign-in timing doesn't reveal which emails have accounts.
  const dummyHash = hashPassword(randomBytes(16).toString('hex'));
  const google = opts.google ? createGoogleSignIn(opts.google, now) : null;
  const resetLimiter = createRateLimiter(3, 60 * 60_000, now);

  /** Where links in emails point. Null means email links can't be built safely. */
  const appOrigin = (req: IncomingMessage): string | null =>
    opts.publicUrl?.replace(/\/$/, '') ?? (opts.devLinks ? `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}` : null);
  const resetAvailable = !!opts.mailer && (!!opts.publicUrl || !!opts.devLinks);

  /** Sends in the background: response time must not depend on whether an account exists. */
  function sendLater(email: Email) {
    opts.mailer?.send(email).catch((err) => console.error('[mail] could not send', JSON.stringify(email.subject), '-', err instanceof Error ? err.message : err));
  }

  const clientIp = (req: IncomingMessage) => {
    const fwd = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    return fwd || req.socket.remoteAddress || 'unknown';
  };
  const isHttps = (req: IncomingMessage) =>
    opts.secureCookies ?? ((req.socket as { encrypted?: boolean }).encrypted === true || (opts.trustProxy && req.headers['x-forwarded-proto'] === 'https'));

  function cookie(req: IncomingMessage, value: string, maxAgeSec: number) {
    return [
      `${SESSION_COOKIE}=${value}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSec}`,
      ...(isHttps(req) ? ['Secure'] : []),
    ].join('; ');
  }

  function startSession(req: IncomingMessage, res: ServerResponse, user: UserRow, extraCookies: string[] = []) {
    const token = randomBytes(32).toString('base64url');
    const t = now();
    db.insertSession(sha256(token), user.id, t, t + SESSION_DAYS * DAY);
    res.setHeader('Set-Cookie', [cookie(req, token, SESSION_DAYS * 86_400), ...extraCookies]);
  }

  function stateCookie(req: IncomingMessage, value: string, maxAgeSec: number) {
    // Lax is enough: the callback is a top-level GET navigation from Google.
    return [`${OAUTH_STATE_COOKIE}=${value}`, 'Path=/api/auth/google', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`, ...(isHttps(req) ? ['Secure'] : [])].join('; ');
  }

  function googleRedirectUri(req: IncomingMessage) {
    if (opts.google?.redirectUri) return opts.google.redirectUri;
    const origin = opts.publicUrl?.replace(/\/$/, '') ?? `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
    return `${origin}/api/auth/google/callback`;
  }

  /** Finds or creates the account for a verified Google profile. */
  function accountForGoogle(p: GoogleProfile): UserRow {
    const linked = db.userByGoogleSub(p.sub);
    if (linked) return linked;
    const existing = db.userByEmail(p.email);
    if (existing) {
      // Same verified email: link Google to the existing account.
      if (existing.google_sub && existing.google_sub !== p.sub) throw new GoogleError('google_conflict', 'email linked to another Google account');
      db.linkGoogle(existing.id, p.sub);
      return db.userById(existing.id)!;
    }
    try {
      return db.insertUser(p.email, p.name, '', now(), p.sub);
    } catch {
      throw new GoogleError('google_conflict', 'account creation raced');
    }
  }

  function redirect(res: ServerResponse, location: string, cookies?: string[]) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...(cookies ? { 'Set-Cookie': cookies } : {}) });
    res.end();
  }

  async function googleRoute(req: IncomingMessage, res: ServerResponse, path: string) {
    if (!google) throw new HttpError(404, 'Google sign-in is not configured.');
    if (path === '/api/auth/google') {
      throttle(ipLimiter, clientIp(req));
      const { url, state } = google.begin(googleRedirectUri(req));
      return redirect(res, url, [stateCookie(req, state, 600)]);
    }
    // Callback
    const clear = stateCookie(req, '', 0);
    try {
      const query = new URL(req.url ?? '', 'http://x').searchParams;
      const profile = await google.complete(query, parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE]);
      startSession(req, res, accountForGoogle(profile), [clear]);
      return redirect(res, '/');
    } catch (err) {
      const code = err instanceof GoogleError ? err.code : 'google_failed';
      if (!(err instanceof GoogleError) || code === 'google_failed') console.warn('[google sign-in]', err instanceof Error ? err.message : err);
      return redirect(res, `/?auth_error=${code}`, [clear]);
    }
  }

  /** The signed-in user for a request (HTTP or WebSocket upgrade), from its cookie. */
  function authenticate(req: IncomingMessage): { user: PublicUser; sessionId: string; userId: number } | null {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token || token.length > 100) return null;
    const id = sha256(token);
    const session = db.session(id);
    const t = now();
    if (!session) return null;
    if (session.expires_at <= t) {
      db.deleteSession(id);
      return null;
    }
    const user = db.userById(session.user_id);
    if (!user) return null;
    // Sliding expiry: active users stay signed in.
    if (session.expires_at - t < (SESSION_DAYS / 2) * DAY) db.extendSession(id, t + SESSION_DAYS * DAY);
    return { user: toPublic(user), sessionId: id, userId: user.id };
  }

  function sameOrigin(req: IncomingMessage) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (opts.allowedOrigins?.includes(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
      chunks.push(chunk as Buffer);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      return body;
    } catch {
      throw new HttpError(400, 'Malformed JSON.');
    }
  }

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  function validPassword(password: string) {
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
    if (password.length > MAX_PASSWORD) throw new HttpError(400, 'That password is too long.');
  }
  function throttle(limiter: ReturnType<typeof createRateLimiter>, key: string) {
    const wait = limiter.hit(key);
    if (wait !== null)
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`, {
        'Retry-After': String(wait),
      });
  }

  async function route(req: IncomingMessage, res: ServerResponse, path: string) {
    const json = (status: number, body?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };

    if (path === '/api/auth/me' && req.method === 'GET') {
      const auth = authenticate(req);
      return auth ? json(200, { user: auth.user }) : json(401, { error: 'Not signed in.' });
    }
    if (path === '/api/auth/providers' && req.method === 'GET') return json(200, { google: !!google, passwordReset: resetAvailable });
    if ((path === '/api/auth/google' || path === '/api/auth/google/callback') && req.method === 'GET') return googleRoute(req, res, path);

    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    if (!sameOrigin(req)) throw new HttpError(403, 'Cross-origin request refused.');

    switch (path) {
      case '/api/auth/signup': {
        throttle(ipLimiter, clientIp(req));
        const body = await readJson(req);
        const email = str(body.email).trim().toLowerCase();
        const name = str(body.name).trim().replace(/\s+/g, ' ');
        const password = str(body.password);
        if (!name || name.length > 80) throw new HttpError(400, 'Enter your name (up to 80 characters).');
        if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
        validPassword(password);
        if (db.userByEmail(email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
        const hash = await hashPassword(password);
        let user: UserRow;
        try {
          user = db.insertUser(email, name, hash, now());
        } catch {
          throw new HttpError(409, 'An account with this email already exists. Sign in instead.'); // lost a race
        }
        startSession(req, res, user);
        return json(201, { user: toPublic(user) });
      }

      case '/api/auth/login': {
        throttle(ipLimiter, clientIp(req));
        const body = await readJson(req);
        const email = str(body.email).trim().toLowerCase();
        const password = str(body.password);
        if (!isEmail(email) || !password) throw new HttpError(400, 'Enter your email and password.');
        throttle(emailLimiter, email);
        const user = db.userByEmail(email);
        const ok = await verifyPassword(password.slice(0, MAX_PASSWORD), user?.password_hash ?? (await dummyHash));
        if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.');
        emailLimiter.clear(email);
        if (needsRehash(user.password_hash)) db.updatePassword(user.id, await hashPassword(password));
        startSession(req, res, user);
        return json(200, { user: toPublic(user) });
      }

      case '/api/auth/logout': {
        const auth = authenticate(req);
        if (auth) {
          db.deleteSession(auth.sessionId);
          opts.onSessionsRevoked?.([auth.sessionId]);
        }
        res.setHeader('Set-Cookie', cookie(req, '', 0));
        return json(204);
      }

      case '/api/auth/password': {
        const auth = authenticate(req);
        if (!auth) throw new HttpError(401, 'Not signed in.');
        throttle(emailLimiter, auth.user.email);
        const body = await readJson(req);
        const current = str(body.currentPassword);
        const next = str(body.newPassword);
        const user = db.userById(auth.userId)!;
        // Google-only accounts can add a password without knowing an old one.
        if (user.password_hash !== '' && !(await verifyPassword(current.slice(0, MAX_PASSWORD), user.password_hash)))
          throw new HttpError(400, 'Your current password is incorrect.');
        validPassword(next);
        db.updatePassword(user.id, await hashPassword(next));
        const origin = appOrigin(req);
        if (origin) sendLater(passwordChangedEmail(brand, user, origin));
        // Sign out everywhere else; keep this browser signed in.
        db.deleteUserSessions(user.id);
        db.insertSession(auth.sessionId, user.id, now(), now() + SESSION_DAYS * DAY);
        opts.onSessionsRevoked?.({ userEmail: user.email, except: auth.sessionId });
        return json(204);
      }

      case '/api/auth/forgot': {
        if (!resetAvailable) throw new HttpError(404, 'Password reset is not available.');
        throttle(ipLimiter, clientIp(req));
        const body = await readJson(req);
        const email = str(body.email).trim().toLowerCase();
        if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
        throttle(resetLimiter, email);
        const user = db.userByEmail(email);
        const origin = appOrigin(req);
        if (user && origin) {
          const token = randomBytes(32).toString('base64url');
          db.insertReset(sha256(token), user.id, now(), now() + RESET_MINUTES * 60_000);
          // The token goes in the URL fragment, which browsers never send to servers or in Referer.
          sendLater(passwordResetEmail(brand, user, `${origin}/#/reset/${token}`, RESET_MINUTES));
        }
        // Same answer whether or not the account exists.
        return json(202, { ok: true });
      }

      case '/api/auth/reset/check': {
        throttle(ipLimiter, clientIp(req));
        const body = await readJson(req);
        const reset = db.reset(sha256(str(body.token)));
        return json(200, { valid: !!reset && reset.expires_at > now() });
      }

      case '/api/auth/reset': {
        throttle(ipLimiter, clientIp(req));
        const body = await readJson(req);
        const id = sha256(str(body.token));
        const reset = db.reset(id);
        if (!reset || reset.expires_at <= now()) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
        const password = str(body.password);
        validPassword(password);
        const user = db.userById(reset.user_id);
        if (!user) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
        db.updatePassword(user.id, await hashPassword(password));
        db.deleteUserResets(user.id);
        // Whoever had access before the reset is signed out everywhere.
        db.deleteUserSessions(user.id);
        opts.onSessionsRevoked?.({ userEmail: user.email });
        emailLimiter.clear(user.email);
        startSession(req, res, user);
        const origin = appOrigin(req);
        if (origin) sendLater(passwordChangedEmail(brand, user, origin));
        return json(200, { user: toPublic(db.userById(user.id)!) });
      }

      default:
        throw new HttpError(404, 'Not found.');
    }
  }

  /** Handles /api/* requests. Returns false for anything else. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith('/api/')) return false;
    try {
      await route(req, res, path);
    } catch (err) {
      const e = err instanceof HttpError ? err : new HttpError(500, 'Something went wrong. Please try again.');
      if (!(err instanceof HttpError)) console.error(err);
      if (!res.headersSent) {
        res.writeHead(e.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...e.headers });
        res.end(JSON.stringify({ error: e.message }));
      }
    }
    return true;
  }

  const sweep = setInterval(() => db.deleteExpired(now()), 6 * 60 * 60_000);
  sweep.unref?.();

  return { handle, authenticate, close: () => clearInterval(sweep) };
}

export type Auth = ReturnType<typeof createAuth>;
