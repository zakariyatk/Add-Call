import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createAuth } from './auth.ts';
import { openDatabase } from './db.ts';
import { googleConfigFromEnv } from './google.ts';
import { mailerFromEnv } from './mailer.ts';
import { createSignaling, iceServersFromEnv } from './signaling.ts';

/*
 * The Add Call backend: accounts API (/api/auth/*) and authenticated
 * signaling (/ws), sharing one database. Mounted by the production server
 * (server/index.ts) and by `vite` / `vite preview` in development.
 */

export interface BackendOptions {
  databasePath: string;
  env?: NodeJS.ProcessEnv;
  /** Local development: email links may use the request's host (see auth.ts devLinks). */
  dev?: boolean;
}

export function createBackend({ databasePath, env = process.env, dev = false }: BackendOptions) {
  const db = openDatabase(databasePath);
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  const trustProxy = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';

  // Signaling and auth reference each other (sign-out closes call sockets).
  let revoke: (sel: Parameters<ReturnType<typeof createSignaling>['revoke']>[0]) => void = () => {};
  const mailer = mailerFromEnv(dev && !env.SMTP_URL && !env.SMTP_HOST ? { ...env, MAIL_TRANSPORT: env.MAIL_TRANSPORT ?? 'console' } : env);
  if (mailer && !dev && !env.PUBLIC_URL)
    console.warn('[mail] Password reset is off: set PUBLIC_URL (e.g. https://call.example.com) so email links are safe to build.');
  if (mailer?.kind === 'console' && !dev) console.warn('[mail] MAIL_TRANSPORT=console: emails (including reset links) are printed to this log, not sent.');

  const auth = createAuth({
    db,
    trustProxy,
    allowedOrigins,
    secureCookies: env.COOKIE_SECURE === undefined ? undefined : env.COOKIE_SECURE === '1' || env.COOKIE_SECURE === 'true',
    onSessionsRevoked: (sel) => revoke(sel),
    google: googleConfigFromEnv(env),
    publicUrl: env.PUBLIC_URL,
    // In development, emails are printed to the terminal unless SMTP is configured.
    mailer,
    devLinks: dev,
  });
  const signaling = createSignaling({
    iceServers: iceServersFromEnv(env),
    allowedOrigins,
    authenticate: (req) => {
      const a = auth.authenticate(req);
      // Other users only ever see name and email.
      return a && { user: { email: a.user.email, name: a.user.name }, sessionId: a.sessionId };
    },
  });
  revoke = signaling.revoke;

  return {
    /** Handles /api/*; resolves false for other paths. */
    handleApi: (req: IncomingMessage, res: ServerResponse) => auth.handle(req, res),
    attach: (server: Server) => signaling.attach(server),
    stats: signaling.stats,
    close() {
      signaling.close();
      auth.close();
      db.close();
    },
  };
}
