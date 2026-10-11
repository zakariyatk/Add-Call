import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/*
 * Password hashing with scrypt (memory-hard, built into Node).
 * Stored as: scrypt$N$r$p$<salt base64>$<hash base64> so parameters can be
 * raised later without breaking existing hashes.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LEN = 64;
const MAX_MEM = 128 * PARAMS.N * PARAMS.r * 2;

const derive = (password: string, salt: Buffer, opts: ScryptOptions, len: number) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password.normalize('NFKC'), salt, len, { ...opts, maxmem: MAX_MEM * 2 }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS, KEY_LEN);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (![N, r, p].every(Number.isInteger) || expected.length === 0) return false;
  const key = await derive(password, salt, { N, r, p }, expected.length);
  return timingSafeEqual(key, expected);
}

/** Does this hash use weaker parameters than today's? (Rehash on next sign-in.) */
export const needsRehash = (stored: string) => !stored.startsWith(`scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$`);
