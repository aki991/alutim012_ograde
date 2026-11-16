import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { DEFAULT_MODEL_ID } from '../domain/models/catalog';
import { partBounds, resolveParts, zExtent, zExtentTop } from '../domain/models/custom';
import { modelWithFrame } from '../domain/models/frame';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { materialShape, sectionFace } from '../domain/models/materialShape';
import { SEED_MATERIALS } from './fixtures/materials';

const mats = [...MODEL_MATERIALS, ...SEED_MATERIALS.filter((s) => !MODEL_MATERIALS.some((m) => m.id === s.id))];

describe('opseg krila po dubini (Z)', () => {
  it('obuhvata sve profile (z + presek), a sredina je ravan u koju staje okov', () => {
    const base = builtinToCustom(DEFAULT_MODEL_ID, mats, 'cm_z', 3000, 1285);
    const fm = mats.find((m) => m.name.includes('40×40'))!;
    const framed = modelWithFrame(base, fm, mats);
    if ('error' in framed) throw new Error(framed.error);
    const parts = resolveParts(framed, mats);
    const zx = zExtent(parts)!;
    expect(zx.depth).toBeGreaterThan(0);
    expect(zx.mid).toBeCloseTo((zx.z0 + zx.z1) / 2, 6);
    // nijedan profil ne izlazi iz opsega, a bar jedan dodiruje svaku ivicu
    const edges = parts.filter((r) => r.shape.type === 'linear').map((r) => { const e = sectionFace((r.shape as Extract<typeof r.shape, { type: 'linear' }>).section, r.part.angleDeg + r.part.rot); return [r.part.z + e.v0, r.part.z + e.v1]; });
    expect(Math.min(...edges.map((e) => e[0]))).toBeCloseTo(zx.z0, 3);
    expect(Math.max(...edges.map((e) => e[1]))).toBeCloseTo(zx.z1, 3);
  });

  it('gornji deo krila: opseg samo delova uz gornju ivicu leži unutar celog opsega (valjci vođice leže na gornju prečku)', () => {
    const base = builtinToCustom(DEFAULT_MODEL_ID, mats, 'cm_zt', 3000, 1285);
    const fm = mats.find((m) => m.name.includes('40×40'))!;
    const framed = modelWithFrame(base, fm, mats);
    if ('error' in framed) throw new Error(framed.error);
    const parts = resolveParts(framed, mats);
    const all = zExtent(parts)!; const top = zExtentTop(parts, framed.heightMm)!;
    expect(top.z0).toBeGreaterThanOrEqual(all.z0 - 1e-6);
    expect(top.z1).toBeLessThanOrEqual(all.z1 + 1e-6);
    // ram 40 × 40 stoji na gornjoj ivici: gornji deo je debeo 40 mm, a ceo opseg nije manji od njega
    expect(top.depth).toBeCloseTo(40, 3);
    expect(all.depth).toBeGreaterThanOrEqual(top.depth - 1e-6);
  });

  it('pomeranje celog krila po Z pomera i sredinu, a dubina ostaje ista', () => {
    const base = builtinToCustom(DEFAULT_MODEL_ID, mats, 'cm_z2', 3000, 1285);
    const a = zExtent(resolveParts(base, mats))!;
    const moved = { ...base, parts: base.parts.map((p) => ({ ...p, z: p.z + 37 })) };
    const b = zExtent(resolveParts(moved, mats))!;
    expect(b.mid - a.mid).toBeCloseTo(37, 6);
    expect(b.depth).toBeCloseTo(a.depth, 6);
    // pomoćne funkcije se ne menjaju
    expect(materialShape(mats[0])).toBeTruthy();
    expect(partBounds(base.parts[0], materialShape(mats.find((m) => m.id === base.parts[0].materialId)!)).x1).toBeGreaterThan(0);
  });
});
