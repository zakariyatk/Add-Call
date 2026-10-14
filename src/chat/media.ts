/*
 * Browser-side media for chats and profile pictures: shrinking photos before
 * upload (phones take 4–12 MB photos; a chat needs ~200 KB) and recording
 * voice notes.
 */

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The decoded image stays usable after the URL is revoked.
    URL.revokeObjectURL(url);
  }
}

/** Encodes a canvas as WebP (or JPEG where WebP isn't supported). */
export function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const as = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  return as('image/webp').then(async (b) => {
    // Older Safari can't encode WebP and quietly returns PNG; JPEG is smaller then.
    if (b && b.type === 'image/webp') return b;
    const jpeg = await as('image/jpeg');
    if (!jpeg) throw new Error('Could not process this photo.');
    return jpeg;
  });
}

/** Scales a photo down to fit maxSide (keeping its shape) and re-encodes it. */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process this photo.');
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await encodeCanvas(canvas, quality);
  // Already small and well compressed: keep the original.
  if (scale === 1 && file.size <= blob.size && /^image\/(jpeg|webp)$/.test(file.type)) return { blob: file, width, height };
  return { blob, width, height };
}

const VOICE_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
/** Voice notes stop on their own after this long. */
export const MAX_VOICE_MS = 5 * 60_000;

export const canRecordVoice = () => typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

/** Records one voice note from the microphone. */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private limit: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onAutoStop: () => void) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mimeType = VOICE_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
    this.startedAt = Date.now();
    this.limit = setTimeout(this.onAutoStop, MAX_VOICE_MS);
  }

  elapsed = () => (this.startedAt ? Date.now() - this.startedAt : 0);

  /** Stops and returns the recording (null if cancelled or empty). */
  stop(keep = true): Promise<{ blob: Blob; durationMs: number } | null> {
    const recorder = this.recorder;
    const durationMs = this.elapsed();
    if (this.limit) clearTimeout(this.limit);
    this.limit = null;
    this.recorder = null;
    this.startedAt = 0;
    const release = () => {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
    };
    if (!recorder || recorder.state === 'inactive') {
      release();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        release();
        const type = (recorder.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(this.chunks, { type });
        this.chunks = [];
        resolve(keep && blob.size > 0 && durationMs >= 500 ? { blob, durationMs } : null);
      };
      recorder.stop();
    });
  }
}

/** File extension for a recorded voice note's type. */
export const voiceExtension = (type: string) => (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm');
