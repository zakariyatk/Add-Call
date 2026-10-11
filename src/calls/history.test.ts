import { describe, expect, it } from 'vitest';
import { memoryStore } from '../lib/storage';
import { addToHistory, loadHistory } from './history';
import type { CallRecord } from './types';

const rec = (id: string, at: number): CallRecord => ({ id, at, peer: { email: 'b@x.io', name: 'B' }, direction: 'outgoing', duration: 3, video: false });

describe('call history', () => {
  it('persists per user, newest first, without duplicates', () => {
    const store = memoryStore();
    let h = addToHistory(store, 'a@x.io', [], rec('1', 10));
    h = addToHistory(store, 'a@x.io', h, rec('2', 20));
    h = addToHistory(store, 'a@x.io', h, rec('2', 20));
    expect(h.map((r) => r.id)).toEqual(['2', '1']);
    expect(loadHistory(store, 'a@x.io')).toEqual(h);
    expect(loadHistory(store, 'other@x.io')).toEqual([]);
  });

  it('drops corrupt entries', () => {
    const store = memoryStore();
    store.setItem('addcall.history.a@x.io', JSON.stringify([rec('1', 1), { id: 2 }, null]));
    expect(loadHistory(store, 'a@x.io').map((r) => r.id)).toEqual(['1']);
    store.setItem('addcall.history.a@x.io', '{oops');
    expect(loadHistory(store, 'a@x.io')).toEqual([]);
  });
});
