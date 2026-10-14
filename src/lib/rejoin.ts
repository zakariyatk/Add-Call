/** Waits before each retry: long enough for a slow join to finish, then backing off. */
export const REJOIN_DELAYS_MS = [5_000, 10_000, 20_000, 30_000];

/**
 * Brings a dropped Realtime connection back. supabase-js retries some failures
 * by itself, but not a channel the server closed (rate limits, restarts, an
 * expired sign-in), which left the app on "Connecting…" until a reload.
 * Controllers call schedule() whenever they aren't fully joined and ok() once
 * they are; if nothing recovers in time, the rejoin callback rebuilds the
 * channels.
 */
export class Rejoiner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(private readonly rejoin: () => void) {}

  /** Not connected: rejoin after the next delay, unless ok() comes first. */
  schedule() {
    if (this.timer) return;
    const delay = REJOIN_DELAYS_MS[Math.min(this.attempt, REJOIN_DELAYS_MS.length - 1)];
    this.attempt++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rejoin();
    }, delay);
  }

  /** Connected: cancel any retry and start from the short delay next time. */
  ok() {
    this.cancel();
    this.attempt = 0;
  }

  /** Retry straight away (the app came back to the front, or the network returned). */
  now() {
    this.cancel();
    this.attempt = 0;
    this.rejoin();
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
