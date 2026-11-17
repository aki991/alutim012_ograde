import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { computeLayout } from '../domain/geometry/layout';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { registerCustomModels, scaledModel } from '../domain/models/customRegistry';
import { FENCE_MODELS } from '../domain/models/catalog';
import { createFence, createProject } from '../domain/models/factories';
import { partBounds } from '../domain/models/custom';
import { shapeLookup } from '../domain/models/guides';
import { materialShape } from '../domain/models/materialShape';
import type { CustomModel } from '../domain/models/custom';
import type { FenceModelId, Material } from '../domain/models/types';
import { buildCutList } from '../domain/pricing/production';

const mk = (id: string, sku: string, name: string): Material => ({ id, sku, name, category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: true });
const WIDE = mk('mat_imp_kv000023', 'KV000023', 'Kvadratna cev 80×20×1');
const THIN = mk('mat_imp_kv000022', 'KV000022', 'Kvadratna cev 20×20×1');
const UP = mk('mat_3d8fcb2ead', 'KV25202', 'U profil 25×20×2');
const M = [...SEED_MATERIALS, WIDE, THIN, UP];

/** model korisnika: široke (80×20) i uske (20×20) prečke naizmenično u dve bočne U vođice, uska dole, široka gore */
function comboModel(): CustomModel {
  const G = ['u1', 'u2'] as [string, string];
  const bar = (id: string, y: number, mat: string) => ({ id, materialId: mat, x: 2, y, z: 0, rot: 0, lufta: 'sa' as const, guides: G, angleDeg: 0, lengthMm: 596 });
  return {
    id: 'cm_combo', name: 'Braon — kombinovane', kind: 'fence', widthMm: 600, heightMm: 600, color: 'RAL 8017', updatedAt: '', baseModelId: 'h_combo',
    parts: [
      { id: 'u1', materialId: UP.id, x: 10, y: 0, z: 0, rot: 270, angleDeg: 90, lengthMm: 600 },
      { id: 'u2', materialId: UP.id, x: 590, y: 0, z: 0, rot: 90, angleDeg: 90, lengthMm: 600 },
      bar('b1', 105.71, WIDE.id), bar('b2', 257.14, WIDE.id), bar('b3', 408.57, WIDE.id), bar('b4', 560, WIDE.id),
      bar('t1', 484.29, THIN.id), bar('t2', 332.86, THIN.id), bar('t3', 181.43, THIN.id), bar('t4', 30, THIN.id),
    ],
  };
}

const models: [string, CustomModel][] = [
  ['kombinovane (dva profila)', comboModel()],
  ...Object.keys(FENCE_MODELS).filter((id) => !(FENCE_MODELS as Record<string, { terrace?: boolean }>)[id].terrace && FENCE_MODELS[id as FenceModelId].style !== 'rods' && FENCE_MODELS[id as FenceModelId].style !== 'glass_rail')
    .map((id): [string, CustomModel] => [id, { ...builtinToCustom(id as FenceModelId, M, `cm_${id}`, 1500, 1200), baseModelId: id }]),
];

afterEach(() => registerCustomModels([], M));

describe('krojna lista = crtež (ista količina i dužina po profilu)', () => {
  for (const [label, model] of models) {
    it(label, () => {
      registerCustomModels([model], M);
      for (const h of [1000, 1200, 1600]) {
        const p = createProject('t', [createFence({ modelId: model.id as FenceModelId, heightMm: h })]);
        const clear = computeLayout(p).items[0].clearWidth;
        const cut = buildCutList(p, undefined, M).filter((r) => !r.glass);
        const drawn = scaledModel(model, clear, h).parts.filter((q) => !q.cut45);
        const names = new Set(cut.map((r) => r.profile));
        for (const name of names) {
          const mat = M.find((x) => x.name === name);
          if (!mat) continue;
          const shape = materialShape(mat);
          if (shape.type !== 'linear') continue;
          const want = drawn.filter((q) => q.materialId === mat.id).map((q) => Math.round(q.lengthMm)).sort((a, b) => a - b);
          const got = cut.filter((r) => r.profile === name && !r.miter).flatMap((r) => Array(r.qty).fill(r.lengthMm) as number[]).sort((a, b) => a - b);
          expect(got.length, `${label} ${clear}x${h} ${name}: broj komada`).toBe(want.length);
          got.forEach((l, i) => expect(Math.abs(l - want[i]), `${label} ${clear}x${h} ${name}: dužina ${l} naspram ${want[i]}`).toBeLessThanOrEqual(2));
        }
      }
    });
  }
});

describe('kombinovane letvice (široka + uska naizmenično)', () => {
  it('gore je uvek široka prečka, dole uska, a krojna lista ima oba profila', () => {
    const model = comboModel();
    registerCustomModels([model], M);
    const so = shapeLookup(M);
    for (const h of [700, 1000, 1200, 1500, 1600, 1800]) {
      const bars = scaledModel(model, 1500, h).parts.filter((q) => q.guides).map((q) => ({ q, b: partBounds(q, so(q) as never) })).sort((a, b) => a.b.y0 - b.b.y0);
      expect(bars[bars.length - 1].q.materialId, `visina ${h}: gornja`).toBe(WIDE.id);
      expect(bars[0].q.materialId, `visina ${h}: donja`).toBe(THIN.id);
      const p = createProject('t', [createFence({ modelId: model.id as FenceModelId, heightMm: h })]);
      const cut = buildCutList(p, undefined, M);
      const qty = (m: Material) => cut.filter((r) => r.profile === m.name).reduce((n, r) => n + r.qty, 0);
      expect(qty(WIDE)).toBe(bars.filter((x) => x.q.materialId === WIDE.id).length);
      expect(qty(THIN)).toBe(bars.filter((x) => x.q.materialId === THIN.id).length);
      expect(qty(THIN)).toBeGreaterThan(0);
    }
  });
});
