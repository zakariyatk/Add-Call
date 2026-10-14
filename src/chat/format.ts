import type { Conversation, ConversationRow, Message, MessageRow, SendStatus } from './types';

/** Largest attachment the "chat-media" bucket accepts. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT = 4000;
/** Own messages can be deleted for everyone this long after sending. */
export const DELETE_WINDOW_MS = 2 * 24 * 3600_000;

/** 0 → "0 B", 1536 → "1.5 KB", 3_500_000 → "3.3 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)} ${units[i]}`;
}

/** Milliseconds → "0:07", "12:30". */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "14:05" — the time under a message. */
export const formatTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The label between days in a chat: "Today", "Yesterday", "Monday", "3 October 2026". */
export function dayLabel(at: number, now: number): string {
  const start = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((start(now) - start(at)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return new Date(at).toLocaleDateString('en-GB', { weekday: 'long' });
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Whether a day label goes before message i. */
export function startsNewDay(messages: Pick<MessageRow, 'created_at'>[], i: number): boolean {
  if (i === 0) return true;
  const a = new Date(messages[i - 1].created_at);
  const b = new Date(messages[i].created_at);
  return a.toDateString() !== b.toDateString();
}

/** One line describing a message, for the chat list and notifications. */
export function previewText(m: Pick<MessageRow, 'kind' | 'body' | 'attachment_name' | 'duration_ms' | 'deleted_at'>): string {
  if (m.deleted_at) return 'This message was deleted';
  switch (m.kind) {
    case 'image':
      return m.body ? `Photo · ${m.body}` : 'Photo';
    case 'file':
      return m.attachment_name ?? 'File';
    case 'voice':
      return `Voice message (${formatClock(m.duration_ms ?? 0)})`;
    case 'sticker':
      return 'Sticker';
    default:
      return m.body;
  }
}

/** Ticks for a message I sent. */
export function sendStatus(m: Message): SendStatus {
  if (m.local) return m.local.status;
  if (m.read_at) return 'read';
  if (m.delivered_at) return 'delivered';
  return 'sent';
}

/**
 * Adds or updates messages in a conversation, keeping them in time order and
 * never letting a stale update undo a newer state (ticks only move forward).
 */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    const prev = byId.get(m.id);
    if (!prev) {
      byId.set(m.id, m);
      continue;
    }
    if (m.local && !prev.local) continue; // the server's copy already arrived
    byId.set(m.id, {
      ...prev,
      ...m,
      local: m.local,
      delivered_at: m.delivered_at ?? prev.delivered_at,
      read_at: m.read_at ?? prev.read_at,
      deleted_at: m.deleted_at ?? prev.deleted_at,
    });
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

export function toConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    peer: { id: r.peer_id, email: r.peer_email, name: r.peer_name || r.peer_email, avatarPath: r.peer_avatar, username: r.peer_username ?? null },
    updatedAt: Date.parse(r.updated_at),
    unread: r.unread ?? 0,
    last:
      r.last_id && r.last_kind && r.last_created_at && r.last_sender_id
        ? {
            id: r.last_id,
            sender_id: r.last_sender_id,
            kind: r.last_kind,
            body: r.last_body ?? '',
            attachment_name: r.last_attachment_name,
            duration_ms: r.last_duration_ms,
            created_at: r.last_created_at,
            delivered_at: r.last_delivered_at,
            read_at: r.last_read_at,
            deleted_at: r.last_deleted_at,
          }
        : null,
  };
}

/** A file name safe for a storage path: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-80);
  return cleaned || 'file';
}

/** What kind of message a picked file becomes. */
export function kindForFile(file: Pick<File, 'type'>, asPhoto: boolean): 'image' | 'file' {
  return asPhoto && /^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type) ? 'image' : 'file';
}
