import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../lib/storage';
import { previewText } from './format';
import { EMOJI_GROUPS, findSticker, recentStickers, rememberSticker, STICKERS, stickerUrl } from './stickers';

describe('stickers', () => {
  it('each has its image and an id the database accepts', () => {
    expect(STICKERS.length).toBeGreaterThan(40);
    for (const s of STICKERS) {
      expect(s.id).toMatch(/^[a-z0-9-]{1,60}$/); // same rule as send_message
      expect(existsSync(resolve(__dirname, '../../public', stickerUrl(s.id).slice(1))), s.id).toBe(true);
    }
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
  });

  it('finds stickers by id', () => {
    expect(findSticker('red-heart')?.label).toBe('Red heart');
    expect(findSticker('not-a-sticker')).toBeUndefined();
  });

  it('remembers recent stickers, newest first, without repeats', () => {
    const store = memoryStore();
    rememberSticker(store, 'fire');
    rememberSticker(store, 'red-heart');
    rememberSticker(store, 'fire');
    rememberSticker(store, 'gone-from-the-set');
    expect(recentStickers(store).map((s) => s.id)).toEqual(['fire', 'red-heart']);
  });

  it('shows as "Sticker" in the chat list and notifications', () => {
    expect(previewText({ kind: 'sticker', body: 'fire', attachment_name: null, duration_ms: null, deleted_at: null })).toBe('Sticker');
  });
});

describe('emoji picker', () => {
  it('has only emoji, with old symbols forced to colour', () => {
    const all = EMOJI_GROUPS.flatMap((g) => g.emoji);
    expect(all.length).toBeGreaterThan(200);
    for (const e of all) expect(e).toMatch(/^\p{Extended_Pictographic}/u);
    expect(all).toContain('❤️');
  });
});
