import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { createFence, createProject } from '../domain/models/factories';
import { newTerraceModel } from '../domain/models/custom';
import { registerCustomModels } from '../domain/models/customRegistry';
import { modelProductionPosts, productionPostCount } from '../domain/models/productionPosts';
import { buildCutList } from '../domain/pricing/production';
import { buildBom, computePrice } from '../domain/pricing/calc';

const mats = withTerraceMaterials(MODEL_MATERIALS)!;
const post = mats.find((m) => m.sku === 'P-1057')!;
const model = { ...newTerraceModel('Staklo'), id: 'cm_summary', widthMm: 1200, heightMm: 1000,
  parts: [100, 1100].map((x, i) => ({ id: `post${i}`, materialId: post.id, x, y: 0, lengthMm: 1000, angleDeg: 90, rot: 0 as const, z: 0 })) };
afterEach(() => registerCustomModels([], mats, []));

describe('zbir stubova i potpunost cene', () => {
  it.each([0, 600, -600])('stubovi u modelu ulaze u zbir i odgovaraju krojnoj listi, uspon %s', (riseMm) => {
    registerCustomModels([model], mats, []);
    const p = createProject('Terasa', [1200, 2400].map((widthMm) => createFence({ modelId: 'cm_summary', widthMm, heightMm: 1000,
      ...(riseMm ? { stair: { riseMm, steps: 4 } } : {}) })));
    const posts = modelProductionPosts(p);
    const cutPosts = buildCutList(p, undefined, mats).filter((r) => r.part === 'Stub');
    expect(posts.reduce((sum, r) => sum + r.qty, 0)).toBe(6);
    expect(productionPostCount(p)).toBe(6);
    expect(posts.map((r) => [r.index, r.lengthMm, r.qty])).toEqual(cutPosts.map((r) => [r.index, r.lengthMm, r.qty]));
  });
  it('nula i obrisan materijal se označavaju kao nepotpuna cena; dodatni materijal se ne broji', () => {
    const p = createProject('Cena', [createFence({ modelId: 'h_white' })]);
    const priced = mats.map((m) => ({ ...m, unitPrice: 100 }));
    const bom = buildBom(p, priced);
    const first = bom.find((l) => l.group !== 'Dodatni materijal')!;
    expect(computePrice(p, priced).unpricedCount).toBe(0);
    const zero = priced.map((m) => m.id === first.materialId ? { ...m, unitPrice: 0 } : m);
    const price = computePrice(p, zero);
    expect(price.unpricedCount).toBe(1);
    expect(price.materialTotal).toBe(buildBom(p, zero).reduce((s, l) => s + l.total, 0));
    expect(computePrice(p, priced.filter((m) => m.id !== first.materialId)).unpricedCount).toBe(1);
    expect(computePrice(createProject('Prazno', []), []).unpricedCount).toBe(0);
  });
});
