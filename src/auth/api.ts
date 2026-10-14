import type { AuthError as SupabaseAuthError, User } from '@supabase/supabase-js';
import { brand } from '../branding/brand.config';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../lib/supabase';

/*
 * Accounts, backed by Supabase Auth. The rest of the app only sees `Session`
 * and `authApi`, so screens don't depend on Supabase directly.
 *
 * Emailed links point back into the app as /#/verify/<token_hash> and
 * /#/reset/<token_hash> (see supabase/email-templates), so they work on any
 * device, not just the browser that asked for them.
 */

export interface Session {
  /** Supabase user id; empty for an account still waiting on its emailed link. */
  id: string;
  email: string;
  name: string;
  /** False for accounts created with Google that never set a password. */
  hasPassword?: boolean;
  /** Signed in with (or linked to) Google. */
  google?: boolean;
  /** False until the address is confirmed via the emailed link (or Google). */
  emailVerified?: boolean;
}

export interface Providers {
  google: boolean;
  passwordReset: boolean;
  /** New accounts must confirm their email before signing in. */
  emailVerification: boolean;
}

/** Must match the minimum password length set in Supabase (Auth → Providers → Email). */
export const MIN_PASSWORD = 8;

/**
 * Reads (and removes) a password-reset token from a link like /#/reset/<token>.
 * Removing it keeps the token out of browser history and later screenshots.
 */
export function takeResetToken(): string | null {
  const m = /^#\/reset\/([\w-]{20,100})$/.exec(window.location.hash);
  if (!m) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return m[1];
}

/** Reads (and removes) an email-verification token from a link like /#/verify/<token>. */
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
    case 'invalid_credentials':
      return new AuthError('Email or password is incorrect.', 400);
    case 'user_already_exists':
    case 'email_exists':
      return new AuthError('An account with this email already exists. Sign in instead.', 409);
    case 'weak_password':
      return new AuthError(`Choose a stronger password (at least ${MIN_PASSWORD} characters).`, 422);
    case 'same_password':
      return new AuthError('Choose a password you haven\'t used here before.', 422);
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
    hasPassword: providers.has('email'),
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
    a.hasPassword === b.hasPassword &&
    a.google === b.google &&
    a.emailVerified === b.emailVerified
  );
}

/** An account that signed up but hasn't opened its emailed link yet (no real session). */
const pending = (email: string, name = ''): Session => ({ id: '', email: email.trim().toLowerCase(), name, emailVerified: false });

/** Where links and Google send people back to: this app, without any route. */
const appUrl = () => window.location.origin + window.location.pathname;

let providersCache: Promise<Providers> | null = null;

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

  /** Which sign-in methods are switched on in Supabase. */
  providers(): Promise<Providers> {
    providersCache ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_KEY },
    })
      .then((r) => r.json() as Promise<{ external?: { google?: boolean; email?: boolean }; mailer_autoconfirm?: boolean }>)
      .then((s) => ({ google: !!s.external?.google, passwordReset: !!s.external?.email, emailVerification: !s.mailer_autoconfirm }))
      .catch(() => {
        providersCache = null;
        return { google: false, passwordReset: true, emailVerification: true };
      });
    return providersCache;
  },

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error?.code === 'email_not_confirmed') return pending(email);
    if (error || !data.user) throw friendly(error);
    return toSession(data.user);
  },

  async signUp(name: string, email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() }, emailRedirectTo: appUrl() },
    });
    if (error || !data.user) throw friendly(error);
    // Supabase hides whether an address is taken by returning a user with no identities.
    if (data.user.identities?.length === 0) throw friendly({ code: 'user_already_exists' } as SupabaseAuthError);
    return data.session ? toSession(data.user) : pending(email, name.trim());
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) throw friendly(error);
  },

  /** Ends this browser's session only (other devices stay signed in). */
  signOut: async () => void (await supabase.auth.signOut({ scope: 'local' })),

  /** Confirms an address from the emailed link, which also signs in on this browser. */
  async verifyEmail(token: string): Promise<string | null> {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' });
    if (error) throw friendly(error);
    return data.user?.email?.toLowerCase() ?? null;
  },

  /** Emails a fresh confirmation link. */
  async resendVerification(email: string) {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } });
    if (error) throw friendly(error);
  },

  /** Emails a reset link if the account exists. Succeeds either way, by design. */
  async forgotPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
    if (error && error.status !== 400 && error.status !== 404) throw friendly(error);
  },

  /** Sets a new password from an emailed link, signs in, and signs out every other device. */
  async resetPassword(token: string, password: string): Promise<Session> {
    const { error: linkError } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
    if (linkError) throw friendly(linkError);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error || !data.user) throw friendly(error);
    await supabase.auth.signOut({ scope: 'others' });
    return toSession(data.user);
  },

  /** Changes (or, for Google-only accounts, adds) a password and signs out other devices. */
  async changePassword(currentPassword: string, newPassword: string) {
    const { data: current } = await supabase.auth.getUser();
    const user = current.user;
    if (!user?.email) throw new AuthError('Sign in again to continue.', 401);
    if (toSession(user).hasPassword) {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (error) throw error.code === 'invalid_credentials' ? new AuthError('Your current password is incorrect.', 400) : friendly(error);
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw friendly(error);
    await supabase.auth.signOut({ scope: 'others' });
  },
};
