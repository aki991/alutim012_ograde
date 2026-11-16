import { afterEach, describe, expect, it } from 'vitest';
import { newCustomModel, partBounds, type CustomModel, type CustomPart } from '../domain/models/custom';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { frameIds, frameSidesOf, modelWithFrame, modelWithRotatedFrame, resizeWithFrame, type FrameSides } from '../domain/models/frame';
import { materialShape } from '../domain/models/materialShape';
import { checkNewOverlap, findOverlaps } from '../domain/models/overlap';
import { settleModel } from '../domain/models/settle';
import type { FenceModelId, Material } from '../domain/models/types';
import { buildCutList } from '../domain/pricing/production';

const mat = (id: string, name: string): Material => ({ id, sku: id, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const tube = mat('m_t', 'Kvadratna cev 60×40×3 mm');
const slat = mat('m_s', 'Kvadratna cev 80×20×1 mm');
const MATS = [tube, slat];
const shapeOf = (p: CustomPart) => materialShape(MATS.find((m) => m.id === p.materialId)!);

/** platno: pet letvica 1000 mm jedna iznad druge */
const canvas = (): CustomModel => ({
  ...newCustomModel('cm_fs'), widthMm: 1000, heightMm: 500,
  parts: Array.from({ length: 5 }, (_, i): CustomPart => ({ id: `s${i}`, materialId: slat.id, x: 0, y: i * 100, lengthMm: 1000, angleDeg: 0, rot: 0, z: 0 })),
});
const LTR: FrameSides = { left: true, right: true, top: true, bottom: false };

const framed = (sides: FrameSides): CustomModel => {
  const r = modelWithFrame(settleModel(canvas(), MATS, true).model, tube, MATS, undefined, sides);
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('ram sa izborom strana', () => {
  afterEach(() => registerCustomModels([], []));

  it('levo, desno i gore: tri dela, model raste samo za izabrane strane', () => {
    const base = settleModel(canvas(), MATS, true).model;
    const m = framed(LTR);
    const fp = m.parts.filter((p) => p.cut45 && p.miter);
    expect(fp).toHaveLength(3);
    expect(frameIds(m)).toHaveLength(3);
    expect(frameSidesOf(m)).toEqual(LTR);
    const w = partBounds(fp[0], shapeOf(fp[0]));
    const face = Math.min(w.x1 - w.x0, w.y1 - w.y0); // 40 ili 60 mm: širina preseka rama u ravni
    expect(m.widthMm).toBeCloseTo(base.widthMm + 2 * face, 3);
    expect(m.heightMm).toBeCloseTo(base.heightMm + face, 3); // dole nema rama
    expect(partBounds(m.parts.find((p) => p.id === 's0')!, shapeOf(m.parts[0])).y0).toBeCloseTo(0, 3); // platno stoji na dnu
  });

  it('45° je samo na uglovima: gornja ima oba, uspravne samo gore, donji kraj je ravan', () => {
    const m = framed(LTR);
    const top = m.parts.find((p) => p.miter === 'hi' && p.angleDeg === 0)!;
    const left = m.parts.find((p) => p.miter === 'hi' && p.angleDeg === 90)!;
    const right = m.parts.find((p) => p.miter === 'lo' && p.angleDeg === 90)!;
    expect(top.miterEnds).toBeUndefined(); // oba kraja
    expect(left.miterEnds).toEqual([false, true]);
    expect(right.miterEnds).toEqual([false, true]);
    expect(findOverlaps(m, MATS)).toEqual([]);
  });

  it('puna četiri strane rade kao do sada (bez oznake krajeva)', () => {
    const m = framed({ left: true, right: true, top: true, bottom: true });
    expect(m.parts.filter((p) => p.cut45)).toHaveLength(4);
    expect(m.parts.every((p) => p.miterEnds === undefined)).toBe(true);
    expect(findOverlaps(m, MATS)).toEqual([]);
  });

  it('bar jedna strana je obavezna', () => {
    const r = modelWithFrame(canvas(), tube, MATS, undefined, { left: false, right: false, top: false, bottom: false });
    expect('error' in r).toBe(true);
  });

  it('promena širine i visine i okretanje rama čuvaju izabrane strane i ništa se ne preklapa', () => {
    const m = settleModel(framed(LTR), MATS, true).model;
    const wide = resizeWithFrame(m, m.widthMm + 400, m.heightMm + 200, MATS);
    if ('error' in wide) throw new Error(wide.error);
    expect(frameSidesOf(wide)).toEqual(LTR);
    expect(wide.parts.filter((p) => p.cut45)).toHaveLength(3);
    expect(wide.widthMm).toBeCloseTo(m.widthMm + 400, 2);
    expect(wide.heightMm).toBeCloseTo(m.heightMm + 200, 2);
    expect(checkNewOverlap(m, settleModel(wide, MATS, true).model, MATS)).toBeNull();
    const rot = modelWithRotatedFrame(m, 90, MATS);
    if ('error' in rot) throw new Error(rot.error);
    expect(frameSidesOf(rot)).toEqual(LTR);
    expect(rot.parts.filter((p) => p.cut45)).toHaveLength(3);
  });

  it('krojna lista: gornja cev 45° na oba kraja, uspravne 45° samo gore (ravan donji kraj)', () => {
    const m = framed(LTR);
    registerCustomModels([{ ...m, id: 'cm_fs_use' }], MATS);
    const p = createProject('t', [createFence({ modelId: 'cm_fs_use' as FenceModelId })]);
    const rows = buildCutList(p, undefined, MATS).filter((r) => r.profile === tube.name);
    const top = rows.find((r) => r.miter);
    const sides = rows.filter((r) => r.ends);
    expect(top).toBeTruthy();
    expect(top!.qty).toBe(1);
    expect(sides.length).toBeGreaterThan(0);
    expect(sides.reduce((s, r) => s + r.qty, 0)).toBe(2);
    for (const r of sides) {
      expect(r.miter).toBeUndefined();
      expect(r.ends!.flat().sort()).toEqual([45, 90]);
    }
  });
});
