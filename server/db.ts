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
  /** When the address was proven (verification link, Google, or a reset link); null = unverified. */
  email_verified_at: number | null;
  created_at: number;
}

export interface ResetRow {
  token_hash: string;
  user_id: number;
  created_at: number;
  expires_at: number;
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
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);
  CREATE TABLE IF NOT EXISTS email_verifications (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_verifications_user ON email_verifications(user_id);
`;

/** Additive schema changes for databases created by older versions. */
function migrate(db: DatabaseSync) {
  const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
  if (!columns.includes('email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
    // Accounts that existed before verification was introduced keep working.
    db.exec('UPDATE users SET email_verified_at = created_at');
  }
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
    insertUser: db.prepare('INSERT INTO users (email, name, password_hash, google_sub, email_verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    markVerified: db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL'),
    insertVerification: db.prepare('INSERT INTO email_verifications (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    verification: db.prepare('SELECT * FROM email_verifications WHERE token_hash = ?'),
    deleteUserVerifications: db.prepare('DELETE FROM email_verifications WHERE user_id = ?'),
    deleteExpiredVerifications: db.prepare('DELETE FROM email_verifications WHERE expires_at <= ?'),
    userByGoogleSub: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    linkGoogle: db.prepare('UPDATE users SET google_sub = ? WHERE id = ?'),
    updatePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    extendSession: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    insertReset: db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    reset: db.prepare('SELECT * FROM password_resets WHERE token_hash = ?'),
    deleteUserResets: db.prepare('DELETE FROM password_resets WHERE user_id = ?'),
    deleteExpiredResets: db.prepare('DELETE FROM password_resets WHERE expires_at <= ?'),
  };

  return {
    userByEmail: (email: string) => q.userByEmail.get(email) as UserRow | undefined,
    userById: (id: number) => q.userById.get(id) as UserRow | undefined,
    /** `verified`: the address is already proven (e.g. by Google). */
    insertUser(email: string, name: string, passwordHash: string, now: number, googleSub: string | null = null, verified = false): UserRow {
      const { lastInsertRowid } = q.insertUser.run(email, name, passwordHash, googleSub, verified ? now : null, now);
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
    deleteExpired: (now: number) =>
      Number(q.deleteExpired.run(now).changes) + Number(q.deleteExpiredResets.run(now).changes) + Number(q.deleteExpiredVerifications.run(now).changes),
    markVerified: (id: number, now: number) => void q.markVerified.run(now, id),
    /** Stores a verification token (hashed). Older tokens for the user stop working. */
    insertVerification(tokenHash: string, userId: number, now: number, expiresAt: number) {
      q.deleteUserVerifications.run(userId);
      q.insertVerification.run(tokenHash, userId, now, expiresAt);
    },
    verification: (tokenHash: string) => q.verification.get(tokenHash) as ResetRow | undefined,
    deleteUserVerifications: (userId: number) => void q.deleteUserVerifications.run(userId),
    /** Stores a reset token (hashed). Older tokens for the user stop working. */
    insertReset(tokenHash: string, userId: number, now: number, expiresAt: number) {
      q.deleteUserResets.run(userId);
      q.insertReset.run(tokenHash, userId, now, expiresAt);
    },
    reset: (tokenHash: string) => q.reset.get(tokenHash) as ResetRow | undefined,
    /** Tokens are single-use: consuming one removes every token for that user. */
    deleteUserResets: (userId: number) => void q.deleteUserResets.run(userId),
    close: () => db.close(),
  };
}

export type Database = ReturnType<typeof openDatabase>;
