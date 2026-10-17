import type { AuthError as SupabaseAuthError, User } from '@supabase/supabase-js';
import { brand } from '../branding/brand.config';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../lib/supabase';

/*
 * Accounts, backed by Supabase Auth. The rest of the app only sees `Session`
 * and `authApi`, so screens don't depend on Supabase directly.
 *
 * There are no passwords: people sign in (and sign up) with a one-time code
 * emailed to them, or with Google. The email also carries a link back into the
 * app as /#/verify/<token_hash> (see supabase/templates), which signs in on
 * whichever device opens it.
 */

export interface Session {
  /** Supabase user id. */
  id: string;
  email: string;
  name: string;
  /** Signed in with (or linked to) Google. */
  google?: boolean;
  /** False until the address is confirmed (by a code, the emailed link or Google). */
  emailVerified?: boolean;
}

export interface Providers {
  google: boolean;
}

/** Digits in an emailed sign-in code. Must match Supabase → Auth → Providers → Email → "Email OTP Length". */
export const CODE_LENGTH = 6;

/**
 * Reads (and removes) a sign-in token from an emailed link like /#/verify/<token>.
 * Removing it keeps the token out of browser history and later screenshots.
 */
export function takeVerifyToken(): string | null {
  const m = /^#\/verify\/([\w-]{20,100})$/.exec(window.location.hash);
  if (!m) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return m[1];
}

/** Reads (and removes) the ?error=… Supabase adds when a Google sign-in fails. */
export function takeAuthError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('error');
  if (!code) return null;
  const description = url.searchParams.get('error_description') ?? '';
  for (const k of ['error', 'error_code', 'error_description']) url.searchParams.delete(k);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (code === 'access_denied') return 'Google sign-in was cancelled.';
  if (/already/i.test(description)) return 'This email is already linked to a different account.';
  return 'Google sign-in failed. Please try again.';
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const OFFLINE = `Can't reach ${brand.name}. Check your connection and try again.`;

/** Turns a Supabase error into a message for people. */
function friendly(err: SupabaseAuthError | Error | null): AuthError {
  const e = err as (SupabaseAuthError & { code?: string; status?: number }) | null;
  const status = e?.status ?? 0;
  switch (e?.code) {
    case 'email_address_invalid':
    case 'validation_failed':
      return new AuthError('Enter a valid email address.', 400);
    case 'otp_expired':
    case 'flow_state_expired':
    case 'bad_jwt':
      return new AuthError('This link has expired or was already used.', 410);
    case 'over_email_send_rate_limit':
      return new AuthError('Too many emails sent. Wait a few minutes and try again.', 429);
    case 'over_request_rate_limit':
      return new AuthError('Too many attempts. Wait a few minutes and try again.', 429);
    case 'signup_disabled':
      return new AuthError('New sign-ups are turned off right now.', 403);
  }
  if (!status || e?.name === 'AuthRetryableFetchError') return new AuthError(OFFLINE, 0);
  return new AuthError(e?.message || 'Something went wrong. Please try again.', status);
}

const nameOf = (u: User) => {
  const meta = u.user_metadata as { name?: string; full_name?: string } | undefined;
  return (meta?.name || meta?.full_name || u.email?.split('@')[0] || '').trim();
};

export function toSession(u: User): Session {
  const providers = new Set((u.identities ?? []).map((i) => i.provider));
  return {
    id: u.id,
    email: (u.email ?? '').toLowerCase(),
    name: nameOf(u),
    google: providers.has('google'),
    emailVerified: !!u.email_confirmed_at,
  };
}

/** Whether two sessions describe the same signed-in account in the same state (tokens aside). */
export function sameSession(a: Session | null, b: Session | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.name === b.name &&
    a.google === b.google &&
    a.emailVerified === b.emailVerified
  );
}

/** Where links and Google send people back to: this app, without any route. */
const appUrl = () => window.location.origin + window.location.pathname;

let providersCache: Promise<Providers> | null = null;

/**
 * App store reviewers can't read the emailed code, so their accounts also
 * accept a fixed one (functions/demo-sign-in). Asked only after a wrong code;
 * null for everyone else.
 */
async function reviewSignIn(email: string, code: string): Promise<Session | null> {
  const { data, error } = await supabase.functions.invoke<{ tokenHash?: string }>('demo-sign-in', { body: { email: email.trim(), code } });
  if (error || !data?.tokenHash) return null;
  const { data: signedIn, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'email' });
  return verifyError || !signedIn.user ? null : toSession(signedIn.user);
}

export const authApi = {
  /** The signed-in user, or null when signed out. */
  async me(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw friendly(error);
    return data.session ? toSession(data.session.user) : null;
  },

  /** Called whenever this browser signs in or out (in any tab). */
  onChange(fn: (s: Session | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      // Defer: supabase-js forbids awaiting its own calls inside this callback.
      setTimeout(() => fn(session ? toSession(session.user) : null), 0);
    });
    return () => data.subscription.unsubscribe();
  },

  /** Whether "Continue with Google" is switched on in Supabase. */
  providers(): Promise<Providers> {
    providersCache ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
    })
      .then((r) => r.json() as Promise<{ external?: { google?: boolean } }>)
      .then((s) => ({ google: !!s.external?.google }))
      .catch(() => {
        providersCache = null;
        return { google: false };
      });
    return providersCache;
  },

  /** Emails a sign-in code. A new address gets an account at the same time. */
  async sendCode(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: appUrl() },
    });
    if (error) throw friendly(error);
  },

  /** Signs in with the emailed code (or, for the app reviewers' accounts, their fixed code). */
  async verifyCode(email: string, code: string): Promise<Session> {
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
    if (error?.code === 'otp_expired') {
      const review = await reviewSignIn(email, code);
      if (review) return review;
      throw new AuthError('That code is wrong or has expired. Check the latest email, or send a new code.', 400);
    }
    if (error || !data.user) throw friendly(error);
    return toSession(data.user);
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) throw friendly(error);
  },

  /**
   * Deletes the signed-in account for good, with its chats, files and list
   * (see functions/delete-account), then signs this device out.
   */
  async deleteAccount() {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) {
      let message = 'Could not delete your account right now. Please try again.';
      try {
        const body = await (error as { context?: Response }).context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
      throw new AuthError(message, 500);
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  },

  /** Ends this browser's session only (other devices stay signed in). */
  signOut: async () => void (await supabase.auth.signOut({ scope: 'local' })),

  /** Signs in from the link in the emailed code message. */
  async verifyEmail(token: string): Promise<string | null> {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' });
    if (error) throw friendly(error);
    return data.user?.email?.toLowerCase() ?? null;
  },
};
