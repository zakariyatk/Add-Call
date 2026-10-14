import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { Session } from '../auth/api';
import { brand } from '../branding/brand.config';
import { isEmail } from '../calls/protocol';
import type { Peer } from '../calls/types';
import type { ChatController, ChatSnapshot } from '../chat/ChatController';
import { DELETE_WINDOW_MS, dayLabel, formatBytes, formatClock, formatTime, previewText, sendStatus, startsNewDay } from '../chat/format';
import { canRecordVoice, VoiceRecorder } from '../chat/media';
import type { Conversation, Message } from '../chat/types';
import { Icon } from '../components/Icon';
import { PresenceAvatar, type Presence } from '../components/ui';
import { formatRelative } from '../lib/format';
import { addContact, useContactAction } from '../people/contacts';
import { useUsername } from '../profile/avatars';
import { handle } from '../profile/username';

type Chat = ChatSnapshot & { controller: ChatController };

export function ChatsView({
  me,
  chat,
  chatId,
  now,
  presenceOf,
  onOpen,
  onBack,
  onStart,
  onCall,
  isContact,
}: {
  me: Session;
  chat: Chat;
  chatId: string | null;
  now: number;
  /** Someone's presence (online, on a call, offline). */
  presenceOf: (email: string) => Presence;
  onOpen: (id: string) => void;
  onBack: () => void;
  /** Opens the chat with an @username or email; resolves to an error message, or null. */
  onStart: (query: string) => Promise<string | null>;
  onCall: (p: Peer, video: boolean) => void;
  /** Whether someone is in my list. */
  isContact: (email: string) => boolean;
}) {
  const conv = chatId ? chat.conversations.find((c) => c.id === chatId) : undefined;

  // A chat opened from a notification may not be in the list yet.
  const { controller, loaded } = chat;
  useEffect(() => {
    if (chatId && loaded && !conv) void controller.refresh();
  }, [chatId, loaded, conv, controller]);

  return (
    <div className={`chats ${chatId ? 'has-open-chat' : ''}`}>
      <ChatList me={me} chat={chat} activeId={chatId} now={now} presenceOf={presenceOf} onOpen={onOpen} onStart={onStart} />
      <section className="chat-pane" aria-label={conv ? `Chat with ${conv.peer.name}` : 'Chat'}>
        {conv ? (
          <ChatThread
            key={conv.id}
            me={me}
            conv={conv}
            chat={chat}
            presence={presenceOf(conv.peer.email)}
            listed={isContact(conv.peer.email)}
            onBack={onBack}
            onCall={(video) => onCall({ email: conv.peer.email, name: conv.peer.name }, video)}
          />
        ) : chatId ? (
          <div className="chat-placeholder">
            {chat.loaded ? <p>This chat isn’t available.</p> : <p>Loading…</p>}
            <button type="button" className="btn btn-secondary" onClick={onBack}>
              Back to chats
            </button>
          </div>
        ) : (
          <div className="chat-placeholder">
            <span className="chat-placeholder-icon">
              <Icon name="message" size={28} />
            </span>
            <p>Choose a chat, or start a new one with someone’s @username.</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- list ----------

function ChatList({
  me,
  chat,
  activeId,
  now,
  presenceOf,
  onOpen,
  onStart,
}: {
  me: Session;
  chat: Chat;
  activeId: string | null;
  now: number;
  presenceOf: (email: string) => Presence;
  onOpen: (id: string) => void;
  onStart: (query: string) => Promise<string | null>;
}) {
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const rows = q ? chat.conversations.filter((c) => c.peer.name.toLowerCase().includes(q) || c.peer.email.includes(q)) : chat.conversations;

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase().replace(/^@+/, '');
    if (!isEmail(address) && !/^[a-z0-9._]{3,30}$/.test(address)) return setError(`Type their @username on ${brand.name} (or their email).`);
    setBusy(true);
    setError(null);
    const problem = await onStart(address);
    setBusy(false);
    if (problem) return setError(problem);
    setStarting(false);
    setEmail('');
  };

  return (
    <aside className="chat-list-pane">
      <header className="page-header chat-list-header">
        <h1>Chats</h1>
        <button
          type="button"
          className={`icon-btn ${starting ? 'is-on' : ''}`}
          aria-label={starting ? 'Cancel new chat' : 'New chat'}
          title="New chat"
          aria-expanded={starting}
          onClick={() => (setStarting((s) => !s), setError(null))}
        >
          <Icon name={starting ? 'close' : 'plus'} size={22} />
        </button>
      </header>

      {starting && (
        <form className="card new-chat" onSubmit={start} noValidate>
          <label className="field">
            <span>New chat</span>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="@username or email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'new-chat-error' : undefined}
              autoFocus
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Opening…' : 'Start chat'}
          </button>
          {error && (
            <p id="new-chat-error" role="alert" className="form-error">
              {error}
            </p>
          )}
        </form>
      )}

      {chat.conversations.length > 6 && (
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search chats" aria-label="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}

      {!chat.loaded ? (
        <p className="empty">{chat.connection === 'online' ? 'Loading…' : 'Connecting…'}</p>
      ) : rows.length === 0 ? (
        <p className="empty">{q ? 'No chats match.' : 'No chats yet. Tap + to message someone by their @username.'}</p>
      ) : (
        <ul className="list card chat-list">
          {rows.map((c) => (
            <li key={c.id}>
              <a
                href={`#/chats/${c.id}`}
                className="list-row chat-row"
                aria-current={c.id === activeId ? 'true' : undefined}
                onClick={(e) => (e.preventDefault(), onOpen(c.id))}
              >
                <PresenceAvatar name={c.peer.name} email={c.peer.email} status={presenceOf(c.peer.email)} size={48} />
                <span className="list-main">
                  <span className="chat-row-top">
                    <span className="list-title">{c.peer.name}</span>
                    <span className={`list-meta ${c.unread ? 'is-unread' : ''}`}>{c.last ? formatRelative(Date.parse(c.last.created_at), now) : ''}</span>
                  </span>
                  <span className="chat-row-bottom">
                    <span className="list-sub">
                      {chat.typing[c.id] ? (
                        <span className="typing-text">typing…</span>
                      ) : c.last ? (
                        <>
                          {c.last.sender_id === me.id && !c.last.deleted_at && <Ticks status={c.last.read_at ? 'read' : c.last.delivered_at ? 'delivered' : 'sent'} />}
                          <LastIcon kind={c.last.deleted_at ? 'deleted' : c.last.kind} />
                          {previewText(c.last)}
                        </>
                      ) : (
                        'Say hi'
                      )}
                    </span>
                    {c.unread > 0 && (
                      <span className="unread" aria-label={`${c.unread} unread`}>
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function LastIcon({ kind }: { kind: Message['kind'] | 'deleted' }) {
  const icon = kind === 'image' ? 'image' : kind === 'file' ? 'file' : kind === 'voice' ? 'mic' : kind === 'deleted' ? 'alert' : null;
  return icon ? (
    <span className="last-icon">
      <Icon name={icon} size={15} />
    </span>
  ) : null;
}

function Ticks({ status }: { status: ReturnType<typeof sendStatus> }) {
  const label = { sending: 'Sending', failed: 'Not sent', sent: 'Sent', delivered: 'Delivered', read: 'Read' }[status];
  const icon = status === 'sending' ? 'clock' : status === 'failed' ? 'alert' : status === 'sent' ? 'check' : 'checks';
  return (
    <span className={`ticks is-${status}`} role="img" aria-label={label} title={label}>
      <Icon name={icon} size={16} strokeWidth={2} />
    </span>
  );
}

// ---------- conversation ----------

function ChatThread({
  me,
  conv,
  chat,
  presence,
  listed,
  onBack,
  onCall,
}: {
  me: Session;
  conv: Conversation;
  chat: Chat;
  presence: Presence;
  /** In my list (otherwise the header offers Add). */
  listed: boolean;
  onBack: () => void;
  onCall: (video: boolean) => void;
}) {
  const { controller } = chat;
  const messages = chat.messages[conv.id];
  const hasMore = chat.hasMore[conv.id];
  const typing = chat.typing[conv.id];
  const [selected, setSelected] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Message | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const olderFrom = useRef<number | null>(null);

  // Stay at the newest message unless the person scrolled up to read.
  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (olderFrom.current !== null) {
      el.scrollTop = el.scrollHeight - olderFrom.current; // keep place after loading older messages
      olderFrom.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing]);

  const loadOlder = () => {
    if (scroller.current) olderFrom.current = scroller.current.scrollHeight - scroller.current.scrollTop;
    void controller.loadOlder(conv.id);
  };

  const selectedMsg = selected ? messages?.find((m) => m.id === selected) : undefined;
  const username = useUsername(conv.peer.email) ?? conv.peer.username;
  const status = typing ? 'typing…' : presence === 'online' ? 'online' : presence === 'busy' ? 'on a call' : handle(username, conv.peer.email);
  const adding = useContactAction();

  return (
    <div className="thread">
      {selectedMsg ? (
        <header className="thread-header is-selecting">
          <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setSelected(null)}>
            <Icon name="close" size={22} />
          </button>
          <span className="thread-title">1 selected</span>
          <button
            type="button"
            className="btn btn-secondary btn-danger"
            onClick={() => {
              if (window.confirm('Delete this message for everyone?')) void controller.deleteMessage(conv.id, selectedMsg.id);
              setSelected(null);
            }}
          >
            <Icon name="trash" size={18} /> Delete for everyone
          </button>
        </header>
      ) : (
        <header className="thread-header">
          <button type="button" className="icon-btn thread-back" aria-label="Back to chats" onClick={onBack}>
            <Icon name="back" size={22} />
          </button>
          <PresenceAvatar name={conv.peer.name} email={conv.peer.email} status={presence} size={40} />
          <span className="thread-who">
            <span className="thread-title">{conv.peer.name}</span>
            <span className={`thread-status ${typing || presence === 'online' ? 'is-live' : ''}`}>{status}</span>
          </span>
          {!listed && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Add ${conv.peer.name} to my list`}
              title={adding.error ?? 'Add to my list'}
              disabled={!!adding.busy}
              onClick={() => void adding.run('add', () => addContact(username ?? conv.peer.email))}
            >
              <Icon name="userPlus" size={21} />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label={`Video call ${conv.peer.name}`} title="Video call" onClick={() => onCall(true)}>
            <Icon name="video" size={22} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Call ${conv.peer.name}`} title="Call" onClick={() => onCall(false)}>
            <Icon name="phone" size={21} />
          </button>
        </header>
      )}

      <div className="thread-messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
        {hasMore && (
          <button type="button" className="btn btn-secondary load-older" onClick={loadOlder}>
            Load earlier messages
          </button>
        )}
        {!messages ? (
          <p className="empty">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="thread-empty">
            Messages to {conv.peer.name} appear here. Say hello, or send a photo, file or voice note.
          </p>
        ) : (
          messages.map((m, i) => (
            <MessageItem
              key={m.id}
              m={m}
              mine={m.sender_id === me.id}
              dayLabel={startsNewDay(messages, i) ? dayLabel(Date.parse(m.created_at), Date.now()) : null}
              grouped={i > 0 && messages[i - 1].sender_id === m.sender_id && !startsNewDay(messages, i)}
              selected={selected === m.id}
              controller={controller}
              onSelect={() => setSelected((s) => (s === m.id ? null : m.id))}
              onView={() => setViewing(m)}
            />
          ))
        )}
        {typing && (
          <div className="msg-row is-theirs">
            <div className="bubble typing-bubble" aria-label={`${conv.peer.name} is typing`}>
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {chat.notice && (
        <div className="thread-notice" role="alert">
          <span>{chat.notice}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={controller.dismissNotice}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      <Composer
        disabled={chat.connection !== 'online'}
        onText={(t) => ((stick.current = true), controller.sendText(conv.id, t))}
        onFiles={(files, asPhoto) => {
          stick.current = true;
          for (const f of files) void controller.sendFile(conv.id, f, asPhoto);
        }}
        onVoice={(blob, ms) => ((stick.current = true), controller.sendVoice(conv.id, blob, ms))}
        onTyping={controller.notifyTyping}
      />

      {viewing && <Lightbox m={viewing} controller={controller} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ---------- one message ----------

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Text with web links made clickable. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

function MessageItem({
  m,
  mine,
  dayLabel: day,
  grouped,
  selected,
  controller,
  onSelect,
  onView,
}: {
  m: Message;
  mine: boolean;
  dayLabel: string | null;
  grouped: boolean;
  selected: boolean;
  controller: ChatController;
  onSelect: () => void;
  onView: () => void;
}) {
  const deletable = mine && !m.local && !m.deleted_at && Date.now() - Date.parse(m.created_at) < DELETE_WINDOW_MS;
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const selectHandlers = deletable
    ? {
        onContextMenu: (e: MouseEvent) => (e.preventDefault(), onSelect()),
        onTouchStart: () => {
          cancelPress();
          press.current = setTimeout(onSelect, 450);
        },
        onTouchEnd: cancelPress,
        onTouchMove: cancelPress,
      }
    : {};

  let content: ReactNode;
  if (m.deleted_at) {
    content = (
      <span className="msg-deleted">
        <Icon name="alert" size={15} /> {mine ? 'You deleted this message' : 'This message was deleted'}
      </span>
    );
  } else if (m.kind === 'image') {
    content = <ImageContent m={m} controller={controller} onView={onView} />;
  } else if (m.kind === 'file') {
    content = <FileContent m={m} controller={controller} />;
  } else if (m.kind === 'voice') {
    content = <VoiceContent m={m} controller={controller} mine={mine} />;
  } else {
    content = (
      <span className="msg-text">
        <Linkified text={m.body} />
      </span>
    );
  }

  return (
    <>
      {day && (
        <div className="day-label">
          <span>{day}</span>
        </div>
      )}
      <div className={`msg-row ${mine ? 'is-mine' : 'is-theirs'} ${grouped ? 'is-grouped' : ''} ${selected ? 'is-selected' : ''}`} {...selectHandlers}>
        <div className={`bubble kind-${m.deleted_at ? 'deleted' : m.kind}`}>
          {content}
          {m.kind === 'image' && m.body && !m.deleted_at && (
            <span className="msg-text msg-caption">
              <Linkified text={m.body} />
            </span>
          )}
          <span className="msg-meta">
            <time dateTime={m.created_at}>{formatTime(Date.parse(m.created_at))}</time>
            {mine && !m.deleted_at && <Ticks status={sendStatus(m)} />}
          </span>
        </div>
        {deletable && (
          <button type="button" className="msg-menu" aria-label="Message options" title="Delete" onClick={onSelect}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      {m.local?.status === 'failed' && (
        <div className="msg-failed" role="alert">
          <span>{m.local.error ?? 'Not sent.'}</span>
          <button type="button" className="link-btn" onClick={() => controller.retry(m.conversation_id, m.id)}>
            Try again
          </button>
          <button type="button" className="link-btn" onClick={() => controller.discard(m.conversation_id, m.id)}>
            Remove
          </button>
        </div>
      )}
    </>
  );
}

/** A short-lived link to an attachment, fetched when shown. */
function useMediaUrl(controller: ChatController, m: Message, download?: string): string | null {
  const preview = controller.previewFor(m.id);
  const [url, setUrl] = useState<string | null>(null);
  const path = m.attachment_path;
  useEffect(() => {
    if (preview && !download) return;
    if (!path) return;
    let live = true;
    controller.mediaUrl(path, download).then(
      (u) => live && setUrl(u),
      () => live && setUrl(null),
    );
    return () => {
      live = false;
    };
  }, [controller, path, download, preview]);
  return (!download && preview) || url;
}

function ImageContent({ m, controller, onView }: { m: Message; controller: ChatController; onView: () => void }) {
  const src = useMediaUrl(controller, m);
  const ratio = m.width && m.height ? `${m.width} / ${m.height}` : '4 / 3';
  return (
    <button type="button" className="msg-image" style={{ aspectRatio: ratio }} onClick={onView} disabled={!src} aria-label="Open photo">
      {src ? <img src={src} alt="Photo" loading="lazy" decoding="async" /> : <span className="msg-image-loading" />}
      {m.local?.status === 'sending' && <span className="upload-spinner" aria-label="Sending" />}
    </button>
  );
}

function FileContent({ m, controller }: { m: Message; controller: ChatController }) {
  const href = useMediaUrl(controller, m, m.attachment_name ?? 'file');
  const ext = (m.attachment_name ?? '').split('.').pop()?.slice(0, 4).toUpperCase() ?? '';
  const body = (
    <>
      <span className="file-icon">
        <Icon name="file" size={26} />
        {ext && <small>{ext}</small>}
      </span>
      <span className="file-text">
        <span className="file-name">{m.attachment_name}</span>
        <span className="file-size">{m.local?.status === 'sending' ? 'Uploading…' : formatBytes(m.attachment_size ?? 0)}</span>
      </span>
      {!m.local && (
        <span className="file-download" aria-hidden="true">
          <Icon name="download" size={20} />
        </span>
      )}
    </>
  );
  return href && !m.local ? (
    <a className="msg-file" href={href} download={m.attachment_name ?? true} target="_blank" rel="noopener noreferrer" aria-label={`Download ${m.attachment_name}`}>
      {body}
    </a>
  ) : (
    <span className="msg-file">{body}</span>
  );
}

function VoiceContent({ m, controller, mine }: { m: Message; controller: ChatController; mine: boolean }) {
  const src = useMediaUrl(controller, m);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const total = m.duration_ms ?? 0;

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  };

  return (
    <span className="msg-voice">
      <button type="button" className="voice-play" onClick={toggle} disabled={!src} aria-label={playing ? 'Pause voice message' : 'Play voice message'}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <span className="voice-track">
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={100}
          value={Math.min(pos, total)}
          aria-label="Position"
          onChange={(e) => {
            const v = Number(e.target.value);
            setPos(v);
            if (audio.current) audio.current.currentTime = v / 1000;
          }}
          style={{ '--progress': `${total ? (Math.min(pos, total) / total) * 100 : 0}%` } as CSSProperties}
        />
        <span className="voice-time">{formatClock(playing || pos ? pos : total)}</span>
      </span>
      <span className={`voice-mic ${mine ? 'is-mine' : ''}`} aria-hidden="true">
        <Icon name="mic" size={18} />
      </span>
      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => (setPlaying(false), setPos(0))}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
        />
      )}
    </span>
  );
}

function Lightbox({ m, controller, onClose }: { m: Message; controller: ChatController; onClose: () => void }) {
  const src = useMediaUrl(controller, m);
  const download = useMediaUrl(controller, m, m.attachment_name ?? 'photo.jpg');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox always-dark" role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={22} />
        </button>
        {download && !m.local && (
          <a className="icon-btn" href={download} download aria-label="Save photo" title="Save">
            <Icon name="download" size={22} />
          </a>
        )}
      </div>
      {src && <img src={src} alt="Photo" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

// ---------- composer ----------

function Composer({
  disabled,
  onText,
  onFiles,
  onVoice,
  onTyping,
}: {
  disabled: boolean;
  onText: (text: string) => void;
  onFiles: (files: File[], asPhoto: boolean) => void;
  onVoice: (blob: Blob, durationMs: number) => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const recorder = useRef<VoiceRecorder | null>(null);

  // Grow with the text, up to about five lines.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed(recorder.current?.elapsed() ?? 0), 200);
    return () => window.clearInterval(id);
  }, [recording]);

  // Stop the microphone if the chat closes mid-recording.
  useEffect(() => () => void recorder.current?.stop(false), []);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    onText(text);
    setText('');
    input.current?.focus();
  };

  const finish = async (keep: boolean) => {
    const r = recorder.current;
    recorder.current = null;
    setRecording(false);
    setElapsed(0);
    const result = await r?.stop(keep);
    if (result) onVoice(result.blob, result.durationMs);
  };

  const record = async () => {
    setMicError(null);
    const r = new VoiceRecorder(() => void finish(true));
    try {
      await r.start();
      recorder.current = r;
      setRecording(true);
    } catch {
      setMicError('Allow microphone access to record voice messages.');
    }
  };

  const pick = (asPhoto: boolean) => (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    if (list.length) onFiles(list.slice(0, 10), asPhoto);
  };

  if (recording) {
    return (
      <div className="composer is-recording">
        <button type="button" className="icon-btn" aria-label="Cancel recording" title="Cancel" onClick={() => void finish(false)}>
          <Icon name="trash" size={22} />
        </button>
        <span className="rec-indicator" role="status">
          <i aria-hidden="true" /> Recording {formatClock(elapsed)}
        </span>
        <button type="button" className="send-btn" aria-label="Send voice message" onClick={() => void finish(true)}>
          <Icon name="send" size={20} />
        </button>
      </div>
    );
  }

  const hasText = text.trim().length > 0;
  return (
    <form className="composer" onSubmit={send}>
      {micError && (
        <p className="composer-error" role="alert">
          {micError}
        </p>
      )}
      <button type="button" className="icon-btn" aria-label="Attach a file" title="File" onClick={() => files.current?.click()} disabled={disabled}>
        <Icon name="paperclip" size={22} />
      </button>
      <button type="button" className="icon-btn" aria-label="Send a photo" title="Photo" onClick={() => photos.current?.click()} disabled={disabled}>
        <Icon name="image" size={22} />
      </button>
      <input ref={photos} type="file" accept="image/*" multiple hidden onChange={pick(true)} />
      <input ref={files} type="file" multiple hidden onChange={pick(false)} />
      <textarea
        ref={input}
        className="composer-input"
        rows={1}
        placeholder={disabled ? 'Connecting…' : 'Message'}
        aria-label="Message"
        value={text}
        maxLength={4000}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value) onTyping();
        }}
        onKeyDown={(e) => {
          // Enter sends on a keyboard; on phones Enter is a new line and the button sends.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover) and (pointer: fine)').matches) send(e);
        }}
      />
      {hasText || !canRecordVoice() ? (
        <button type="submit" className="send-btn" aria-label="Send" disabled={!hasText || disabled}>
          <Icon name="send" size={20} />
        </button>
      ) : (
        <button type="button" className="send-btn" aria-label="Record a voice message" title="Voice message" onClick={() => void record()} disabled={disabled}>
          <Icon name="mic" size={21} />
        </button>
      )}
    </form>
  );
}
