import { describe, expect, it } from 'vitest';
import { computeInfill, panelRepeat } from '../domain/geometry/infill';
import { FENCE_MODELS, panelArt } from '../domain/models/catalog';
import type { FenceModelId } from '../domain/models/types';

const geo = (m: FenceModelId, h: number) => {
  const d = FENCE_MODELS[m].defaults;
  return computeInfill(m, 2000, h, d.frameMm, d.barSizeMm, d.gapMm);
};
const mains = (m: FenceModelId, h: number) => geo(m, h).bars.filter((b) => b.tone === 'main');

describe('stalna dimenzija letvica: veća visina daje više letvica', () => {
  for (const m of ['h_narrow', 'h_boards', 'h_combo', 'panel_lines', 'h_wide', 'louver_dark'] as FenceModelId[]) {
    it(`${m}: debljina letvice ne zavisi od visine`, () => {
      const lo = mains(m, 1200); const hi = mains(m, 2200);
      expect(hi.length).toBeGreaterThan(lo.length);
      const size = FENCE_MODELS[m].defaults.barSizeMm;
      for (const b of [...lo, ...hi]) expect(Math.round(b.h)).toBe(size);
    });
  }

  it('letvice 80 + razmak 30: duplo viša ograda ima duplo više letvica', () => {
    const d = FENCE_MODELS.h_narrow.defaults;
    const n1 = countFor(1000, d); const n2 = countFor(2000, d);
    expect(n2 / n1).toBeGreaterThan(1.8);
    expect(n2 / n1).toBeLessThan(2.2);
  });

  it('vertikalni modeli: nosači imaju istu debljinu na svakoj visini', () => {
    for (const m of ['picket_narrow', 'v_framed'] as FenceModelId[]) {
      const rails = (h: number) => geo(m, h).bars.filter((b) => b.tone === 'rail').map((b) => Math.round(b.h));
      expect(rails(1800)).toEqual(rails(2400));
    }
  });

  it('slika polja se slaže iz perioda: broj ponavljanja prati visinu', () => {
    const art = panelArt('h_narrow', FENCE_MODELS.h_narrow.defaultColor)!;
    const p = FENCE_MODELS.h_narrow.defaults;
    const a = panelRepeat('h_narrow', art, 1000, p)!; const b = panelRepeat('h_narrow', art, 2000, p)!;
    expect(b.n).toBeGreaterThan(a.n * 1.8);
    expect(a.v1).toBeGreaterThan(a.v0);
    expect(panelRepeat('picket_narrow', panelArt('picket_narrow', FENCE_MODELS.picket_narrow.defaultColor)!, 1600, FENCE_MODELS.picket_narrow.defaults)).toBeNull();
  });
});

function countFor(h: number, d: { frameMm: number; barSizeMm: number; gapMm: number }) {
  return computeInfill('h_narrow', 2000, h, d.frameMm, d.barSizeMm, d.gapMm).bars.length;
}

describe('poravnanje letvica susednih polja', () => {
  it('polja različite visine imaju letvice u istim linijama od tla', () => {
    const d = FENCE_MODELS.h_narrow.defaults;
    const fromGround = (h: number) => computeInfill('h_narrow', 2000, h, d.frameMm, d.barSizeMm, d.gapMm).bars.map((b) => Math.round(h - (b.y + b.h)));
    const low = fromGround(800); const high = fromGround(1600);
    expect(high.slice(0, low.length)).toEqual(low);
    expect(high.length / low.length).toBeCloseTo(2, 0);
  });
});
