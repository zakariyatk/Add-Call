import { SIGNALING_PATH, type ClientMessage, type ServerMessage } from './protocol';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'replaced' | 'signed-out';

/**
 * WebSocket to the signaling server, with automatic reconnect (1s → 15s
 * backoff). The server identifies us from the session cookie on connect.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: number | null = null;
  private stopped = true;

  constructor(
    private readonly onMessage: (msg: ServerMessage) => void,
    private readonly onStatus: (s: ConnectionStatus) => void,
    private readonly url = defaultUrl(),
  ) {}

  start(): void {
    if (!this.stopped) return;
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
    if (this.stopped) return;
    this.onStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        this.retry = 0;
        this.onStatus('online');
      }
      if (msg.type === 'replaced' || msg.type === 'signed-out') {
        this.stopped = true;
        this.onStatus(msg.type);
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
