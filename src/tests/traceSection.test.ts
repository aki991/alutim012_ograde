import { describe, expect, it } from 'vitest';
import { drawnPolys } from '../domain/models/drawnSection';
import { estimateWall, otsu, scaleTraced, traceBitmap, type Bitmap } from '../domain/models/traceSection';

/** bitmapa iz funkcije (x, y) → tamno */
const bmp = (w: number, h: number, f: (x: number, y: number) => boolean): Bitmap => {
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dark[y * w + x] = f(x, y) ? 1 : 0;
  return { w, h, dark };
};
const rect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const area = (p: [number, number][]): number => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);

describe('presek iz slike', () => {
  it('puna slika: U profil (tamna površina) daje jedan poligon bez otvora i tačne mere', () => {
    // U profil 60 × 40 px: leđa gore (debljine 6), krakovi nadole
    const b = bmp(80, 60, (x, y) => rect(x, y, 10, 10, 70, 16) || rect(x, y, 10, 10, 16, 50) || rect(x, y, 64, 10, 70, 50));
    const t = traceBitmap(b, 'filled')!;
    expect(t.polys).toHaveLength(1);
    expect(t.polys[0].holes).toHaveLength(0);
    expect(t.wPx).toBeCloseTo(60, 0);
    expect(t.hPx).toBeCloseTo(40, 0);
    const mm = scaleTraced(t, 60, 28)[0];
    expect(Math.max(...mm.outline.map((p) => p[0]))).toBeCloseTo(60, 1);
    expect(Math.max(...mm.outline.map((p) => p[1]))).toBeCloseTo(28, 1);
    // površina U profila: 60×6 + 2 × (34×6) px² = 768 px²
    expect(area(t.polys[0].outline)).toBeCloseTo(768, -1);
  });

  it('puna slika: cev (tamna površina sa svetlim otvorom) ima otvor', () => {
    const b = bmp(60, 60, (x, y) => rect(x, y, 5, 5, 55, 45) && !rect(x, y, 10, 10, 50, 40));
    const t = traceBitmap(b, 'filled')!;
    expect(t.polys).toHaveLength(1);
    expect(t.polys[0].holes).toHaveLength(1);
    const wall = estimateWall(scaleTraced(t, 50, 40));
    expect(wall).toBeGreaterThan(3.5); expect(wall).toBeLessThan(6);
  });

  it('konturni crtež: dve linije cevi (spoljna i unutrašnja) daju prsten, jedna linija pun presek', () => {
    const ring = (x: number, y: number) => (rect(x, y, 5, 5, 55, 45) && !rect(x, y, 7, 7, 53, 43)) || (rect(x, y, 12, 12, 48, 38) && !rect(x, y, 14, 14, 46, 36));
    const t = traceBitmap(bmp(60, 60, ring), 'outline')!;
    expect(t.polys).toHaveLength(1);
    expect(t.polys[0].holes).toHaveLength(1);
    const single = traceBitmap(bmp(60, 60, (x, y) => rect(x, y, 5, 5, 55, 45) && !rect(x, y, 7, 7, 53, 43)), 'outline')!;
    expect(single.polys).toHaveLength(1);
    expect(single.polys[0].holes).toHaveLength(0);
  });

  it('presek iz slike se koristi kao nacrtan presek, šum se zanemaruje, Otsu deli tamno i svetlo', () => {
    const b = bmp(40, 40, (x, y) => rect(x, y, 5, 5, 35, 12) || (x === 30 && y === 30));
    const t = traceBitmap(b, 'filled')!;
    expect(t.polys).toHaveLength(1);
    const polys = scaleTraced(t, 30, 7);
    expect(drawnPolys({ pts: [], wall: 1, closed: true, polys }).length).toBe(1);
    expect(otsu([10, 10, 10, 240, 240, 240])).toBeGreaterThanOrEqual(10);
  });
});
