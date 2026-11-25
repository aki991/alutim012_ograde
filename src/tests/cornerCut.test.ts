import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { linearLocalPoly, newCustomModel, partAngle, type CustomModel, type CustomPart } from '../domain/models/custom';
import { applyCornerCut, type CornerCut } from '../domain/models/cornerCut';
import { customPartsFor, registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { materialShape, sectionFace } from '../domain/models/materialShape';
import { findOverlaps } from '../domain/models/overlap';
import { cutAngle } from '../domain/models/profileCuts';
import { computeLayout } from '../domain/geometry/layout';
import { buildCutList } from '../domain/pricing/production';
import type { FenceModelId, Material } from '../domain/models/types';

const U = 'mat_u_60x28';
const BAR = 'mat_ek_kv000007';
const slats: CustomModel = {
  ...newCustomModel('cm_cc_slats'), name: 'U profil i prečke', widthMm: 1000, heightMm: 1500,
  parts: [
    { id: 'part_u1', materialId: U, x: 74, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
    { id: 'part_u2', materialId: U, x: 926, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
    ...Array.from({ length: 14 }, (_, i) => ({ id: `part_b${i}`, materialId: BAR, x: 62, y: 40 + i * 105, lengthMm: 876, angleDeg: 0, rot: 0, z: 0, guides: ['part_u1', 'part_u2'] as [string, string] })),
  ],
};

const tube: Material = { id: 'cc-tube', sku: '', name: 'Kvadratna cev 40x40x2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 0, demo: true };
const mats = [...MODEL_MATERIALS, tube];
const part = (id: string, patch: Partial<CustomPart>): CustomPart => ({ id, materialId: tube.id, x: 0, y: 0, z: 0, angleDeg: 0, rot: 0, lengthMm: 100, ...patch });
const framed: CustomModel = {
  ...newCustomModel('cm_cc_frame'), name: 'Ram i letvice', widthMm: 1500, heightMm: 1200,
  parts: [
    part('fb', { x: 0, y: 20, lengthMm: 1500, cut45: true, miter: 'lo' }),
    part('fr', { x: 1480, y: 0, angleDeg: 90, lengthMm: 1200, cut45: true, miter: 'lo' }),
    part('ft', { x: 1500, y: 1180, angleDeg: 180, lengthMm: 1500, cut45: true, miter: 'lo' }),
    part('fl', { x: 20, y: 1200, angleDeg: 270, lengthMm: 1200, cut45: true, miter: 'lo' }),
    ...Array.from({ length: 9 }, (_, i) => part(`s${i}`, { x: 40, y: 140 + i * 110, lengthMm: 1420 })),
  ],
};

const world = (p: CustomPart): [number, number][] => {
  const s = materialShape(mats.find((m) => m.id === p.materialId)!);
  if (s.type !== 'linear') throw new Error('profil');
  const f = sectionFace(s.section, partAngle(p));
  const a = p.angleDeg * Math.PI / 180;
  return linearLocalPoly(p, f.u0, f.u1).map(([x, y]) => [p.x + x * Math.cos(a) - y * Math.sin(a), p.y + x * Math.sin(a) + y * Math.cos(a)]);
};
/** rastojanje tačke od kose linije, + ka platnu */
const below = (W: number, H: number, cut: CornerCut) => {
  const top: [number, number] = [cut.side === 'right' ? W - cut.inMm : cut.inMm, H];
  const edge: [number, number] = [cut.side === 'right' ? W : 0, H - cut.dropMm];
  const d = [edge[0] - top[0], edge[1] - top[1]]; const l = Math.hypot(d[0], d[1]);
  let m = [-d[1] / l, d[0] / l];
  if ((cut.side === 'right' ? W : 0) * m[0] + H * m[1] - (top[0] * m[0] + top[1] * m[1]) > 0) m = [-m[0], -m[1]];
  return (q: [number, number]) => (q[0] - top[0]) * m[0] + (q[1] - top[1]) * m[1];
};

afterEach(() => registerCustomModels([], mats));

describe('odsečen gornji ugao polja', () => {
  const cut: CornerCut = { side: 'right', dropMm: 300, inMm: 250 };

  it('prečke u U profilima: kosi U profil nastavlja bočni, prečke ulaze u njega isto koliko i u bočni', () => {
    const next = applyCornerCut(slats, cut, mats);
    const inside = below(1000, 1500, cut);
    next.parts.forEach((p) => world(p).forEach((q) => expect(inside(q)).toBeGreaterThan(-1e-6)));
    const diag = next.parts.find((p) => p.id === 'part_u2_kosina')!;
    expect(diag).toMatchObject({ materialId: U, rot: 90 });
    const side = next.parts.find((p) => p.id === 'part_u2')!;
    expect(side.lengthMm).toBeLessThan(1300);
    // bočni i kosi profil se spajaju pod zajedničkim uglom, bez preklapanja
    expect(findOverlaps({ parts: [side, diag] }, mats)).toHaveLength(0);
    // prečke iznad kosine otpadaju, a presečene imaju kos kraj pod uglom kosine
    const bars = next.parts.filter((p) => p.materialId === BAR);
    const slope = Math.atan2(300, 250) * 180 / Math.PI;
    const cutBars = bars.filter((p) => p.endCuts);
    expect(cutBars.length).toBeGreaterThan(0);
    cutBars.forEach((p) => expect([p.endCuts![1], p.endTips?.[1]?.deg ?? 90].some((d) => Math.abs(cutAngle(d) - slope) < 1e-6)).toBe(true));
    // dubina ulaska u kosi U profil = dubina ulaska u bočni (26 mm preko unutrašnje ivice)
    const diagIn = below(1000, 1500, cut);
    cutBars.forEach((p) => expect(Math.min(...world(p).map((q) => diagIn(q)))).toBeCloseTo(28 - 26, 3));
    expect(bars.every((p) => p.guides)).toBe(true);
  });

  it('ram: kosa cev se spaja sa bočnom i gornjom cevi rama, letvice su sečene po unutrašnjoj ivici', () => {
    const c: CornerCut = { side: 'right', dropMm: 350, inMm: 600 };
    const next = applyCornerCut(framed, c, mats);
    const inside = below(1500, 1200, c);
    next.parts.forEach((p) => world(p).forEach((q) => expect(inside(q)).toBeGreaterThan(-1e-6)));
    expect(findOverlaps(next, mats)).toHaveLength(0);
    const diag = next.parts.find((p) => p.id === 'fr_kosina')!;
    expect(diag.endCuts).toBeDefined();
    // letvice dodiruju unutrašnju ivicu kose cevi (40 mm od kosine)
    next.parts.filter((p) => p.id.startsWith('s') && p.endCuts).forEach((p) => expect(Math.min(...world(p).map(inside))).toBeCloseTo(40, 3));
  });

  it('levi ugao: isto pravilo u ogledalu', () => {
    const c: CornerCut = { side: 'left', dropMm: 300, inMm: 500 };
    const next = applyCornerCut(framed, c, mats);
    const inside = below(1500, 1200, c);
    next.parts.forEach((p) => world(p).forEach((q) => expect(inside(q)).toBeGreaterThan(-1e-6)));
    expect(findOverlaps(next, mats)).toHaveLength(0);
    expect(next.parts.some((p) => p.id === 'fl_kosina')).toBe(true);
  });

  it('krojna lista prati delove na polju: kosi profil i presečene prečke sa uglovima', () => {
    registerCustomModels([framed], mats);
    const fence = createFence({ modelId: framed.id as FenceModelId, heightMm: 1200 });
    fence.params = { ...fence.params, slats: { cornerCut: { side: 'right', dropMm: 350, inMm: 600 } } };
    const project = createProject('kosina', [fence]);
    const li = computeLayout(project).items[0];
    const placed = customPartsFor(framed.id, li.clearWidth, 1200, '#000', fence.params.slats).filter((r) => r.shape.type === 'linear').map((r) => r.part);
    const rows = buildCutList(project, undefined, mats);
    expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(placed.length);
    for (const p of placed) expect(rows.some((r) => r.lengthMm === Math.round(p.lengthMm))).toBe(true);
    expect(rows.some((r) => r.ends && r.ends.some((e) => e.some((a) => Math.abs(a - 90) > 1 && Math.abs(a - 45) > 1)))).toBe(true);
    const plain = buildCutList(createProject('bez', [{ ...fence, params: { ...fence.params, slats: undefined } }]), undefined, mats);
    expect(plain.reduce((s, r) => s + r.qty, 0)).toBe(framed.parts.length);
  });

  it('bez kosine model ostaje isti', () => {
    expect(applyCornerCut(slats, undefined, mats)).toBe(slats);
    expect(applyCornerCut(slats, { side: 'right', dropMm: 0, inMm: 100 }, mats)).toBe(slats);
  });
});
