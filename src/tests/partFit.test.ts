import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS as M } from './fixtures/materials';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { customSlatCount, customSpec, registerCustomModels, scaledModel } from '../domain/models/customRegistry';
import { anchoredLengthFormula, autoFit } from '../domain/models/anchored';
import { partBounds, type CustomModel, type PartFit } from '../domain/models/custom';
import { evalFormula } from '../domain/models/spec';
import { isRepeating } from '../domain/models/gateRefill';
import { shapeLookup } from '../domain/models/guides';
import { orphanCaps, setGroupCaps } from '../domain/models/vbars';
import { checkDrawing } from '../domain/models/drawingCheck';

const so = shapeLookup(M);
afterEach(() => registerCustomModels([], M));

/** model uskih letvica sa dva nosača: nosač = prvi vodoravni deo koji nije ram uz ivicu */
function picket(): { m: CustomModel; rail: string } {
  const m = builtinToCustom('picket_narrow' as never, M, 'cm_ft', 1500, 1200);
  const rail = m.parts.find((p) => { const b = partBounds(p, so(p) as never); return p.angleDeg % 180 === 0 && b.y0 > 1 && b.y1 < m.heightMm - 1 && b.x1 - b.x0 > 0.6 * m.widthMm; })!;
  return { m, rail: rail.id };
}
const withFit = (m: CustomModel, id: string, fit: PartFit): CustomModel => ({ ...m, parts: m.parts.map((p) => (p.id === id ? { ...p, fit } : p)) });
const yOf = (m: CustomModel, id: string) => { const p = m.parts.find((x) => x.id === id)!; return partBounds(p, so(p) as never); };

describe('pravila promene veličine po delu', () => {
  it('visina: dno, vrh, sredina i srazmerno daju različita mesta nosača', () => {
    const { m, rail } = picket();
    const y0 = yOf(m, rail);
    const at = (fit: PartFit) => { const mm = withFit(m, rail, fit); registerCustomModels([mm], M); return yOf(scaledModel(mm, 1500, 1600), rail); };
    const d = 400;
    expect(at({ v: 'bottom' }).y0).toBeCloseTo(y0.y0, 1);
    expect(at({ v: 'top' }).y0).toBeCloseTo(y0.y0 + d, 1);
    expect(at({ v: 'center' }).y0).toBeCloseTo(y0.y0 + d / 2, 1);
    const c = (y0.y0 + y0.y1) / 2; const sc = at({ v: 'scale' }); // srazmerno se pomera sredina, debljina ostaje
    expect((sc.y0 + sc.y1) / 2).toBeCloseTo((c * 1600) / 1200, 1);
  });

  it('širina: protegnut deo raste za razliku širina, ostali zadržavaju dužinu', () => {
    const { m, rail } = picket();
    const len = (fit: PartFit) => { const mm = withFit(m, rail, fit); registerCustomModels([mm], M); return scaledModel(mm, 2000, 1200).parts.find((p) => p.id === rail)!.lengthMm; };
    const L = m.parts.find((p) => p.id === rail)!.lengthMm;
    expect(len({ h: 'stretch' })).toBeCloseTo(L + 500, 1);
    expect(len({ h: 'left' })).toBeCloseTo(L, 1);
    expect(len({ h: 'right' })).toBeCloseTo(L, 1);
    expect(len({ h: 'scale' })).toBeCloseTo((L * 2000) / 1500, 1);
  });

  it('formula dužine u krojnoj listi prati crtež za svako pravilo', () => {
    const { m, rail } = picket();
    for (const h of ['auto', 'left', 'right', 'center', 'stretch', 'scale'] as const) {
      const mm = withFit(m, rail, { h });
      registerCustomModels([mm], M);
      const f = anchoredLengthFormula(mm, mm.parts.find((p) => p.id === rail)!)!;
      for (const [w, hh] of [[1000, 1000], [2400, 1500]] as const) {
        const drawn = scaledModel(mm, w, hh).parts.find((p) => p.id === rail)!.lengthMm;
        expect(evalFormula(f, { W: w, H: hh }), `${h} ${w}x${hh}`).toBeCloseTo(drawn, 0);
      }
    }
  });

  it('prepoznato pravilo se prikazuje (automatski)', () => {
    const { m, rail } = picket();
    const p = m.parts.find((x) => x.id === rail)!;
    const a = autoFit(m, p, so(p) as never);
    expect(a.h).toBe('stretch');
    expect(['bottom', 'top']).toContain(a.v);
  });

  it('„ne preračunavaj“: letvice zadržavaju broj sa crteža, a krojna lista prati crtež', () => {
    const { m } = picket();
    registerCustomModels([m], M);
    const nOn = customSlatCount('cm_ft', 2500, 1200);
    const slat = m.parts.find((p) => p.angleDeg === 90 && !so(p)!.type.startsWith('x') && p.materialId !== 'mat_alu_frame')!;
    expect(isRepeating(m, M, slat.id)).toBe(true);
    const off = { ...m, parts: m.parts.map((p) => (p.id === slat.id ? { ...p, fit: { repeat: 'off' as const } } : p)) };
    registerCustomModels([off], M);
    const drawn = m.parts.filter((p) => p.materialId === slat.materialId).length;
    expect(scaledModel(off, 2500, 1200).parts.filter((p) => p.materialId === slat.materialId)).toHaveLength(drawn);
    expect(nOn).toBeGreaterThan(drawn);
    expect(customSpec(off).some((r) => String(r.qty).includes('SLATS'))).toBe(false);
  });
});

describe('isključen preračun niza važi za ceo niz (letvice i čepovi)', () => {
  it('jedan isključen deo isključuje celu grupu, a čepovi ostaju na svojim letvicama', () => {
    const base = builtinToCustom('picket_narrow' as never, M, 'cm_tg', 1000, 1000);
    const bar0 = base.parts.find((p) => p.angleDeg === 90 && p.materialId !== 'mat_alu_frame')!;
    const withCaps = setGroupCaps(base, bar0, M, true);
    if ('error' in withCaps) throw new Error(withCaps.error);
    const m = withCaps.model;
    registerCustomModels([m], M);
    const slat = m.parts.find((p) => p.id === bar0.id)!;
    const off: CustomModel = { ...m, parts: m.parts.map((p) => (p.id === slat.id ? { ...p, fit: { repeat: 'off' as const } } : p)) };
    registerCustomModels([off], M);
    const big = scaledModel(off, 2000, 1000);
    expect(big.parts.length).toBe(m.parts.length); // broj delova ostaje kao na crtežu
    const bars = big.parts.filter((p) => p.angleDeg === 90 && p.materialId === slat.materialId);
    const caps = big.parts.filter((p) => so(p)?.type === 'piece');
    expect(caps.length).toBeGreaterThan(0);
    // svaki čep stoji iznad sredine neke letvice
    for (const c of caps) {
      expect(bars.some((b) => Math.abs(b.x - c.x) < 3), `čep x=${Math.round(c.x)}`).toBe(true);
    }
    // letvice su ravnomerno raspoređene po novoj širini (srazmerno), ne zbijene uz ivice
    const xs = bars.map((b) => b.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 0);
  });
});

describe('čepovi tarabica', () => {
  it('čep pomeren za par mm pripada letvici, višak čep se prijavljuje i skida, a na većem polju prati letvicu', () => {
    const base = builtinToCustom('picket_narrow' as never, M, 'cm_cp', 1000, 1000);
    const bar0 = base.parts.find((p) => p.angleDeg === 90 && p.materialId !== 'mat_alu_frame')!;
    const r = setGroupCaps(base, bar0, M, true);
    if ('error' in r) throw new Error(r.error);
    const m0 = r.model;
    const cap = m0.parts.find((p) => so(p)?.type === 'piece')!;
    // dupli čep pomeren za 3 mm na istoj letvici (kao u modelu korisnika posle izmene razmaka)
    const dup = { ...cap, id: 'dup', x: cap.x + 3 };
    const m = { ...m0, parts: [...m0.parts, dup] };
    expect(checkDrawing(m, M).some((p) => p.kind === 'cap' && p.ids.includes('dup'))).toBe(true);
    // čep koji pripada nizu prati letvicu i na većem polju (nema čepa bez letvice)
    registerCustomModels([m], M);
    const big = scaledModel(m, 2000, 1000);
    expect(orphanCaps(big, M)).toHaveLength(0);
    // ponovno postavljanje čepova skida višak
    const bar1 = m.parts.find((p) => p.id === bar0.id)!;
    const fixed = setGroupCaps(m, bar1, M, true);
    if ('error' in fixed) throw new Error(fixed.error);
    expect(checkDrawing(fixed.model, M).filter((p) => p.kind === 'cap')).toHaveLength(0);
    // čep bez letvice se prijavljuje
    const stray = { ...m0, parts: [...m0.parts, { ...cap, id: 'stray', x: 5 }] };
    expect(checkDrawing(stray, M).some((p) => p.kind === 'cap' && p.ids.includes('stray'))).toBe(true);
  });
});
