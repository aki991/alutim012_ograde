import { beforeEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { customPartsFor, customReinforceRows, customReinforceSplit, registerCustomModels } from '../domain/models/customRegistry';
import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { autoVerticalCount } from '../domain/models/reinforce';
import { customSpec } from '../domain/models/customRegistry';
import { evaluateItemSpec } from '../domain/models/spec';

const U = 'mat_u_60x28';
const base: CustomModel = {
  ...newCustomModel('cm_rf'), widthMm: 2000, heightMm: 1500,
  parts: [
    { id: 'a', materialId: U, x: 30, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
    { id: 'b', materialId: U, x: 1970, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
    { id: 'c', materialId: 'mat_ek_kv000007', x: 60, y: 700, lengthMm: 1880, angleDeg: 0, rot: 0, z: 0 },
  ],
};

describe('ojačanje platna cevima', () => {
  beforeEach(() => registerCustomModels([base], MODEL_MATERIALS));
  it('automatski: jedna uspravna cev na svakih 2,5 m širine', () => {
    expect(autoVerticalCount(2400)).toBe(0);
    expect(autoVerticalCount(3000)).toBe(1);
    expect(autoVerticalCount(5100)).toBe(2);
    expect(customPartsFor('cm_rf', 2400, 1500, 'RAL 7016').filter((r) => r.part.id.startsWith('rf_')).length).toBe(0);
    const wide = customPartsFor('cm_rf', 3000, 1500, 'RAL 7016').filter((r) => r.part.id.startsWith('rf_v'));
    expect(wide.length).toBe(1);
    // uspravna cev pravi dva platna: sa obe strane stoji isti U profil kao bočne vođice
    expect(customPartsFor('cm_rf', 3000, 1500, 'RAL 7016').filter((r) => r.part.id.startsWith('rf_u')).map((r) => r.part.materialId)).toEqual([U, U]);
    expect(wide[0].part.angleDeg).toBe(90);
    // sredina platna
    expect(Math.abs(wide[0].part.x - 1500)).toBeLessThan(60);
    const rows = customReinforceRows('cm_rf', 3000, 1500);
    expect(rows.find((r) => r.key === 'v')?.qty).toBe(1);
  });
  it('vodoravna cev deli platno i prekida se na uspravnoj cevi', () => {
    const slats = { reinforce: { hYs: [700] } };
    const ps = customPartsFor('cm_rf', 3000, 1500, 'RAL 7016', slats).filter((r) => r.part.id.startsWith('rf_'));
    expect(ps.filter((r) => r.part.id.startsWith('rf_v')).length).toBe(1);
    expect(ps.filter((r) => r.part.id.startsWith('rf_h')).length).toBe(2);
    const noV = customPartsFor('cm_rf', 1000, 1500, 'RAL 7016', slats).filter((r) => r.part.id.startsWith('rf_h'));
    expect(noV.length).toBe(1);
    expect(customReinforceRows('cm_rf', 1000, 1500, slats).some((r) => r.key.startsWith('h'))).toBe(true);
  });
  it('prečke se seku na uspravnim cevima: (dužina − cevi i U profili uz njih) / broj delova', () => {
    const ctx = (w: number) => ({ modelId: 'cm_rf' as never, widthMm: w, heightMm: 1500, axisMm: w, params: { barSizeMm: 0, gapMm: 0, frameMm: 0 } });
    const bar = (w: number) => evaluateItemSpec(customSpec(base), ctx(w)).find((e) => e.part.name.includes('Kvadratna') || e.part.lengthMm?.includes('W'))!;
    const whole = bar(2400);
    const cut = bar(5100);
    const tubes = customReinforceRows('cm_rf', 5100, 1500).find((r) => r.key === 'v')!;
    expect(tubes.qty).toBe(2);
    expect(cut.qty).toBe(whole.qty * 3);
    const tubeW = 80; // kvadratna cev 80×80 iz probnog cenovnika
    const gapW = customReinforceSplit('cm_rf', 5100, 1500)!.gapW;
    expect(gapW).toBeGreaterThan(tubeW); // cev + U profil sa obe strane
    const L = whole.lengthMm! + (5100 - 2400);
    expect(Math.abs(cut.lengthMm! - (L - 2 * gapW) / 3)).toBeLessThan(1);
    expect(customReinforceRows('cm_rf', 5100, 1500).find((r) => r.key.startsWith('u'))?.qty).toBe(4);
  });
  it('ručno zadat broj: 0 isključuje automatske cevi', () => {
    expect(customPartsFor('cm_rf', 3000, 1500, 'RAL 7016', { reinforce: { vCount: 0 } }).filter((r) => r.part.id.startsWith('rf_')).length).toBe(0);
  });
});

import { findOverlaps } from '../domain/models/overlap';
import { leafSeed } from '../domain/models/leafSeed';

describe('crtež krila 5100 mm sa cevima ojačanja', () => {
  it('prečke presečene na cevima ne prave preklapanja sa U vođicama', () => {
    const seed = leafSeed('h_narrow', [], MODEL_MATERIALS, 'x', 5100, 1400);
    if ('error' in seed) throw new Error(seed.error);
    expect(seed.parts.some((p) => p.id.startsWith('rf_v'))).toBe(true);
    expect(findOverlaps(seed, MODEL_MATERIALS).map((o) => `${o.nameA} / ${o.nameB}`)).toEqual([]);
  });
});

describe('prečka koja ulazi u U vođicu', () => {
  const nest: CustomModel = {
    ...newCustomModel('cm_nest'), widthMm: 2000, heightMm: 1500,
    parts: [
      { id: 'a', materialId: U, x: 30, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
      { id: 'b', materialId: U, x: 1970, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
      { id: 'c', materialId: 'mat_ek_kv000007', x: 20, y: 700, lengthMm: 1960, angleDeg: 0, rot: 0, z: 0, guides: ['a', 'b'] },
    ],
  };
  it('komadi presečeni cevima zadržavaju dozvolu da ulaze u vođice', async () => {
    const { withReinforce } = await import('../domain/models/reinforce');
    const { scaledModel } = await import('../domain/models/customRegistry');
    registerCustomModels([nest], MODEL_MATERIALS);
    const whole = findOverlaps(nest, MODEL_MATERIALS).length;
    expect(whole).toBe(0);
    const scaled = scaledModel(nest, 5100, 1500);
    const before = findOverlaps(scaled, MODEL_MATERIALS).length;
    const out = withReinforce(scaled, undefined, MODEL_MATERIALS);
    expect(out.parts.filter((p) => p.id.startsWith('c_c')).length).toBe(3);
    // presecanje cevima ne sme da doda preklapanja sa U vođicama
    expect(findOverlaps(out, MODEL_MATERIALS).length).toBeLessThanOrEqual(before);
  });
});

describe('crtanje: U vođice iznad komada prečki', () => {
  it('U profil se crta posle komada presečenih cevima (i kad su sačuvani bez oznake)', async () => {
    const { resolveParts } = await import('../domain/models/custom');
    const parts: CustomPart[] = [
      { id: 'a', materialId: U, x: 30, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
      { id: 'c_c1', materialId: 'mat_ek_kv000007', x: 20, y: 700, lengthMm: 500, angleDeg: 0, rot: 0, z: 0 },
    ];
    const order = (ps: CustomPart[]) => resolveParts({ parts: ps, color: 'RAL 7016' }, MODEL_MATERIALS).map((r) => r.part.id);
    expect(order(parts)).toEqual(['c_c1', 'a']);
    expect(order([parts[1], { ...parts[0], z: 5 }])).toEqual(['c_c1', 'a']);
    expect(order([{ ...parts[1], nests: ['a'] }, parts[0]])).toEqual(['c_c1', 'a']);
  });
});

describe('ugrađeno ojačanje iz crteža kapije', () => {
  it('crtež nacrtan na 5100 mm sa cevima na krilu od 10 m dobija cevi za 10 m', async () => {
    const { unbakeReinforce } = await import('../domain/models/reinforce');
    const seed = leafSeed('h_narrow', [], MODEL_MATERIALS, 'x', 5100, 1400);
    if ('error' in seed) throw new Error(seed.error);
    expect(seed.parts.filter((p) => p.id.startsWith('rf_v')).length).toBe(2);
    const clean = unbakeReinforce(seed);
    expect(clean.parts.some((p) => p.id.startsWith('rf_') || /_c\d+$/.test(p.id))).toBe(false);
    // isti broj prečki kao pre presecanja
    const bars = seed.parts.filter((p) => /_c1$/.test(p.id)).length;
    expect(clean.parts.length).toBe(seed.parts.length - seed.parts.filter((p) => p.id.startsWith('rf_')).length - bars * 2);
    const gate: CustomModel = { ...seed, id: 'cm_gate10', kind: 'gate' };
    registerCustomModels([gate], MODEL_MATERIALS);
    const tubes = customPartsFor('cm_gate10', 10000, 1400, 'RAL 7016').filter((r) => r.part.id.startsWith('rf_v'));
    expect(tubes.length).toBe(3);
    expect(customReinforceRows('cm_gate10', 10000, 1400).find((r) => r.key === 'v')?.qty).toBe(3);
  });
});

describe('uspravna cev deli ispunu na dva platna', () => {
  const nest: CustomModel = {
    ...newCustomModel('cm_two'), widthMm: 2000, heightMm: 1500,
    parts: [
      { id: 'a', materialId: U, x: 74, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
      { id: 'b', materialId: U, x: 1926, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
      ...[200, 500, 800, 1100].map((y, i) => ({ id: `c${i}`, materialId: 'mat_ek_kv000007', x: 62, y, lengthMm: 1876, angleDeg: 0, rot: 0, z: 0, guides: ['a', 'b'] as [string, string] })),
    ],
  };
  it('sa obe strane cevi je U profil kao bočni, komadi prečki ulaze u njega isto koliko i u bočne', async () => {
    const { withReinforce } = await import('../domain/models/reinforce');
    const { scaledModel } = await import('../domain/models/customRegistry');
    const { partBounds } = await import('../domain/models/custom');
    const { materialShape } = await import('../domain/models/materialShape');
    registerCustomModels([nest], MODEL_MATERIALS);
    const out = withReinforce(scaledModel(nest, 3000, 1500), undefined, MODEL_MATERIALS);
    const b = (id: string) => { const p = out.parts.find((q) => q.id === id)!; return partBounds(p, materialShape(MODEL_MATERIALS.find((m) => m.id === p.materialId)!)); };
    const tube = b('rf_v1'); const ul = b('rf_u1_l'); const ur = b('rf_u1_r');
    // U profili naležu na cev sa obe strane, iste širine kao bočni
    expect(ul.x1).toBeCloseTo(tube.x0, 0); expect(ur.x0).toBeCloseTo(tube.x1, 0);
    expect(ul.x1 - ul.x0).toBeCloseTo(b('b').x1 - b('b').x0, 3);
    // ulazak prečke: u bočnu levu vođicu = u desni U uz cev; u desni U uz cev = u bočnu desnu vođicu
    const sideIn = b('a').x1 - b('c0_c1').x0;
    expect(b('c0_c2').x0).toBeCloseTo(ur.x1 - sideIn, 0);
    expect(out.parts.find((p) => p.id === 'c0_c1')!.guides).toEqual(['a', 'rf_u1_l']);
    expect(out.parts.find((p) => p.id === 'c0_c2')!.guides).toEqual(['rf_u1_r', 'b']);
    expect(findOverlaps(out, MODEL_MATERIALS)).toEqual([]);
  });
});
