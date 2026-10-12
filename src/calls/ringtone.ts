type Tone = readonly (readonly [freq: number, offset: number, length: number])[];

/** Incoming: a soft two-tone ring. */
const RING: Tone = [
  [880, 0, 0.16],
  [660, 0.18, 0.16],
  [880, 0.5, 0.16],
  [660, 0.68, 0.16],
];
/** Outgoing: the caller hears a low "ring… ring…" while the other phone rings. */
const RINGBACK: Tone = [
  [440, 0, 1],
  [480, 0, 1],
];

/** Ring and ringback tones generated with Web Audio — no audio files to ship. */
export class Ringtone {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

  constructor(private readonly kind: 'ring' | 'ringback' = 'ring') {}

  start(): void {
    if (this.timer !== null) return;
    try {
      this.ctx ??= new AudioContext();
    } catch {
      return; // no audio support
    }
    const [tone, volume, every] = this.kind === 'ring' ? [RING, 0.12, 2500] : [RINGBACK, 0.05, 3000];
    const ring = () => {
      const ctx = this.ctx!;
      const t = ctx.currentTime;
      for (const [freq, offset, length] of tone) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + offset);
        gain.gain.exponentialRampToValueAtTime(volume, t + offset + 0.02);
        gain.gain.setValueAtTime(volume, t + offset + length - 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + length + 0.02);
      }
      // Phones also buzz for incoming calls.
      if (this.kind === 'ring') navigator.vibrate?.([400, 200, 400]);
    };
    void this.ctx.resume().catch(() => {});
    ring();
    this.timer = window.setInterval(ring, every);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.kind === 'ring') navigator.vibrate?.(0);
  }
}
