import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, kindForFile, mergeMessages, previewText, safeFileName, sendStatus, startsNewDay, toConversation } from './format';
import type { Message } from './types';

const msg = (id: string, at: string, extra: Partial<Message> = {}): Message => ({
  id,
  conversation_id: 'c',
  sender_id: 'me',
  recipient_id: 'you',
  kind: 'text',
  body: id,
  attachment_path: null,
  attachment_name: null,
  attachment_size: null,
  attachment_mime: null,
  duration_ms: null,
  width: null,
  height: null,
  created_at: at,
  delivered_at: null,
  read_at: null,
  deleted_at: null,
  ...extra,
});

describe('formatBytes', () => {
  it('uses the largest sensible unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3_500_000)).toBe('3.3 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds', () => {
    expect(formatClock(7_000)).toBe('0:07');
    expect(formatClock(750_400)).toBe('12:30');
  });
});

describe('previewText', () => {
  it('describes each kind of message', () => {
    const base = { body: '', attachment_name: null, duration_ms: null, deleted_at: null };
    expect(previewText({ ...base, kind: 'text', body: 'Hi' })).toBe('Hi');
    expect(previewText({ ...base, kind: 'image' })).toBe('Photo');
    expect(previewText({ ...base, kind: 'image', body: 'Beach' })).toBe('Photo · Beach');
    expect(previewText({ ...base, kind: 'file', attachment_name: 'plan.pdf' })).toBe('plan.pdf');
    expect(previewText({ ...base, kind: 'voice', duration_ms: 12_000 })).toBe('Voice message (0:12)');
    expect(previewText({ ...base, kind: 'text', body: 'x', deleted_at: '2026-10-15T10:00:00Z' })).toBe('This message was deleted');
  });
});

describe('sendStatus', () => {
  it('moves from sending to read', () => {
    expect(sendStatus(msg('a', '2026-10-15T10:00:00Z', { local: { status: 'sending' } }))).toBe('sending');
    expect(sendStatus(msg('a', '2026-10-15T10:00:00Z'))).toBe('sent');
    expect(sendStatus(msg('a', '2026-10-15T10:00:00Z', { delivered_at: '2026-10-15T10:00:01Z' }))).toBe('delivered');
    expect(sendStatus(msg('a', '2026-10-15T10:00:00Z', { delivered_at: 'x', read_at: '2026-10-15T10:00:02Z' }))).toBe('read');
  });
});

describe('mergeMessages', () => {
  it('keeps messages in time order without duplicates', () => {
    const merged = mergeMessages([msg('b', '2026-10-15T10:00:02Z')], [msg('a', '2026-10-15T10:00:01Z'), msg('b', '2026-10-15T10:00:02Z')]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('replaces the local copy with the server copy', () => {
    const local = msg('a', '2026-10-15T10:00:01Z', { local: { status: 'sending' } });
    const [m] = mergeMessages([local], [msg('a', '2026-10-15T10:00:01Z')]);
    expect(m.local).toBeUndefined();
  });

  it('ignores a late local update once the server copy is in', () => {
    const [m] = mergeMessages([msg('a', '2026-10-15T10:00:01Z')], [msg('a', '2026-10-15T10:00:01Z', { local: { status: 'failed' } })]);
    expect(m.local).toBeUndefined();
  });

  it('never moves ticks backwards', () => {
    const read = msg('a', '2026-10-15T10:00:01Z', { delivered_at: '2026-10-15T10:00:02Z', read_at: '2026-10-15T10:00:03Z' });
    const [m] = mergeMessages([read], [msg('a', '2026-10-15T10:00:01Z', { delivered_at: '2026-10-15T10:00:02Z' })]);
    expect(m.read_at).toBe('2026-10-15T10:00:03Z');
  });
});

describe('startsNewDay', () => {
  it('marks the first message of each day', () => {
    const list = [msg('a', '2026-10-14T10:00:00'), msg('b', '2026-10-14T18:00:00'), msg('c', '2026-10-15T09:00:00')];
    expect(list.map((_, i) => startsNewDay(list, i))).toEqual([true, false, true]);
  });
});

describe('safeFileName', () => {
  it('keeps names readable but safe for storage paths', () => {
    expect(safeFileName('Quarterly report (final).pdf')).toBe('Quarterly_report_final_.pdf');
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd');
    expect(safeFileName('???')).toBe('file');
  });
});

describe('kindForFile', () => {
  it('sends photos as images only from the photo picker', () => {
    expect(kindForFile({ type: 'image/jpeg' }, true)).toBe('image');
    expect(kindForFile({ type: 'image/jpeg' }, false)).toBe('file');
    expect(kindForFile({ type: 'image/gif' }, true)).toBe('file');
    expect(kindForFile({ type: 'application/pdf' }, true)).toBe('file');
  });
});

describe('toConversation', () => {
  it('reads a list_conversations row', () => {
    const c = toConversation({
      id: 'c1',
      peer_id: 'p',
      peer_email: 'bob@example.com',
      peer_name: '',
      peer_avatar: null,
      updated_at: '2026-10-15T10:00:00Z',
      unread: 2,
      last_id: null,
      last_sender_id: null,
      last_kind: null,
      last_body: null,
      last_attachment_name: null,
      last_duration_ms: null,
      last_created_at: null,
      last_delivered_at: null,
      last_read_at: null,
      last_deleted_at: null,
    });
    expect(c.peer.name).toBe('bob@example.com');
    expect(c.unread).toBe(2);
    expect(c.last).toBeNull();
  });
});
