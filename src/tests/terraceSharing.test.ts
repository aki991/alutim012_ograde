import { describe, expect, it } from 'vitest';
import { newCustomModel, newTerraceModel } from '../domain/models/custom';
import { allFenceModels, customModelOf, registerCustomModels, terraceVariantId, terraceVariants } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { isTerraceModel } from '../domain/models/catalog';
import { computeLayout } from '../domain/geometry/layout';
import { isStair } from '../domain/geometry/stair';
import { SEED_MATERIALS } from './fixtures/materials';

const yard = { ...newCustomModel('Prvi dvorišni'), id: 'cm_share_yard' as const, parts: [{ id: 'tube', materialId: SEED_MATERIALS[0].id, x: 0, y: 0, lengthMm: 1200, angleDeg: 0, rot: 0, z: 0 }] };
const terrace = { ...newTerraceModel('Samo terasa'), id: 'cm_native_terrace', parts: yard.parts };

describe('dvorišni modeli dostupni i za terase', () => {
  it('izabrani model ostaje dvorišni i dobija povezanu terasnu varijantu', () => {
    registerCustomModels([yard, terrace], SEED_MATERIALS, [yard.id]);
    const alias = terraceVariantId(yard.id);
    expect(allFenceModels(undefined, 'yard').map((m) => m.id)).toEqual([yard.id]);
    expect(allFenceModels(undefined, 'terrace').map((m) => m.id)).toContain(alias);
    expect(isTerraceModel(yard.id)).toBe(false);
    expect(isTerraceModel(alias)).toBe(true);
    expect(customModelOf(alias)?.parts).toEqual(yard.parts);
    expect(terraceVariants().map((m) => m.terraceSourceId)).toEqual([yard.id]);
    expect(isStair(createFence({ modelId: alias, stair: { riseMm: -600 } }))).toBe(true);
    const layout = computeLayout(createProject('Deljeni model', [createFence({ modelId: alias })]));
    expect(layout.postCount).toBe(0); // fizičke stubove sada računa terasni model
  });
  it('izmena izvora osvežava varijantu; odštiklirana varijanta ostaje dostupna starim projektima', () => {
    const alias = terraceVariantId(yard.id);
    registerCustomModels([{ ...yard, name: 'Promenjen naziv', parts: [{ ...yard.parts[0], lengthMm: 2100 }] }], SEED_MATERIALS, [yard.id]);
    expect(customModelOf(alias)).toMatchObject({ name: 'Promenjen naziv', parts: [{ lengthMm: 2100 }] });
    registerCustomModels([yard], SEED_MATERIALS, []);
    expect(allFenceModels(undefined, 'terrace').map((m) => m.id)).not.toContain(alias);
    expect(customModelOf(alias)?.parts).toEqual(yard.parts);
    expect(allFenceModels(undefined, 'yard').map((m) => m.id)).toEqual([yard.id]);
  });
});
