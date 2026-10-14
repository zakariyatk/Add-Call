import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { encodeCanvas } from '../chat/media';
import { clampView, cropRect, MAX_ZOOM, MIN_ZOOM, zoomAt, type View } from '../profile/crop';
import { Icon } from './Icon';

/** Size of the saved picture, in pixels. */
const OUTPUT = 512;

/**
 * Full-screen "move and scale" editor for a new profile picture, like
 * WhatsApp: the photo sits behind a round frame; drag to move, pinch (or the
 * mouse wheel, or the slider) to zoom. Done saves exactly what's in the circle.
 */
export function AvatarEditor({ file, onCancel, onDone }: { file: Blob; onCancel: () => void; onDone: (picture: Blob) => Promise<void> }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [frame, setFrame] = useState(300);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const stage = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => area.current?.focus(), []);

  // Decode the photo (the browser applies its orientation).
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => setImg(image);
    image.onerror = () => setLoadError('This photo can’t be opened here. Try a JPEG or PNG.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame fills most of the screen, leaving room for the bars.
  useEffect(() => {
    const fit = () => setFrame(Math.max(200, Math.min(420, window.innerWidth - 40, window.innerHeight - 260)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  // Keep the view valid when the frame size changes (rotation, resize).
  useEffect(() => setView((v) => clampView(v, w, h, frame)), [w, h, frame]);

  const scale = (frame / Math.min(w, h)) * view.zoom;

  /** A screen point relative to the frame's centre. */
  const fromCentre = (clientX: number, clientY: number) => {
    const r = stage.current?.getBoundingClientRect();
    return r ? { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };

  const onPointerDown = (e: PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev || !img) return;
    const before = [...map.values()];
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...map.values()];
    if (after.length === 1) {
      setView((v) => clampView({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }, w, h, frame));
    } else if (after.length >= 2) {
      // Pinch: zoom by the change in finger distance, around the fingers' midpoint, and follow the midpoint.
      const dist = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      const mid = (p: { x: number; y: number }[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const ratio = dist(after) / dist(before);
      const m0 = mid(before);
      const m1 = mid(after);
      const focus = fromCentre(m1.x, m1.y);
      setView((v) => {
        const zoomed = zoomAt(v, v.zoom * ratio, focus.x, focus.y, w, h, frame);
        return clampView({ ...zoomed, x: zoomed.x + m1.x - m0.x, y: zoomed.y + m1.y - m0.y }, w, h, frame);
      });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const onWheel = (e: WheelEvent) => {
    if (!img) return;
    const focus = fromCentre(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => zoomAt(v, v.zoom * factor, focus.x, focus.y, w, h, frame));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 12;
    const move: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === 'Escape') return onCancel();
    if (move[e.key]) {
      e.preventDefault();
      const [dx, dy] = move[e.key];
      setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, w, h, frame));
    } else if (e.key === '+' || e.key === '=') setView((v) => zoomAt(v, v.zoom * 1.15, 0, 0, w, h, frame));
    else if (e.key === '-') setView((v) => zoomAt(v, v.zoom / 1.15, 0, 0, w, h, frame));
  };

  const done = async () => {
    if (!img || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { sx, sy, size } = cropRect(view, w, h, frame);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.round(Math.min(OUTPUT, size));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process this photo.');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
      await onDone(await encodeCanvas(canvas, 0.86));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your picture.');
      setBusy(false);
    }
  };

  return (
    <div className="avatar-editor always-dark" role="dialog" aria-modal="true" aria-label="Move and scale your picture" onKeyDown={onKeyDown}>
      <header className="avatar-editor-bar">
        <button type="button" className="icon-btn" aria-label="Cancel" onClick={onCancel} disabled={busy}>
          <Icon name="close" size={24} />
        </button>
        <span className="avatar-editor-title">Move and scale</span>
        <button type="button" className="btn btn-primary avatar-editor-done" onClick={() => void done()} disabled={!img || busy}>
          {busy ? <span className="upload-spinner" aria-label="Saving" /> : 'Done'}
        </button>
      </header>

      <div
        className="avatar-editor-stage-wrap"
        ref={area}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        tabIndex={0}
        aria-label="Photo. Drag to move, pinch or scroll to zoom. Arrow keys move, plus and minus zoom."
      >
        {loadError ? (
          <p className="avatar-editor-error">{loadError}</p>
        ) : (
          <div className="avatar-editor-stage" ref={stage} style={{ width: frame, height: frame }}>
            {img && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  width: w * scale,
                  height: h * scale,
                  transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)`,
                }}
              />
            )}
            <span className="avatar-editor-mask" aria-hidden="true" />
          </div>
        )}
      </div>

      <footer className="avatar-editor-zoom">
        {error && (
          <p className="avatar-editor-error" role="alert">
            {error}
          </p>
        )}
        <div className="zoom-row">
          <Icon name="image" size={16} />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            aria-label="Zoom"
            disabled={!img}
            onChange={(e) => setView((v) => zoomAt(v, Number(e.target.value), 0, 0, w, h, frame))}
            style={{ '--progress': `${((view.zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` } as CSSProperties}
          />
          <Icon name="image" size={24} />
        </div>
        <p className="avatar-editor-hint">Drag to move · pinch to zoom</p>
      </footer>
    </div>
  );
}
