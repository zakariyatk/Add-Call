type Tone = readonly (readonly [freq: number, offset: number, length: number])[];

/** Incoming ringtones people choose from (Settings → Calling → Ringtone). */
export const RINGTONES = {
  /** A two-tone ring. */
  classic: [
    [880, 0, 0.16],
    [660, 0.18, 0.16],
    [880, 0.5, 0.16],
    [660, 0.68, 0.16],
  ],
  /** Three rising notes. */
  bright: [
    [1047, 0, 0.12],
    [1319, 0.14, 0.12],
    [1568, 0.28, 0.2],
  ],
  /** Two long, low notes. */
  soft: [
    [523, 0, 0.45],
    [659, 0.5, 0.6],
  ],
} as const satisfies Record<string, Tone>;

export type RingtoneId = keyof typeof RINGTONES;
export const RINGTONE_IDS = Object.keys(RINGTONES) as RingtoneId[];
/** Outgoing: the caller hears a low "ring… ring…" while the other phone rings. */
const RINGBACK: Tone = [
  [440, 0, 1],
  [480, 0, 1],
];

const RING_VOLUME = 0.12;

/** Plays one round of a tone. */
function play(ctx: AudioContext, tone: Tone, volume: number) {
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
}

let previewCtx: AudioContext | null = null;

/** Plays a ringtone once, for choosing one in Settings. */
export function previewRingtone(id: RingtoneId): void {
  try {
    previewCtx ??= new AudioContext();
  } catch {
    return; // no audio support
  }
  void previewCtx.resume().catch(() => {});
  play(previewCtx, RINGTONES[id], RING_VOLUME);
}

/** Ring and ringback tones generated with Web Audio — no audio files to ship. */
export class Ringtone {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  /** Which incoming ringtone plays; takes effect from the next ring. */
  tone: RingtoneId = 'classic';

  constructor(private readonly kind: 'ring' | 'ringback' = 'ring') {}

  start(): void {
    if (this.timer !== null) return;
    try {
      this.ctx ??= new AudioContext();
    } catch {
      return; // no audio support
    }
    const [tone, volume, every] = this.kind === 'ring' ? [RINGTONES[this.tone], RING_VOLUME, 2500] : [RINGBACK, 0.05, 3000];
    const ring = () => {
      play(this.ctx!, tone, volume);
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
