import { describe, expect, it } from 'vitest';
import { clampView, cropRect, zoomAt } from './crop';

// A 4000 × 3000 landscape photo in a 300 px frame: zoom 1 shows the middle 3000 × 3000.
const W = 4000;
const H = 3000;
const F = 300;

describe('cropRect', () => {
  it('starts with the centre square', () => {
    expect(cropRect({ zoom: 1, x: 0, y: 0 }, W, H, F)).toEqual({ sx: 500, sy: 0, size: 3000 });
  });

  it('zooming in takes a smaller square', () => {
    expect(cropRect({ zoom: 2, x: 0, y: 0 }, W, H, F)).toEqual({ sx: 1250, sy: 750, size: 1500 });
  });

  it('dragging right shows more of the left side', () => {
    const { sx } = cropRect({ zoom: 1, x: 50, y: 0 }, W, H, F);
    expect(sx).toBe(0); // 50 screen px = 500 image px at this scale
  });
});

describe('clampView', () => {
  it('never lets the photo leave a gap in the frame', () => {
    expect(clampView({ zoom: 1, x: 400, y: 80 }, W, H, F)).toEqual({ zoom: 1, x: 50, y: 0 });
    expect(clampView({ zoom: 9, x: 0, y: 0 }, W, H, F).zoom).toBe(5);
    expect(clampView({ zoom: 0.2, x: 0, y: 0 }, W, H, F).zoom).toBe(1);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the fingers still', () => {
    // Zoom ×2 around a point 60 px right of centre: that image point stays at +60.
    const v = zoomAt({ zoom: 1, x: 0, y: 0 }, 2, 60, 0, W, H, F);
    expect(v).toEqual({ zoom: 2, x: -60, y: 0 });
  });

  it('zooming back out recentres within bounds', () => {
    const v = zoomAt({ zoom: 3, x: -200, y: 120 }, 1, 0, 0, W, H, F);
    expect(v.zoom).toBe(1);
    expect(Math.abs(v.x)).toBeLessThanOrEqual(50);
    expect(v.y).toBe(0);
  });
});
