/*
 * Maths for the profile-picture editor: a photo shown behind a square frame
 * (with a round mask), which people drag to move and pinch to zoom. The image
 * always covers the frame; zoom 1 means "just covers it".
 *
 * Offsets (x, y) are in screen pixels: how far the image's centre sits from
 * the frame's centre.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export interface View {
  zoom: number;
  x: number;
  y: number;
}

/** Screen pixels per image pixel at zoom 1: the image's short side fills the frame. */
export const coverScale = (w: number, h: number, frame: number) => frame / Math.min(w, h);

/** Keeps zoom in range and the frame fully covered by the image. */
export function clampView(v: View, w: number, h: number, frame: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
  const scale = coverScale(w, h, frame) * zoom;
  const maxX = Math.max(0, (w * scale - frame) / 2);
  const maxY = Math.max(0, (h * scale - frame) / 2);
  return { zoom, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
}

/**
 * Zooms keeping the point under the fingers (or mouse) still. `fx, fy` is that
 * point relative to the frame's centre, in screen pixels.
 */
export function zoomAt(v: View, nextZoom: number, fx: number, fy: number, w: number, h: number, frame: number): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const k = z / v.zoom;
  return clampView({ zoom: z, x: fx - (fx - v.x) * k, y: fy - (fy - v.y) * k }, w, h, frame);
}

/** The square of the original image that's inside the frame. */
export function cropRect(v: View, w: number, h: number, frame: number): { sx: number; sy: number; size: number } {
  const scale = coverScale(w, h, frame) * v.zoom;
  const size = Math.min(w, h, frame / scale);
  const cx = w / 2 - v.x / scale;
  const cy = h / 2 - v.y / scale;
  return {
    sx: Math.min(w - size, Math.max(0, cx - size / 2)),
    sy: Math.min(h - size, Math.max(0, cy - size / 2)),
    size,
  };
}
