import { brand } from '../branding/brand.config';

/*
 * Client for the accounts API (server/auth.ts). The session lives in an
 * HttpOnly cookie the browser sends automatically — JavaScript never sees it.
 */

export interface Session {
  email: string;
  name: string;
  /** False for accounts created with Google that never set a password. */
  hasPassword?: boolean;
  /** Signed in with (or linked to) Google. */
  google?: boolean;
}

/** Where the "Continue with Google" button sends the browser. */
export const GOOGLE_SIGN_IN_URL = '/api/auth/google';

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_unverified: "Your Google account's email address isn't verified.",
  google_conflict: 'This email is already linked to a different Google account.',
  google_expired: 'That sign-in attempt expired. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
};

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

/** Reads (and removes) an ?auth_error=… left by a failed Google sign-in. */
export function takeAuthError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_error');
  if (!code) return null;
  url.searchParams.delete('auth_error');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  return GOOGLE_ERRORS[code] ?? GOOGLE_ERRORS.google_failed;
}

/** Must match MIN_PASSWORD in server/auth.ts (the server is the authority). */
export const MIN_PASSWORD = 8;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new AuthError(`Can't reach ${brand.name}. Check your connection and try again.`, 0);
  }
  if (res.status === 204) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: Session };
  if (!res.ok) throw new AuthError(data.error ?? 'Something went wrong. Please try again.', res.status);
  return data;
}

const user = (data: unknown) => (data as { user: Session }).user;

export const authApi = {
  /** The signed-in user, or null when signed out. */
  async me(): Promise<Session | null> {
    try {
      return user(await request('/api/auth/me'));
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) return null;
      throw e;
    }
  },
  /** Which sign-in methods the server offers. */
  async providers(): Promise<{ google: boolean; passwordReset: boolean }> {
    try {
      return (await request('/api/auth/providers')) as { google: boolean; passwordReset: boolean };
    } catch {
      return { google: false, passwordReset: false };
    }
  },
  /** Emails a reset link if the account exists. Succeeds either way, by design. */
  forgotPassword: async (email: string) => void (await request('/api/auth/forgot', { method: 'POST', body: { email } })),
  checkResetToken: async (token: string) => ((await request('/api/auth/reset/check', { method: 'POST', body: { token } })) as { valid: boolean }).valid,
  /** Sets a new password from an emailed link, and signs in. */
  resetPassword: async (token: string, password: string) => user(await request('/api/auth/reset', { method: 'POST', body: { token, password } })),
  signIn: async (email: string, password: string) => user(await request('/api/auth/login', { method: 'POST', body: { email, password } })),
  signUp: async (name: string, email: string, password: string) =>
    user(await request('/api/auth/signup', { method: 'POST', body: { name, email, password } })),
  signOut: async () => void (await request('/api/auth/logout', { method: 'POST', body: {} })),
  changePassword: async (currentPassword: string, newPassword: string) =>
    void (await request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } })),
};
