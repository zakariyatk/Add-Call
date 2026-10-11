import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto';

/*
 * "Sign in with Google" — OpenID Connect authorization-code flow with PKCE.
 *
 *   1. /api/auth/google           → redirect to Google with state, nonce, PKCE challenge
 *   2. Google → /api/auth/google/callback?code&state
 *   3. exchange the code (with the PKCE verifier and client secret) for an ID token
 *   4. verify the ID token: RS256 signature against Google's published keys,
 *      issuer, audience, expiry, nonce, verified email
 *
 * Enabled when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Fixed callback URL; otherwise derived from PUBLIC_URL or the request. */
  redirectUri?: string;
  endpoints: {
    auth: string;
    token: string;
    jwks: string;
    issuers: string[];
  };
}

export const GOOGLE_ENDPOINTS: GoogleConfig['endpoints'] = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
};

export function googleConfigFromEnv(env: NodeJS.ProcessEnv): GoogleConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    endpoints: GOOGLE_ENDPOINTS,
  };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

/** Why a Google sign-in failed; sent to the app as ?auth_error=<code>. */
export type GoogleErrorCode = 'google_cancelled' | 'google_failed' | 'google_unverified' | 'google_conflict' | 'google_expired';

export class GoogleError extends Error {
  constructor(
    readonly code: GoogleErrorCode,
    detail: string,
  ) {
    super(detail);
  }
}

interface Pending {
  verifier: string;
  nonce: string;
  redirectUri: string;
  expires: number;
}

const PENDING_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_S = 60;
const b64url = (b: Buffer) => b.toString('base64url');
const json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export function createGoogleSignIn(config: GoogleConfig, now: () => number = Date.now) {
  const pending = new Map<string, Pending>();
  let keys: { list: (JsonWebKey & { kid?: string })[]; expires: number } | null = null;

  async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> & { keys?: (JsonWebKey & { kid?: string })[] } | null;
    if (!res.ok || !body) throw new GoogleError('google_failed', `${url} → HTTP ${res.status}`);
    return { body, res };
  }

  async function signingKey(kid: string) {
    for (const refresh of [false, true]) {
      if (refresh || !keys || keys.expires <= now()) {
        const { body, res } = await fetchJson(config.endpoints.jwks);
        const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
        keys = { list: body.keys ?? [], expires: now() + Math.min(maxAge, 86_400) * 1000 };
      }
      const jwk = keys!.list.find((k) => k.kid === kid);
      if (jwk) return createPublicKey({ key: jwk, format: 'jwk' });
    }
    throw new GoogleError('google_failed', `unknown signing key ${kid}`);
  }

  /** Verifies a Google ID token and returns the profile it vouches for. */
  async function verifyIdToken(idToken: string, nonce: string): Promise<GoogleProfile> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new GoogleError('google_failed', 'malformed ID token');
    const header = json(parts[0]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new GoogleError('google_failed', `unexpected alg ${header.alg}`);
    const key = await signingKey(header.kid);
    if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url')))
      throw new GoogleError('google_failed', 'bad ID token signature');

    const c = json(parts[1]);
    const t = now() / 1000;
    if (!config.endpoints.issuers.includes(c.iss)) throw new GoogleError('google_failed', `wrong issuer ${c.iss}`);
    if (c.aud !== config.clientId) throw new GoogleError('google_failed', 'wrong audience');
    if (typeof c.exp !== 'number' || c.exp < t - CLOCK_SKEW_S) throw new GoogleError('google_failed', 'ID token expired');
    if (typeof c.iat === 'number' && c.iat > t + CLOCK_SKEW_S) throw new GoogleError('google_failed', 'ID token from the future');
    if (c.nonce !== nonce) throw new GoogleError('google_failed', 'nonce mismatch');
    if (typeof c.sub !== 'string' || !c.sub) throw new GoogleError('google_failed', 'missing subject');
    if (typeof c.email !== 'string' || c.email_verified !== true)
      throw new GoogleError('google_unverified', 'Google account email is not verified');

    const email = c.email.toLowerCase();
    const name = String(c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || email.split('@')[0]).slice(0, 80);
    return { sub: c.sub, email, name };
  }

  return {
    /** Starts a sign-in: returns Google's URL and the state to bind to this browser. */
    begin(redirectUri: string): { url: string; state: string } {
      const t = now();
      for (const [k, p] of pending) if (p.expires <= t) pending.delete(k);
      if (pending.size > 10_000) throw new GoogleError('google_failed', 'too many sign-ins in progress');
      const state = b64url(randomBytes(24));
      const verifier = b64url(randomBytes(32));
      const nonce = b64url(randomBytes(24));
      pending.set(state, { verifier, nonce, redirectUri, expires: t + PENDING_TTL_MS });
      const url = new URL(config.endpoints.auth);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return { url: url.toString(), state };
    },

    /** Completes a sign-in from the callback's query string. */
    async complete(query: URLSearchParams, browserState: string | undefined): Promise<GoogleProfile> {
      const state = query.get('state') ?? '';
      const p = pending.get(state);
      pending.delete(state);
      if (query.get('error')) throw new GoogleError(query.get('error') === 'access_denied' ? 'google_cancelled' : 'google_failed', query.get('error')!);
      // The state must match the one we set in this browser's cookie (login-CSRF protection).
      if (!p || !browserState || browserState !== state) throw new GoogleError('google_expired', 'unknown or mismatched state');
      if (p.expires <= now()) throw new GoogleError('google_expired', 'sign-in took too long');
      const code = query.get('code');
      if (!code) throw new GoogleError('google_failed', 'missing code');

      const { body } = await fetchJson(config.endpoints.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: p.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: p.verifier,
        }),
      });
      if (typeof body.id_token !== 'string') throw new GoogleError('google_failed', 'no ID token');
      return verifyIdToken(body.id_token, p.nonce);
    },
  };
}

export type GoogleSignIn = ReturnType<typeof createGoogleSignIn>;
