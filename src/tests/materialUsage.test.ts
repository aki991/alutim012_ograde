import { afterEach, describe, expect, it } from 'vitest';
import { registerCustomModels, setHiddenModels } from '../domain/models/customRegistry';
import { newTerraceModel, type CustomModel } from '../domain/models/custom';
import { FENCE_MODEL_LIST } from '../domain/models/catalog';
import { collectMaterialUsage, modelMaterialIds } from '../domain/models/materialUsage';
import { createFence, createProject } from '../domain/models/factories';
import { extraSpecKey, type SpecPart } from '../domain/models/spec';
import { SEED_SETTINGS } from '../data/seed';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import type { AppSettings, Material } from '../domain/models/types';

const mat = (id: string): Material => ({ id, sku: id, name: 'Profil 20×20×2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 0, demo: false });
const materials = ['used', 'unused', 'extra', 'disabled', 'hardware', 'project-only'].map(mat);
const model: CustomModel = { ...newTerraceModel('cm_usage'), parts: [{ id: 'p', materialId: 'used', x: 0, y: 0, z: 0, rot: 0, angleDeg: 0, lengthMm: 1000, hwPick: { connector: 'hardware' } }] };
const part = (id: string, enabled = true): SpecPart => ({ id, name: id, materialId: id, enabled, qty: '1', group: 'Dodatni materijal' });
const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...SEED_SETTINGS, customModels: [model], hiddenModels: FENCE_MODEL_LIST.map((m) => m.id), ...patch });

afterEach(() => { registerCustomModels([], []); setHiddenModels(); });

describe('razdvajanje materijala prema upotrebi', () => {
  it('prepoznaje stubove i okov detaljne sastavnice ugrađene terasne ograde', () => {
    registerCustomModels([], MODEL_MATERIALS);
    setHiddenModels();
    const usage = collectMaterialUsage(MODEL_MATERIALS, settings({ customModels: [], hiddenModels: [] }), []);
    for (const id of ['mat_bts_p1054', 'mat_bts_ak5039n', 'mat_bts_ak5011y']) expect(usage.terrace.has(id), id).toBe(true);
  });
  it('prepoznaje delove i izabrani okov, bez prebacivanja celog cenovnika u korišćene', () => {
    registerCustomModels([model], materials);
    setHiddenModels(FENCE_MODEL_LIST.map((m) => m.id));
    const usage = collectMaterialUsage(materials, settings(), []);
    expect([...usage.used].sort()).toEqual(['hardware', 'used']);
    expect(usage.terrace.has('used')).toBe(true);
    expect(usage.yard.has('used')).toBe(false);
    expect(usage.used.has('unused')).toBe(false);
  });

  it('uključuje dodatnu sastavnicu, a isključene stavke ostavlja među nekorišćenim', () => {
    registerCustomModels([model], materials);
    setHiddenModels(FENCE_MODEL_LIST.map((m) => m.id));
    const usage = collectMaterialUsage(materials, settings({ modelSpecs: { [extraSpecKey(model.id)]: [part('extra'), part('disabled', false)] } }), []);
    expect(usage.terrace.has('extra')).toBe(true);
    expect(usage.used.has('disabled')).toBe(false);
  });

  it('materijal ostaje korišćen dok ga koristi projekat i kada je model sakriven', () => {
    registerCustomModels([], materials);
    setHiddenModels(FENCE_MODEL_LIST.map((m) => m.id));
    const project = createProject('Sačuvan projekat', [createFence({ modelId: 'rail_black' })]);
    const specs = { rail_black: [part('project-only')] };
    const usage = collectMaterialUsage(materials, settings({ customModels: [], modelSpecs: specs }), [project]);
    expect(usage.used.has('project-only')).toBe(true);
    expect(usage.terrace.has('project-only')).toBe(true);
    expect(collectMaterialUsage(materials, settings({ customModels: [], modelSpecs: specs }), []).used.has('project-only')).toBe(false);
  });

  it('isti materijal može da se koristi za dvorišne ograde i terase', () => {
    const yard: CustomModel = { ...model, id: 'cm_yard_usage', kind: 'fence' };
    registerCustomModels([yard], materials, [yard.id]);
    setHiddenModels(FENCE_MODEL_LIST.map((m) => m.id));
    const usage = collectMaterialUsage(materials, settings({ customModels: [yard], terraceModelIds: [yard.id] }), []);
    expect(usage.yard.has('used')).toBe(true);
    expect(usage.terrace.has('used')).toBe(true);
  });

  it('izmena modela odmah menja pripadnost bez izmene materijala u cenovniku', () => {
    const changed = { ...model, parts: [{ ...model.parts[0], materialId: 'unused' }] };
    expect(modelMaterialIds(changed, materials).has('unused')).toBe(true);
    expect(modelMaterialIds(changed, materials).has('used')).toBe(false);
    expect(materials.find((m) => m.id === 'used')).toEqual(mat('used'));
  });
});
