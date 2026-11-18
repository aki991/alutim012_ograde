import { beforeEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { customModelOf, registerCustomModels } from '../domain/models/customRegistry';
import { FENCE_MODELS } from '../domain/models/catalog';
import { frameCandidates, framedGateModel, modelDepthMm, framedModelId, hasRealFrame, suggestFrameMaterial } from '../domain/models/gateFrame';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';

const u = MODEL_MATERIALS.find((m) => /^U profil 60/i.test(m.name)) ?? MODEL_MATERIALS.find((m) => { const s = materialShape(m); return s.type === 'linear' && !!s.u; })!;
const base: CustomModel = { ...newCustomModel('cm_base'), parts: [
  { id: 'a', materialId: u.id, x: 30, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
  { id: 'b', materialId: u.id, x: 1970, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
] };

describe('ram kapije od ručno nacrtanog modela', () => {
  beforeEach(() => registerCustomModels([base], MODEL_MATERIALS));
  it('predlaže kvadratnu cev i dodaje ram', () => {
    const mat = suggestFrameMaterial(base, MODEL_MATERIALS);
    expect(mat).toBeTruthy();
    expect(frameCandidates(MODEL_MATERIALS).some((m) => m.id === mat!.id)).toBe(true);
    const f = framedGateModel(base, mat!, MODEL_MATERIALS);
    if ('error' in f) throw new Error(f.error);
    expect(hasRealFrame(f)).toBe(true);
    expect(f.parts.length).toBe(base.parts.length + 4);
  });
  it('izvedeni model se registruje iz osnovnog', () => {
    const mat = suggestFrameMaterial(base, MODEL_MATERIALS)!;
    const id = framedModelId(base.id, mat.id);
    registerCustomModels([base, { ...base, id, kind: 'gate', parts: [], derivedFrom: base.id, frameMaterialId: mat.id }], MODEL_MATERIALS);
    expect(id in FENCE_MODELS).toBe(true);
    expect(hasRealFrame(customModelOf(id)!)).toBe(true);
  });
});

it('U 60×28 → cev širine 60', () => {
  const m = { ...base, parts: base.parts.map((p) => ({ ...p, materialId: 'mat_u_60x28' })) };
  expect(modelDepthMm(m, MODEL_MATERIALS)).toBe(60);
  // cenovnik sa cevi 60×60: ona se predlaže (kvadratna, širina = dubina modela)
  const t60 = { ...MODEL_MATERIALS.find((x) => x.name === 'Kvadratna cev 80×80×3')!, id: 't60', name: 'Kvadratna cev 60×60×2', dims: { a: 60, b: 60 } } as never;
  const mats = [...MODEL_MATERIALS, t60];
  const pick = suggestFrameMaterial(m, mats)!;
  const s = materialShape(pick);
  if (s.type !== 'linear') throw new Error('x');
  expect([s.section.w, s.section.h]).toEqual([60, 60]);
});
