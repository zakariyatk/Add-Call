/** A soft two-tone ring generated with Web Audio — no audio files to ship. */
export class Ringtone {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

  start(): void {
    if (this.timer !== null) return;
    try {
      this.ctx ??= new AudioContext();
    } catch {
      return; // no audio support
    }
    const ring = () => {
      const ctx = this.ctx!;
      const t = ctx.currentTime;
      for (const [freq, offset] of [
        [880, 0],
        [660, 0.18],
        [880, 0.5],
        [660, 0.68],
      ] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.12, t + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + 0.18);
      }
    };
    void this.ctx.resume().catch(() => {});
    ring();
    this.timer = window.setInterval(ring, 2500);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
}
