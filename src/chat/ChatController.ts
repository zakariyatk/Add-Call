import type { RealtimeChannel } from '@supabase/supabase-js';
import { notifyMessage } from '../calls/notify';
import { Rejoiner } from '../lib/rejoin';
import { supabase } from '../lib/supabase';
import { rememberAvatar } from '../profile/avatars';
import { MAX_ATTACHMENT_BYTES, MAX_TEXT, mergeMessages, previewText, safeFileName, toConversation } from './format';
import { compressImage, voiceExtension } from './media';
import type { Conversation, ConversationRow, Message, MessageKind, MessageRow } from './types';

/*
 * Owns chats for the signed-in user: the conversation list, the messages of
 * open conversations, sending (with uploads), ticks, "typing…" and new-message
 * notifications. Messages are rows in public.messages, changed only through
 * database functions and watched over Realtime on a private channel; files
 * live in the private "chat-media" bucket. React subscribes to snapshots (see
 * useChat); nothing here depends on React.
 */

export interface ChatSnapshot {
  connection: 'offline' | 'connecting' | 'online';
  /** Newest first. */
  conversations: Conversation[];
  /** The list has been loaded at least once. */
  loaded: boolean;
  /** Oldest first, per conversation id. */
  messages: Record<string, Message[]>;
  /** Older messages exist on the server. */
  hasMore: Record<string, boolean>;
  /** The other person is typing. */
  typing: Record<string, boolean>;
  unreadTotal: number;
  /** A problem to show (file too large, no connection…). */
  notice: string | null;
}

export interface ChatUser {
  id: string;
  email: string;
  name: string;
}

const PAGE = 40;
const TYPING_SHOWN_MS = 4000;
const TYPING_SEND_EVERY_MS = 2500;
const SIGNED_URL_SECONDS = 3600;

const EMPTY: ChatSnapshot = {
  connection: 'offline',
  conversations: [],
  loaded: false,
  messages: {},
  hasMore: {},
  typing: {},
  unreadTotal: 0,
  notice: null,
};

function errorText(err: unknown, fallback: string): string {
  const m = (err as { message?: string } | null)?.message;
  return m && !/^(TypeError|Failed to fetch)/.test(m) ? m : fallback;
}

export class ChatController {
  private snapshot: ChatSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private me: ChatUser | null = null;
  private inbox: RealtimeChannel | null = null;
  private typingChannel: RealtimeChannel | null = null;
  private active: string | null = null;
  private lastTypingSent = 0;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private deliveredTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private signed = new Map<string, { url: string; until: number }>();
  /** Local previews (object URLs) of photos and voice notes this device sent. */
  private previews = new Map<string, string>();
  private isOnline: (userId: string) => boolean = () => false;
  /** Rebuilds the channel when the server drops it and it doesn't come back. */
  private rejoiner = new Rejoiner(() => void this.rejoin());
  /** A channel still being removed. */
  private leaving: Promise<unknown> = Promise.resolve();

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  // ----- store interface for useSyncExternalStore -----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<ChatSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (patch.conversations) next.unreadTotal = patch.conversations.reduce((n, c) => n + c.unread, 0);
    this.snapshot = next;
    this.listeners.forEach((fn) => fn());
  }

  // ----- lifecycle -----
  connect(user: ChatUser) {
    if (this.me?.id === user.id && this.inbox) return;
    this.disconnect();
    this.me = user;
    this.set({ ...EMPTY, connection: 'connecting' });
    // supabase-js hands back a channel that is still closing instead of a new one.
    void this.leaving.then(() => {
      if (this.me === user && !this.inbox) this.join(user);
    });
  }

  private join(user: ChatUser) {
    this.set({ connection: 'connecting' });
    this.rejoiner.schedule(); // in case the channel never answers
    const onRow = (p: { eventType: string; new: unknown }) => this.onRow(p.new as MessageRow, p.eventType === 'INSERT');
    const inbox = supabase
      .channel(`chat:${user.id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, onRow)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, onRow)
      // My own messages: ticks, and messages sent from my other devices.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` }, onRow);
    this.inbox = inbox;
    inbox.subscribe((status, err) => {
      if (this.inbox !== inbox || this.me !== user) return; // removed on purpose
      if (status === 'SUBSCRIBED') {
        this.rejoiner.ok();
        this.set({ connection: 'online' });
        // Catch up on anything missed while connecting.
        void this.refresh();
        if (this.active) {
          void this.loadMessages(this.active);
          if (!this.typingChannel) this.joinTyping(this.active);
        }
        this.markDeliveredSoon();
      } else {
        console.warn('[chat] channel', status, err?.message ?? '');
        this.set({ connection: 'connecting' });
        this.rejoiner.schedule();
      }
    });
  }

  /** Drops what is left of the channel and joins again, unless already back. Chats on screen stay. */
  private async rejoin() {
    const me = this.me;
    if (!me || this.snapshot.connection === 'online') return;
    this.leaveInbox();
    await this.leaving;
    if (this.me === me && !this.inbox) this.join(me);
  }

  /** The app came back to the front or the network returned: reconnect now if needed. */
  wake() {
    if (this.me && this.snapshot.connection !== 'online') this.rejoiner.now();
  }

  private leaveInbox() {
    const inbox = this.inbox;
    this.inbox = null;
    if (inbox) this.leaving = Promise.all([this.leaving, supabase.removeChannel(inbox)]);
  }

  disconnect() {
    this.rejoiner.cancel();
    this.leaveInbox();
    this.leaveTyping();
    // `active` stays: the same chat is still on screen when we reconnect.
    this.me = null;
    this.signed.clear();
    for (const url of this.previews.values()) URL.revokeObjectURL(url);
    this.previews.clear();
    this.set({ ...EMPTY });
  }

  /** Lets the controller ask whether someone is in the app right now (calls presence). */
  setOnlineLookup(fn: (userId: string) => boolean) {
    this.isOnline = fn;
  }

  dismissNotice = () => this.set({ notice: null });

  // ----- conversations -----
  async refresh(): Promise<void> {
    const me = this.me;
    if (!me) return;
    const { data, error } = await supabase.rpc('list_conversations');
    if (this.me !== me) return;
    if (error) return void console.warn('[chat] list', error.message);
    const conversations = ((data ?? []) as ConversationRow[]).map(toConversation);
    for (const c of conversations) rememberAvatar(c.peer.email, c.peer.avatarPath, c.peer.username);
    // The open chat is being read right now.
    if (this.active && this.isVisible()) for (const c of conversations) if (c.id === this.active) c.unread = 0;
    this.set({ conversations, loaded: true });
  }

  private refreshSoon() {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 400);
  }

  /** Opens (or starts) the chat with someone. Resolves to its id. */
  async openWith(email: string): Promise<string> {
    const { data, error } = await supabase.rpc('open_conversation', { p_email: email.trim().toLowerCase() });
    if (error) throw new Error(errorText(error, 'Could not open this chat.'));
    const row = (data as { id: string; peer_id: string; peer_email: string; peer_name: string; peer_avatar: string | null }[])[0];
    if (!row) throw new Error('Could not open this chat.');
    rememberAvatar(row.peer_email, row.peer_avatar);
    if (!this.snapshot.conversations.some((c) => c.id === row.id)) {
      const conv: Conversation = {
        id: row.id,
        peer: { id: row.peer_id, email: row.peer_email, name: row.peer_name || row.peer_email, avatarPath: row.peer_avatar, username: null },
        updatedAt: Date.now(),
        unread: 0,
        last: null,
      };
      this.set({ conversations: [conv, ...this.snapshot.conversations] });
    }
    return row.id;
  }

  conversation(id: string): Conversation | undefined {
    return this.snapshot.conversations.find((c) => c.id === id);
  }

  /** The chat on screen (null when none): it's marked read and shows "typing…". */
  setActive(id: string | null) {
    if (id === this.active) return;
    this.active = id;
    this.leaveTyping();
    if (!id) return;
    if (!this.snapshot.messages[id]) void this.loadMessages(id);
    this.markRead(id);
    this.joinTyping(id);
  }

  // ----- messages -----
  async loadMessages(id: string): Promise<void> {
    const me = this.me;
    if (!me) return;
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(PAGE);
    if (this.me !== me) return;
    if (error) return void this.set({ notice: errorText(error, 'Could not load messages.') });
    const rows = (data ?? []) as MessageRow[];
    const current = this.snapshot.messages[id] ?? [];
    this.set({
      messages: { ...this.snapshot.messages, [id]: mergeMessages(current, rows.reverse()) },
      hasMore: { ...this.snapshot.hasMore, [id]: this.snapshot.hasMore[id] ?? rows.length === PAGE },
    });
    if (id === this.active) this.markRead(id);
  }

  async loadOlder(id: string): Promise<void> {
    const oldest = this.snapshot.messages[id]?.find((m) => !m.local);
    if (!oldest) return;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    if (error) return void this.set({ notice: errorText(error, 'Could not load older messages.') });
    const rows = (data ?? []) as MessageRow[];
    this.set({
      messages: { ...this.snapshot.messages, [id]: mergeMessages(this.snapshot.messages[id] ?? [], rows.reverse()) },
      hasMore: { ...this.snapshot.hasMore, [id]: rows.length === PAGE },
    });
  }

  sendText = (conversationId: string, text: string) => {
    const body = text.trim().slice(0, MAX_TEXT);
    if (body) void this.send(conversationId, { kind: 'text', body });
  };

  /** Sends a picked file: as a photo (compressed) when asPhoto and it is one, otherwise as a file. */
  sendFile = async (conversationId: string, file: File, asPhoto: boolean) => {
    if (file.size > MAX_ATTACHMENT_BYTES) return this.set({ notice: `${file.name} is larger than 25 MB.` });
    if (asPhoto && /^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type)) {
      try {
        const { blob, width, height } = await compressImage(file);
        const type = blob.type || 'image/jpeg';
        const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
        const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`;
        return void this.send(conversationId, { kind: 'image', width, height }, { blob, name, mime: type });
      } catch {
        /* the browser can't read this photo (e.g. HEIC on desktop): send it as a file */
      }
    }
    void this.send(conversationId, { kind: 'file' }, { blob: file, name: file.name || 'file', mime: file.type || 'application/octet-stream' });
  };

  sendSticker = (conversationId: string, stickerId: string) => {
    void this.send(conversationId, { kind: 'sticker', body: stickerId });
  };

  sendVoice = (conversationId: string, blob: Blob, durationMs: number) => {
    const mime = blob.type || 'audio/webm';
    void this.send(conversationId, { kind: 'voice', duration_ms: Math.round(durationMs) }, { blob, name: `voice.${voiceExtension(mime)}`, mime });
  };

  retry = (conversationId: string, id: string) => {
    const m = this.snapshot.messages[conversationId]?.find((x) => x.id === id);
    if (!m?.local || m.local.status !== 'failed') return;
    const upload = m.local.blob ? { blob: m.local.blob, name: m.attachment_name ?? 'file', mime: m.attachment_mime ?? m.local.blob.type } : undefined;
    void this.send(conversationId, m, upload, id);
  };

  /** Drops a message that failed to send. */
  discard = (conversationId: string, id: string) => {
    const list = this.snapshot.messages[conversationId] ?? [];
    this.dropPreview(id);
    this.set({ messages: { ...this.snapshot.messages, [conversationId]: list.filter((m) => m.id !== id || !m.local) } });
  };

  deleteMessage = async (conversationId: string, id: string) => {
    const { data, error } = await supabase.rpc('delete_message', { p_id: id });
    if (error) return this.set({ notice: errorText(error, 'Could not delete this message.') });
    if (typeof data === 'string' && data) void supabase.storage.from('chat-media').remove([data]);
    const list = this.snapshot.messages[conversationId] ?? [];
    const now = new Date().toISOString();
    this.dropPreview(id);
    this.set({
      messages: {
        ...this.snapshot.messages,
        [conversationId]: list.map((m) => (m.id === id ? { ...m, deleted_at: now, body: '', attachment_path: null } : m)),
      },
    });
    this.updateSummary(conversationId, (c) => (c.last?.id === id ? { ...c, last: { ...c.last, deleted_at: now, body: '' } } : c));
  };

  private async send(
    conversationId: string,
    draft: Partial<MessageRow> & { kind: MessageKind },
    upload?: { blob: Blob; name: string; mime: string },
    retryId?: string,
  ) {
    const me = this.me;
    const conv = this.conversation(conversationId);
    if (!me || !conv) return;
    const id = retryId ?? crypto.randomUUID();
    const createdAt = draft.created_at && retryId ? draft.created_at : new Date().toISOString();
    if (upload && (draft.kind === 'image' || draft.kind === 'voice') && !this.previews.has(id)) this.previews.set(id, URL.createObjectURL(upload.blob));

    const local: Message = {
      id,
      conversation_id: conversationId,
      sender_id: me.id,
      recipient_id: conv.peer.id,
      body: '',
      attachment_path: null,
      attachment_name: upload?.name ?? null,
      attachment_size: upload?.blob.size ?? null,
      attachment_mime: upload?.mime ?? null,
      duration_ms: null,
      width: null,
      height: null,
      delivered_at: null,
      read_at: null,
      deleted_at: null,
      ...draft,
      created_at: createdAt,
      local: { status: 'sending', blob: upload?.blob },
    };
    this.put(local);

    try {
      let path: string | null = null;
      if (upload) {
        path = `${conversationId}/${me.id}/${id}-${safeFileName(upload.name)}`;
        const { error } = await supabase.storage.from('chat-media').upload(path, upload.blob, { contentType: upload.mime, upsert: false });
        // "Already exists" means an earlier try got this far.
        if (error && !/exists|duplicate/i.test(error.message)) throw error;
      }
      const { data, error } = await supabase.rpc('send_message', {
        p_id: id,
        p_conversation: conversationId,
        p_kind: local.kind,
        p_body: local.body,
        p_attachment_path: path,
        p_attachment_name: upload?.name ?? null,
        p_attachment_size: upload?.blob.size ?? null,
        p_attachment_mime: upload?.mime ?? null,
        p_duration_ms: local.duration_ms,
        p_width: local.width,
        p_height: local.height,
      });
      if (error) throw error;
      if (this.me !== me) return;
      this.put(data as MessageRow);
      // Not in the app: tell their phone.
      if (!this.isOnline(conv.peer.id)) {
        void supabase.functions.invoke('call-push', { body: { action: 'message', messageId: id } }).then(({ error: e }) => {
          if (e) console.warn('[chat] push', e.message);
        });
      }
    } catch (err) {
      if (this.me !== me) return;
      this.put({ ...local, local: { status: 'failed', blob: upload?.blob, error: errorText(err, 'Not sent. Tap to try again.') } });
    }
  }

  /** Adds or updates one message, and the chat list entry it belongs to. */
  private put(m: Message) {
    const list = this.snapshot.messages[m.conversation_id];
    if (list || m.local) {
      this.set({ messages: { ...this.snapshot.messages, [m.conversation_id]: mergeMessages(list ?? [], [m]) } });
    }
    this.updateSummary(m.conversation_id, (c) => {
      if (c.last && c.last.id !== m.id && Date.parse(c.last.created_at) > Date.parse(m.created_at)) return c;
      return { ...c, updatedAt: Math.max(c.updatedAt, Date.parse(m.created_at)), last: m };
    });
  }

  private updateSummary(id: string, fn: (c: Conversation) => Conversation) {
    let found = false;
    const conversations = this.snapshot.conversations
      .map((c) => {
        if (c.id !== id) return c;
        found = true;
        return fn(c);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (found) this.set({ conversations });
    return found;
  }

  private onRow(row: MessageRow, inserted: boolean) {
    const me = this.me;
    if (!me || !row?.id) return;
    const incoming = row.recipient_id === me.id;
    const known = this.snapshot.messages[row.conversation_id]?.some((m) => m.id === row.id) ?? false;
    const isNew = inserted && !known && !row.deleted_at && !row.read_at;
    this.put(row);
    if (!this.conversation(row.conversation_id)) return this.refreshSoon(); // a new chat

    if (!incoming) return;
    if (row.deleted_at || row.read_at) {
      // Deleted by them, or read on another of my devices: recount.
      if (!this.isActiveAndVisible(row.conversation_id)) this.refreshSoon();
      return;
    }
    if (!isNew) return;
    this.setTyping(row.conversation_id, false);
    if (this.isActiveAndVisible(row.conversation_id)) {
      this.markRead(row.conversation_id);
    } else {
      this.updateSummary(row.conversation_id, (c) => ({ ...c, unread: c.unread + 1 }));
      const conv = this.conversation(row.conversation_id);
      if (conv) notifyMessage(row.conversation_id, conv.peer.name, previewText(row));
    }
    this.markDeliveredSoon();
  }

  // ----- read / delivered -----
  private isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  private isActiveAndVisible = (id: string) => this.active === id && this.isVisible();

  private onVisibility = () => {
    if (this.active && this.isVisible()) this.markRead(this.active);
  };

  private markRead(id: string) {
    if (!this.me || !this.isVisible()) return;
    const conv = this.conversation(id);
    const list = this.snapshot.messages[id] ?? [];
    const unreadHere = list.some((m) => m.recipient_id === this.me?.id && !m.read_at && !m.deleted_at);
    if (!unreadHere && !conv?.unread) return;
    const now = new Date().toISOString();
    this.set({
      messages: {
        ...this.snapshot.messages,
        [id]: list.map((m) => (m.recipient_id === this.me?.id && !m.read_at ? { ...m, read_at: now, delivered_at: m.delivered_at ?? now } : m)),
      },
    });
    this.updateSummary(id, (c) => ({ ...c, unread: 0 }));
    void supabase.rpc('mark_read', { p_conversation: id }).then(({ error }) => error && console.warn('[chat] mark read', error.message));
  }

  private markDeliveredSoon() {
    if (this.deliveredTimer) return;
    this.deliveredTimer = setTimeout(() => {
      this.deliveredTimer = null;
      if (this.me) void supabase.rpc('mark_delivered').then(({ error }) => error && console.warn('[chat] delivered', error.message));
    }, 800);
  }

  // ----- typing -----
  private joinTyping(id: string) {
    const me = this.me;
    if (!me) return;
    this.typingChannel = supabase
      .channel(`typing:${id}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, (p) => {
        if ((p.payload as { userId?: string } | undefined)?.userId !== me.id) this.setTyping(id, true);
      })
      .subscribe();
  }

  private leaveTyping() {
    if (this.typingChannel) void supabase.removeChannel(this.typingChannel);
    this.typingChannel = null;
  }

  private setTyping(id: string, typing: boolean) {
    const timer = this.typingTimers.get(id);
    if (timer) clearTimeout(timer);
    this.typingTimers.delete(id);
    if (typing) this.typingTimers.set(id, setTimeout(() => this.setTyping(id, false), TYPING_SHOWN_MS));
    if (!!this.snapshot.typing[id] !== typing) this.set({ typing: { ...this.snapshot.typing, [id]: typing } });
  }

  /** Call while the person types; tells the other side at most every few seconds. */
  notifyTyping = () => {
    const now = Date.now();
    if (!this.typingChannel || !this.me || now - this.lastTypingSent < TYPING_SEND_EVERY_MS) return;
    this.lastTypingSent = now;
    void this.typingChannel.send({ type: 'broadcast', event: 'typing', payload: { userId: this.me.id } });
  };

  // ----- files -----
  /** A local preview for a photo or voice note this device is sending (or just sent). */
  previewFor = (id: string) => this.previews.get(id) ?? null;

  private dropPreview(id: string) {
    const url = this.previews.get(id);
    if (url) URL.revokeObjectURL(url);
    this.previews.delete(id);
  }

  /** A short-lived link to an attachment (download: makes the browser save it under its name). */
  async mediaUrl(path: string, download?: string): Promise<string> {
    const key = download ? `${path}\n${download}` : path;
    const hit = this.signed.get(key);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data, error } = await supabase.storage
      .from('chat-media')
      .createSignedUrl(path, SIGNED_URL_SECONDS, download ? { download } : undefined);
    if (error || !data) throw new Error(errorText(error, 'Could not open this file.'));
    this.signed.set(key, { url: data.signedUrl, until: Date.now() + (SIGNED_URL_SECONDS - 120) * 1000 });
    return data.signedUrl;
  }
}
