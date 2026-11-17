import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { customLiftOf, registerCustomModels, scaledModel } from '../domain/models/customRegistry';
import { refillsVBars, vBarFill } from '../domain/models/gateRefill';
import { vBarGroup, vLayoutInfo } from '../domain/models/vbars';
import { FENCE_MODELS } from '../domain/models/catalog';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';

const PICKET = FENCE_MODELS.picket_narrow.materialId;

/** model kapije nacrtan od modela „Bela — uske vertikalne letvice“ (kao „Sačuvaj kao model kapije“) */
function gateModel(width = 3000, base: 'picket_narrow' | 'picket_brown' = 'picket_narrow'): CustomModel {
  const m = builtinToCustom(base, SEED_MATERIALS, `cm_${base}_${width}`, width, 1500);
  return { ...m, kind: 'gate', name: 'Kapija letvice' };
}

/** letvice (rastući x) i njihov raspored u modelu */
function slats(m: CustomModel) {
  const bar = m.parts.find((p) => p.materialId === PICKET && p.angleDeg === 90)!;
  const g = vBarGroup(m, bar, SEED_MATERIALS)!;
  const gaps = g.lefts.slice(1).map((l, i) => l - (g.lefts[i] + g.widths[i]));
  return { g, gaps, info: vLayoutInfo(m, bar, SEED_MATERIALS)! };
}

afterEach(() => registerCustomModels([], SEED_MATERIALS));

describe('broj i razmak letvica za širinu krila', () => {
  it('broj je onaj pri kome je razmak najbliži razmaku sa crteža, a razmak popunjava prostor tačno', () => {
    // 1000 mm, letvica 110, razmak 40, bez odstojanja: (1000 + 40) / 150 = 6,93 → 7 letvica, razmak (1000 − 770) / 6 = 38,33
    const f = vBarFill(1000, 110, 40, 0, 0);
    expect(f.count).toBe(7);
    expect(f.gap).toBeCloseTo(230 / 6, 6);
    // 940 mm: 980 / 150 = 6,53 → 7 letvica, razmak (940 − 770) / 6 = 28,33 (smanjen)
    expect(vBarFill(940, 110, 40, 0, 0)).toMatchObject({ count: 7 });
    // 920 mm: 960 / 150 = 6,4 → 6 letvica, razmak (920 − 660) / 5 = 52 (povećan)
    const g = vBarFill(920, 110, 40, 0, 0);
    expect(g.count).toBe(6);
    expect(g.gap).toBeCloseTo(52, 6);
  });

  it('odstojanja od ivica ostaju, a letvice ne mogu da se preklope', () => {
    const f = vBarFill(1000, 110, 40, 20, 20);
    expect(f.left).toBe(20); expect(f.right).toBe(20);
    expect(f.count * 110 + (f.count - 1) * f.gap + 40).toBeCloseTo(1000, 6);
    // razmak 0 sa crteža: staje koliko može bez preklapanja
    const z = vBarFill(500, 110, 0, 0, 0);
    expect(z.count).toBe(4); // 500 / 110 = 4,5 → 5 bi se preklapale, staju 4
    expect(z.gap).toBeGreaterThanOrEqual(0);
  });

  it('jedna letvica stoji na sredini, a bez mesta nema letvica', () => {
    expect(vBarFill(150, 110, 40, 0, 0)).toMatchObject({ count: 1, gap: 0, left: 20, right: 20 });
    expect(vBarFill(100, 110, 40, 0, 0).count).toBe(0);
  });
});

describe('kapija iz modela „Bela — uske vertikalne letvice“ u projektu', () => {
  it('samo taj model se preračunava; ostali modeli i ograde ostaju kako su nacrtani', () => {
    expect(refillsVBars(gateModel())).toBe(true);
    expect(refillsVBars(gateModel(3000, 'picket_brown'))).toBe(false);
    expect(refillsVBars({ ...gateModel(), kind: 'fence', baseModelId: undefined })).toBe(false);
    // ograda nastala od istog modela (zamena originala) se preračunava i kao ograda
    expect(refillsVBars({ ...gateModel(), kind: 'fence' })).toBe(true);
    // ručno nacrtana kapija (bez polaznog modela)
    expect(refillsVBars({ ...gateModel(), baseModelId: undefined })).toBe(true);
  });

  it('krilo uže od crteža: letvica je manje, razmak je jednak i popunjavaju celo krilo', () => {
    const m = gateModel(3000);
    registerCustomModels([m], SEED_MATERIALS);
    const orig = slats(m);
    for (const w of [1490, 1000, 1237, 780]) {
      const s = slats(scaledModel(m, w, m.heightMm));
      // broj letvica prema širini krila (koliko staje sa razmakom sa crteža)
      const want = vBarFill(s.g.xRight - s.g.xLeft, orig.info.h, orig.info.gap!, Math.min(orig.info.top, orig.info.gap!), Math.min(orig.info.bottom, orig.info.gap!));
      expect(s.g.bars.length, `${w}`).toBe(want.count);
      expect(s.g.bars.length).toBeLessThan(orig.g.bars.length);
      // jednak razmak između svih letvica, blizu razmaka sa crteža (najviše pola koraka letvice razlike)
      for (const gp of s.gaps) expect(gp).toBeCloseTo(s.gaps[0], 2);
      expect(Math.abs(s.gaps[0] - orig.info.gap!)).toBeLessThanOrEqual((orig.info.h + orig.info.gap!) / 2 + 1e-6);
      // popunjena cela širina: prva i poslednja letvica na istom odstojanju od ivica kao na crtežu
      expect(s.info.top).toBeCloseTo(Math.min(orig.info.top, orig.info.gap!), 1);
      expect(s.info.bottom).toBeCloseTo(Math.min(orig.info.bottom, orig.info.gap!), 1);
      // letvice zadržavaju širinu i visinu sa crteža
      for (const w2 of s.g.widths) expect(w2).toBeCloseTo(orig.info.h, 6);
    }
  });

  it('dva krila različite širine imaju isti razmak (gusto i retko se ne dešava)', () => {
    const m = gateModel(3000);
    registerCustomModels([m], SEED_MATERIALS);
    const a = slats(scaledModel(m, 900, m.heightMm));
    const b = slats(scaledModel(m, 2050, m.heightMm));
    expect(b.g.bars.length).toBeGreaterThan(a.g.bars.length);
    expect(Math.abs(a.gaps[0] - b.gaps[0])).toBeLessThan(110 + 40);
    const orig = slats(m);
    for (const s of [a, b]) expect(Math.abs(s.gaps[0] - orig.info.gap!)).toBeLessThanOrEqual(75 + 1e-6);
  });

  it('krilo šire od crteža dobija više letvica; nosači se i dalje protežu celom širinom', () => {
    const m = gateModel(1000);
    registerCustomModels([m], SEED_MATERIALS);
    const orig = slats(m);
    const out = scaledModel(m, 2400, m.heightMm);
    const s = slats(out);
    expect(s.g.bars.length).toBeGreaterThan(orig.g.bars.length);
    for (const gp of s.gaps) expect(gp).toBeCloseTo(s.gaps[0], 2);
    const rails = out.parts.filter((p) => p.angleDeg === 0 && p.materialId !== PICKET);
    expect(rails.length).toBeGreaterThan(0);
    for (const r of rails) expect(r.lengthMm).toBeGreaterThan(2000);
  });

  it('model sa drugim letvicama (Braon) se i dalje samo razvlači', () => {
    const m = gateModel(3000, 'picket_brown');
    registerCustomModels([m], SEED_MATERIALS);
    const n = m.parts.length;
    expect(scaledModel(m, 1200, m.heightMm).parts).toHaveLength(n);
  });
});

describe('ručno nacrtana kapija sa uspravnim letvicama (bez polaznog modela iz kataloga)', () => {
  const cap = SEED_MATERIALS.find((x) => x.id === 'mat_ek_k100018');
  const TUBE = 'mat_ek_kv000007'; // pravougaona cev 80×20
  const hand = (): CustomModel => {
    const bars: CustomPart[] = [];
    for (let i = 0; i < 5; i++) bars.push({ id: `b${i}`, materialId: TUBE, x: 40 + i * 105, y: 0, lengthMm: 1400, angleDeg: 90, rot: 0, z: 0 });
    const rails: CustomPart[] = [300, 1100].map((y, i) => ({ id: `r${i}`, materialId: 'mat_kv_30x20', x: 0, y, lengthMm: 560, angleDeg: 0, rot: 0, z: 0 }));
    return { ...newCustomModel('cm_hand'), kind: 'gate', name: 'Ručna', widthMm: 560, heightMm: 1400, parts: [...bars, ...rails], gate: undefined };
  };

  it('široko krilo dobija više letvica sa istim razmakom, uže manje; razmak je jednak', () => {
    const m = hand();
    registerCustomModels([m], SEED_MATERIALS);
    const bar = (x: CustomModel) => x.parts.find((p) => p.materialId === TUBE)!;
    const info0 = vLayoutInfo(m, bar(m), SEED_MATERIALS)!;
    expect(info0.gap).toBeCloseTo(25, 5); // korak 105, letvica 80
    const wide = scaledModel(m, 1830, 1400);
    const w = vBarGroup(wide, bar(wide), SEED_MATERIALS)!;
    expect(w.bars.length).toBeGreaterThan(5);
    const gaps = w.lefts.slice(1).map((l, i) => l - (w.lefts[i] + w.widths[i]));
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 2);
    expect(Math.abs(gaps[0] - 25)).toBeLessThanOrEqual(52.5 + 1e-6);
    const narrow = scaledModel(m, 300, 1400);
    expect(vBarGroup(narrow, bar(narrow), SEED_MATERIALS)!.bars.length).toBeLessThan(5);
    expect(cap).toBeDefined();
  });
});

describe('razmak od poda zadat u modelu', () => {
  it('model pamti koliko je ispuna podignuta od poda, bez vrednosti je 0', () => {
    const m = gateModel(3000);
    registerCustomModels([m, { ...m, id: 'cm_lift', liftMm: 60 }], SEED_MATERIALS);
    expect(customLiftOf(m.id)).toBe(0);
    expect(customLiftOf('cm_lift')).toBe(60);
  });
});
