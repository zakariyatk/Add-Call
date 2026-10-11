import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/*
 * Accounts and sessions, in SQLite (built into Node 22+, no native modules).
 * One file, set with DATABASE_PATH. Back it up like any other database.
 */

export interface UserRow {
  id: number;
  email: string;
  name: string;
  /** Empty for accounts that only sign in with Google. */
  password_hash: string;
  /** Google account id ("sub"), when linked. */
  google_sub: string | null;
  created_at: number;
}

export interface SessionRow {
  token_hash: string;
  user_id: number;
  created_at: number;
  expires_at: number;
}

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`;

/** Additive schema changes for databases created by older versions. */
function migrate(db: DatabaseSync) {
  const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL');
}

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  migrate(db);

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (email, name, password_hash, google_sub, created_at) VALUES (?, ?, ?, ?, ?)'),
    userByGoogleSub: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    linkGoogle: db.prepare('UPDATE users SET google_sub = ? WHERE id = ?'),
    updatePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    extendSession: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  return {
    userByEmail: (email: string) => q.userByEmail.get(email) as UserRow | undefined,
    userById: (id: number) => q.userById.get(id) as UserRow | undefined,
    insertUser(email: string, name: string, passwordHash: string, now: number, googleSub: string | null = null): UserRow {
      const { lastInsertRowid } = q.insertUser.run(email, name, passwordHash, googleSub, now);
      return q.userById.get(lastInsertRowid) as unknown as UserRow;
    },
    userByGoogleSub: (sub: string) => q.userByGoogleSub.get(sub) as UserRow | undefined,
    linkGoogle: (id: number, sub: string) => void q.linkGoogle.run(sub, id),
    updatePassword: (id: number, hash: string) => void q.updatePassword.run(hash, id),
    insertSession: (tokenHash: string, userId: number, now: number, expiresAt: number) =>
      void q.insertSession.run(tokenHash, userId, now, expiresAt),
    session: (tokenHash: string) => q.session.get(tokenHash) as SessionRow | undefined,
    extendSession: (tokenHash: string, expiresAt: number) => void q.extendSession.run(expiresAt, tokenHash),
    deleteSession: (tokenHash: string) => void q.deleteSession.run(tokenHash),
    deleteUserSessions: (userId: number) => void q.deleteUserSessions.run(userId),
    deleteExpired: (now: number) => Number(q.deleteExpired.run(now).changes),
    close: () => db.close(),
  };
}

export type Database = ReturnType<typeof openDatabase>;
