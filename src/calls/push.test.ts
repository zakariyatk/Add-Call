import { describe, expect, it } from 'vitest';
import { base64UrlToBytes } from './push';

describe('base64UrlToBytes', () => {
  it('decodes unpadded base64url, as VAPID public keys are written', () => {
    expect([...base64UrlToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });

  it('decodes a 65-byte uncompressed P-256 key', () => {
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const bytes = base64UrlToBytes(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});
