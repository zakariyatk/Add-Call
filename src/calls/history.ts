import { readJson, storageKey, type KeyValueStore } from '../lib/storage';
import type { CallRecord } from './types';

/** Call history is kept per signed-in address, in this browser only. */
const MAX_RECORDS = 200;
const key = (email: string) => storageKey(`history.${email}`);

const valid = (r: Partial<CallRecord> | null): r is CallRecord =>
  !!r &&
  typeof r.id === 'string' &&
  typeof r.at === 'number' &&
  typeof r.duration === 'number' &&
  (r.direction === 'incoming' || r.direction === 'outgoing' || r.direction === 'missed') &&
  typeof r.peer?.email === 'string' &&
  typeof r.peer?.name === 'string';

export function loadHistory(store: KeyValueStore, email: string): CallRecord[] {
  const list = readJson<unknown[]>(store, key(email));
  return Array.isArray(list) ? list.filter((r): r is CallRecord => valid(r as Partial<CallRecord>)) : [];
}

/** Adds a record (newest first, de-duplicated by call id) and persists. */
export function addToHistory(store: KeyValueStore, email: string, history: CallRecord[], record: CallRecord): CallRecord[] {
  if (history.some((r) => r.id === record.id)) return history;
  const next = [record, ...history].sort((a, b) => b.at - a.at).slice(0, MAX_RECORDS);
  store.setItem(key(email), JSON.stringify(next));
  return next;
}

export function clearHistory(store: KeyValueStore, email: string): void {
  store.removeItem(key(email));
}
