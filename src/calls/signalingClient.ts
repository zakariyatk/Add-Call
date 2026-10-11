import { SIGNALING_PATH, type ClientMessage, type ServerMessage, type UserInfo } from './protocol';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'replaced';

/**
 * WebSocket to the signaling server, with automatic reconnect (1s → 15s
 * backoff) and a hello on every (re)connect.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: number | null = null;
  private stopped = true;
  private user: UserInfo | null = null;

  constructor(
    private readonly onMessage: (msg: ServerMessage) => void,
    private readonly onStatus: (s: ConnectionStatus) => void,
    private readonly url = defaultUrl(),
  ) {}

  start(user: UserInfo): void {
    this.user = user;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.ws?.close(1000);
    this.ws = null;
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private open() {
    if (this.stopped || !this.user) return;
    this.onStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ type: 'hello', email: this.user!.email, name: this.user!.name } satisfies ClientMessage));
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'welcome') this.onStatus('online');
      if (msg.type === 'replaced') {
        this.stopped = true;
        this.onStatus('replaced');
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      this.onStatus('offline');
      const delay = Math.min(15_000, 1000 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.open(), delay);
    };
  }
}

function defaultUrl(): string {
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${SIGNALING_PATH}`;
}
