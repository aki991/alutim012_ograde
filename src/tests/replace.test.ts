import { describe, expect, it } from 'vitest';
import { clampToFrame, newCustomModel, partBounds, type CustomModel, type CustomPart } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { applyGuides, attachToGuides, barLayoutInfo, guideReport, layoutBars } from '../domain/models/guides';
import { replaceMaterial, replaceOptions, replaceRole, replaceTargets } from '../domain/models/replace';
import type { Material } from '../domain/models/types';

const mat = (id: string, sku: string, name: string): Material => ({ id, sku, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const U20 = mat('u20', 'KU000002', 'U profil A:60mm B:20mm C: 2mm, sirovo');
const U28 = mat('u28', 'U 60×28', 'U profil A:60mm B:28mm C: 2mm, sirovo');
const U40 = mat('u40', 'U-56', 'U profil A:56mm B:20mm C: 2mm, sirovo');
const KV80 = mat('kv80', 'KV000007', 'Kvadratna cev 80×20×1 mm, sirovo');
const KV60 = mat('kv60', 'KV60', 'Kvadratna cev 60×20×1 mm, sirovo');
const MATS = [U20, U28, U40, KV80, KV60];
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });

function fence(tilt: 'fit' | 0 = 0, count = 5): CustomModel {
  const m: CustomModel = { ...newCustomModel('cm_r'), widthMm: 1000, heightMm: 1000, parts: [part('L', U20.id, 10, 0, 1000, 90), part('R', U20.id, 990, 0, 1000, 90), part('b', KV80.id, 0, 500, 1000, 0)] };
  const a = attachToGuides(m, 'b', MATS);
  if ('error' in a) throw new Error(a.error);
  const t = tilt === 'fit' ? a.fit.plus : undefined;
  const base = applyGuides({ ...a.model, parts: a.model.parts.map((p) => (p.id === 'b' ? { ...p, tiltDeg: t } : p)) }, MATS);
  const r = layoutBars(base, 'b', MATS, { count, top: 50, bottom: 50, gap: 0, auto: 'gap', lufta: tilt ? 'bez' : 'sa' });
  if ('error' in r) throw new Error(r.error);
  return r.model;
}
const barsOf = (m: CustomModel) => m.parts.filter((p) => p.guides);

describe('zamena materijala dela', () => {
  it('uloge i delovi koji se menjaju zajedno', () => {
    const m = fence();
    expect(replaceRole(m, 'L')).toBe('guide');
    expect(replaceRole(m, barsOf(m)[0].id)).toBe('bar');
    expect(replaceTargets(m, 'L').sort()).toEqual(['L', 'R']);
    expect(replaceTargets(m, barsOf(m)[2].id)).toHaveLength(5);
  });

  it('za vođicu se nude samo U profili, za prečku profili', () => {
    const m = fence();
    expect(replaceOptions(m, 'L', MATS).map((x) => x.id).sort()).toEqual(['u28', 'u40']);
    expect(replaceOptions(m, barsOf(m)[0].id, MATS).map((x) => x.id).sort()).toEqual(['kv60', 'u20', 'u28', 'u40']);
  });

  it('zamena levog U profila menja i desni; prečke se prilagođavaju (broj, odstojanja, ulaz do dna)', () => {
    const m = fence();
    const r = replaceMaterial(m, 'L', U28.id, MATS);
    if ('error' in r) throw new Error(r.error);
    expect(r.model.parts.find((p) => p.id === 'L')!.materialId).toBe('u28');
    expect(r.model.parts.find((p) => p.id === 'R')!.materialId).toBe('u28');
    const bars = barsOf(r.model);
    expect(bars).toHaveLength(5);
    const info = barLayoutInfo(r.model, bars[0], MATS)!;
    expect(info).toMatchObject({ count: 5, top: 50, bottom: 50 });
    const rep = guideReport(r.model, bars[0], MATS)!;
    expect(bars[0].x).toBeCloseTo(rep.L.backX, 2);
    expect(bars[0].x + bars[0].lengthMm).toBeCloseTo(rep.R.backX, 2);
  });

  it('prečke pod uglom uklapanja ostaju pod novim uglom uklapanja', () => {
    const m = fence('fit', 13);
    const before = guideReport(m, barsOf(m)[0], MATS)!;
    expect(barsOf(m)[0].tiltDeg).toBeCloseTo(before.fit.plus, 6);
    const r = replaceMaterial(m, 'R', U40.id, MATS);
    if ('error' in r) throw new Error(r.error);
    const bars = barsOf(r.model);
    const after = guideReport(r.model, bars[0], MATS)!;
    expect(after.fit.plus).not.toBeCloseTo(before.fit.plus, 1); // uži otvor: drugačiji ugao
    for (const b of bars) expect(b.tiltDeg).toBeCloseTo(after.fit.plus, 6);
    expect(bars).toHaveLength(13);
  });

  it('zamena prečke menja sve prečke grupe, a bočne strane ostaju', () => {
    const m = fence(0, 5);
    const r = replaceMaterial(m, barsOf(m)[1].id, KV60.id, MATS);
    if ('error' in r) throw new Error(r.error);
    expect(barsOf(r.model).every((b) => b.materialId === 'kv60')).toBe(true);
    expect(r.model.parts.filter((p) => p.materialId === 'u20')).toHaveLength(2);
    expect(barLayoutInfo(r.model, barsOf(r.model)[0], MATS)).toMatchObject({ count: 5, top: 50, bottom: 50, h: 60 });
  });

  it('neodgovarajući materijal se odbija', () => {
    const m = fence();
    expect('error' in replaceMaterial(m, 'L', KV60.id, MATS)).toBe(true);
  });
});

describe('delovi u okviru modela', () => {
  const shapeOf = (p: CustomPart) => { const m = MATS.find((x) => x.id === p.materialId); return m ? materialShape(m) : null; };
  it('U profil 60 × 28 sa osom na 10 se pomera da počne na 0, desni da se završi na širini', () => {
    const m: CustomModel = { ...newCustomModel('cm_f'), widthMm: 1000, heightMm: 1000, parts: [part('L', U28.id, 10, 0, 1000, 90), part('R', U28.id, 990, 0, 1000, 90)] };
    const out = clampToFrame(m, shapeOf);
    const b = (id: string) => partBounds(out.parts.find((p) => p.id === id)!, shapeOf(out.parts.find((p) => p.id === id)!)!);
    expect(b('L').x0).toBeCloseTo(0, 6);
    expect(b('R').x1).toBeCloseTo(1000, 6);
    expect(b('L').y1).toBeLessThanOrEqual(1000);
  });
  it('deo duži od okvira: sa „grow“ okvir raste do mere dela, bez njega ostaje', () => {
    const m: CustomModel = { ...newCustomModel('cm_g'), widthMm: 1000, heightMm: 1000, parts: [part('L', U20.id, 10, 0, 1200, 90), part('R', U20.id, 990, 0, 1200, 90)] };
    const grown = clampToFrame(m, shapeOf, true);
    expect(grown.heightMm).toBe(1200);
    expect(grown.widthMm).toBe(1000);
    expect(clampToFrame(m, shapeOf).heightMm).toBe(1000);
  });
  it('deo koji je već unutra ostaje isti objekat', () => {
    const m = fence();
    expect(clampToFrame(m, shapeOf)).toBe(m);
  });
});
