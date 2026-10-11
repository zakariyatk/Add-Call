import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createAuth } from './auth.ts';
import { openDatabase } from './db.ts';
import { createSignaling, iceServersFromEnv } from './signaling.ts';

/*
 * The Add Call backend: accounts API (/api/auth/*) and authenticated
 * signaling (/ws), sharing one database. Mounted by the production server
 * (server/index.ts) and by `vite` / `vite preview` in development.
 */

export interface BackendOptions {
  databasePath: string;
  env?: NodeJS.ProcessEnv;
}

export function createBackend({ databasePath, env = process.env }: BackendOptions) {
  const db = openDatabase(databasePath);
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  const trustProxy = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';

  // Signaling and auth reference each other (sign-out closes call sockets).
  let revoke: (sel: Parameters<ReturnType<typeof createSignaling>['revoke']>[0]) => void = () => {};
  const auth = createAuth({
    db,
    trustProxy,
    allowedOrigins,
    secureCookies: env.COOKIE_SECURE === undefined ? undefined : env.COOKIE_SECURE === '1' || env.COOKIE_SECURE === 'true',
    onSessionsRevoked: (sel) => revoke(sel),
  });
  const signaling = createSignaling({
    iceServers: iceServersFromEnv(env),
    allowedOrigins,
    authenticate: (req) => {
      const a = auth.authenticate(req);
      return a && { user: a.user, sessionId: a.sessionId };
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
