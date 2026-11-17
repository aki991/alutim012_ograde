import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS as M } from './fixtures/materials';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { customHBarLayout, customRails, registerCustomModels, scaledModel } from '../domain/models/customRegistry';
import { FENCE_MODELS } from '../domain/models/catalog';
import { partBounds, type CustomModel } from '../domain/models/custom';
import { shapeLookup } from '../domain/models/guides';

const so = shapeLookup(M);
const ids = Object.keys(FENCE_MODELS).filter((id) => !(FENCE_MODELS as Record<string, { terrace?: boolean }>)[id].terrace);
const sizes: [number, number][] = [[1500, 1200], [1000, 1600], [1750, 1600], [2400, 1000], [900, 1800], [3000, 1500]];

const boxes = (m: CustomModel) => m.parts.flatMap((p) => {
  const s = so(p);
  return s && s.type !== 'piece' ? [{ p, b: partBounds(p, s) }] : [];
});

afterEach(() => registerCustomModels([], M));

describe('svaki model iz kataloga na polju druge veličine', () => {
  for (const id of ids) {
    it(`${id}: ram uz ivice, delovi u polju, bez dupliranih delova`, () => {
      const base = builtinToCustom(id as never, M, 'cm_fit');
      registerCustomModels([base], M);
      for (const [w, h] of sizes) {
        const m = scaledModel(base, w, h);
        expect(m.widthMm).toBe(w); expect(m.heightMm).toBe(h);
        const bx = boxes(m);
        // nijedan deo ne izlazi iz polja (tarabica: cevi vire do 30 mm)
        for (const { p, b } of bx) {
          expect(b.x0, `${id} ${w}x${h} ${p.id} levo`).toBeGreaterThanOrEqual(-35);
          expect(b.x1, `${id} ${w}x${h} ${p.id} desno`).toBeLessThanOrEqual(w + 35);
          expect(b.y0, `${id} ${w}x${h} ${p.id} dole`).toBeGreaterThanOrEqual(-1);
          expect(b.y1, `${id} ${w}x${h} ${p.id} gore`).toBeLessThanOrEqual(h + 1);
        }
        // ID-evi delova su jedinstveni
        expect(new Set(m.parts.map((p) => p.id)).size).toBe(m.parts.length);
        // ram: uspravni delovi uz levu i desnu ivicu zadržavaju debljinu
        const left = bx.filter(({ p, b }) => p.angleDeg % 180 === 90 && b.x0 <= 1);
        const right = bx.filter(({ p, b }) => p.angleDeg % 180 === 90 && b.x1 >= w - 1);
        const ref = boxes(base);
        const thick = (a: typeof bx) => a.map(({ b }) => Math.round(b.x1 - b.x0));
        const refL = ref.filter(({ p, b }) => p.angleDeg % 180 === 90 && b.x0 <= 1);
        const refR = ref.filter(({ p, b }) => p.angleDeg % 180 === 90 && b.x1 >= base.widthMm - 1);
        expect(thick(left)).toEqual(thick(refL));
        expect(thick(right)).toEqual(thick(refR));
        // vodoravne prečke iste vrste (isti materijal, ista debljina) se ne preklapaju više nego na crtežu
        const hs = bx.filter(({ p, b }) => p.angleDeg % 180 === 0 && b.x1 - b.x0 > 0.6 * w && b.y0 > 1 && b.y1 < h - 1).sort((a, c) => a.b.y0 - c.b.y0);
        const minGap = (list: typeof hs) => Math.min(Infinity, ...list.slice(1).map((c, i) => c.b.y0 - list[i].b.y1));
        const hsRef = ref.filter(({ p, b }) => p.angleDeg % 180 === 0 && b.x1 - b.x0 > 0.6 * base.widthMm && b.y0 > 1 && b.y1 < base.heightMm - 1).sort((a, c) => a.b.y0 - c.b.y0);
        expect(minGap(hs), `${id} ${w}x${h} preklapanje`).toBeGreaterThanOrEqual(Math.min(0, minGap(hsRef)) - 16);
      }
    });
  }

  it('nosači tarabica i letvica ostaju na odstojanju od ivice, ne srazmerno visini', () => {
    const base = builtinToCustom('picket_narrow' as never, M, 'cm_pk');
    registerCustomModels([base], M);
    const rails = (m: CustomModel) => boxes(m).filter(({ p, b }) => p.angleDeg % 180 === 0 && b.x1 - b.x0 > 0.6 * m.widthMm && b.y0 > 1 && b.y1 < m.heightMm - 1).map(({ b }) => [Math.round(b.y0), Math.round(m.heightMm - b.y1)]).sort((x, y) => x[0] - y[0]);
    const a = rails(scaledModel(base, 1500, 1200)); const c = rails(scaledModel(base, 1500, 1600));
    expect(a.length).toBe(2); expect(c.length).toBe(2);
    expect(a[0][0]).toBe(c[0][0]); // donji nosač: isto odstojanje od dna
    expect(a[1][1]).toBe(c[1][1]); // gornji nosač: isto odstojanje od vrha
  });

  it('vodoravne daske: više prečki na većoj visini, jednak razmak, prva uz ram', () => {
    const base = builtinToCustom('h_combo' as never, M, 'cm_hc');
    registerCustomModels([base], M);
    const bars = (m: CustomModel) => boxes(m).filter(({ p, b }) => p.angleDeg % 180 === 0 && b.x1 - b.x0 > 0.6 * m.widthMm && b.y0 > 1 && b.y1 < m.heightMm - 1).sort((x, y) => x.b.y0 - y.b.y0);
    const lo = bars(scaledModel(base, 1500, 1200)); const hi = bars(scaledModel(base, 1500, 1600));
    expect(hi.length).toBeGreaterThan(lo.length);
    const gaps = hi.slice(1).map((c, i) => c.b.y0 - hi[i].b.y1);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 1);
  });

  it('ručno zadato: odstojanje prečki od dna i vrha važi tačno, razmak je najmanji razmak', () => {
    const base = builtinToCustom('h_boards' as never, M, 'cm_ov');
    registerCustomModels([base], M);
    const fill = { bottomMm: 100, topMm: 60, hGapMm: 120 };
    const lay = customHBarLayout('cm_ov', 1600, fill)!;
    expect(lay.bottom).toBe(100); expect(lay.top).toBe(60);
    expect(lay.gap).toBeGreaterThanOrEqual(120);
    const m = scaledModel(base, 1500, 1600, fill);
    const bars = boxes(m).filter(({ p, b }) => p.angleDeg % 180 === 0 && b.x1 - b.x0 > 0.6 * m.widthMm && b.y0 > 41 && b.y1 < m.heightMm - 41).sort((x, y) => x.b.y0 - y.b.y0);
    expect(bars.length).toBe(lay.count);
    expect(bars[0].b.y0).toBeCloseTo(40 + 100, 1); // donji ram 40 mm + 100
    expect(bars[bars.length - 1].b.y1).toBeCloseTo(1600 - 40 - 60, 1);
    const gaps = bars.slice(1).map((c, i) => c.b.y0 - bars[i].b.y1);
    for (const g of gaps) expect(g).toBeCloseTo(lay.gap, 1);
  });

  it('ručno zadato: nosač se pomera na zadato odstojanje od svoje ivice', () => {
    const base = builtinToCustom('picket_narrow' as never, M, 'cm_rl');
    registerCustomModels([base], M);
    const rails = customRails('cm_rl');
    expect(rails.map((r) => r.edge)).toEqual(['bottom', 'top']);
    const fill = { rails: { [rails[0].key]: 200, [rails[1].key]: 150 } };
    expect(customRails('cm_rl', fill).map((r) => r.offsetMm)).toEqual([200, 150]);
    const m = scaledModel(base, 1500, 1400, fill);
    const ys = boxes(m).filter(({ p }) => p.id === rails[0].key || p.id === rails[1].key).map(({ b }) => b).sort((a, c) => a.y0 - c.y0);
    expect(ys[0].y0).toBeCloseTo(200, 1);
    expect(1400 - ys[1].y1).toBeCloseTo(150, 1);
  });
});
