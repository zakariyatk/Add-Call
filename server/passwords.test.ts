import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './passwords.ts';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterY', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('treats unknown formats as a mismatch and flags old parameters', async () => {
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(needsRehash('scrypt$16384$8$1$s$h')).toBe(true);
    expect(needsRehash(await hashPassword('x'))).toBe(false);
  });

  it('normalises Unicode so the same password typed differently still matches', async () => {
    const hash = await hashPassword('café-secret');
    expect(await verifyPassword('café-secret', hash)).toBe(true);
  });
});
