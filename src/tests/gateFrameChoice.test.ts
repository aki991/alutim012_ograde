import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { SEED_SETTINGS } from '../data/seed';
import { defaultGateConfig } from '../domain/gates/gateModels';
import { newCustomModel, partBounds, type CustomModel } from '../domain/models/custom';
import { customModelOf, registerCustomModels } from '../domain/models/customRegistry';
import { createGate, createProject } from '../domain/models/factories';
import { isFramePart, modelWithFrame } from '../domain/models/frame';
import { drawnFrameOf, framedGateModel } from '../domain/models/gateFrame';
import { materialShape } from '../domain/models/materialShape';
import { findOverlaps } from '../domain/models/overlap';
import type { FenceModelId, Gate, Material } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

const T6040 = { ...MODEL_MATERIALS.find((m) => m.id === 'mat_kv_30x20')!, id: 't6040', name: 'Kvadratna cev 60×40×2', dims: { a: 60, b: 40 } } as Material;
const MATS = [...MODEL_MATERIALS, T6040];
const U = 'mat_u_60x28';
const FENCE: CustomModel = { ...newCustomModel('cm_ograda_r'), name: 'U profil i prečke', kind: 'fence', widthMm: 2000, heightMm: 1400, parts: [
  { id: 'a', materialId: U, x: 74, y: 0, lengthMm: 1400, angleDeg: 90, rot: 270, z: 0 },
  { id: 'b', materialId: U, x: 1926, y: 0, lengthMm: 1400, angleDeg: 90, rot: 90, z: 0 },
  ...[200, 500, 800, 1100].map((y, i) => ({ id: `c${i}`, materialId: 'mat_ek_kv000007', x: 62, y, lengthMm: 1876, angleDeg: 0, rot: 0, z: 0, guides: ['a', 'b'] as [string, string] })),
] };
const face = (m: CustomModel) => { const f = m.parts.find((p) => isFramePart(p) && p.angleDeg === 90)!; const b = partBounds(f, materialShape(MATS.find((x) => x.id === f.materialId)!)); return b.x1 - b.x0; };

afterEach(() => registerCustomModels([], []));

describe('ram kapije: cev i čelo', () => {
  it('čelo 60 ili 40: širina rama spreda prati izbor', () => {
    const r0 = framedGateModel(FENCE, T6040, MATS, 0); const r90 = framedGateModel(FENCE, T6040, MATS, 90);
    if ('error' in r0 || 'error' in r90) throw new Error('ram');
    expect([face(r0), face(r90)].map(Math.round)).toEqual([60, 40]);
  });

  it('model sa nacrtanim ramom 30 × 20 dobija cev 60 × 40 umesto njega: ispuna ista, ram deblji, bez preklapanja', () => {
    const drawn = modelWithFrame(FENCE, MATS.find((m) => m.id === 'mat_kv_30x20')!, MATS, 0);
    if ('error' in drawn) throw new Error(drawn.error);
    const old = face(drawn);
    const out = framedGateModel(drawn, T6040, MATS, 0);
    if ('error' in out) throw new Error(out.error);
    expect(out.parts.filter(isFramePart).every((p) => p.materialId === 't6040')).toBe(true);
    expect(out.parts.filter(isFramePart)).toHaveLength(4);
    const f = face(out);
    expect(out.widthMm).toBeCloseTo(drawn.widthMm + 2 * (f - old), 3);
    // ispuna je pomerena tačno za razliku debljine rama
    const c0 = (m: CustomModel) => m.parts.find((p) => p.id === 'c0')!;
    expect(c0(out).x - c0(drawn).x).toBeCloseTo(f - old, 3);
    expect(c0(out).lengthMm).toBe(c0(drawn).lengthMm);
    expect(findOverlaps(out, MATS)).toEqual([]);
    expect(drawnFrameOf(drawn)).toEqual({ materialId: 'mat_kv_30x20', rot: 0 });
  });
});

describe('izbor rama u svojstvima kapije (editor)', () => {
  const st = () => useAppStore.getState();
  const gate = (id: string) => st().projects[0].items.find((i): i is Gate => i.id === id)!;
  const setup = (scope: 'one' | 'same') => {
    registerCustomModels([FENCE], MATS);
    const g1 = createGate('single', { infillModelId: FENCE.id as FenceModelId });
    const g2 = createGate('sliding', { infillModelId: FENCE.id as FenceModelId, sliding: { ...defaultGateConfig('sliding').sliding!, drawnLeaf: true, heightTotal: true } });
    const p = createProject('T', [g1, g2], null);
    useAppStore.setState({ ready: true, projects: [p], materials: MATS, settings: { ...SEED_SETTINGS, customModels: [FENCE] }, editor: { ...st().editor, projectId: p.id, selection: { type: 'item', id: g1.id }, scope } });
    return [g1.id, g2.id];
  };

  it('samo ova kapija: druga kapija ostaje kakva je', () => {
    const [a, b] = setup('one');
    st().setItemColor(b, 'RAL9005'); // klizna kapija dobija svoj ram pri prvoj izmeni
    const before = gate(b).infillModelId;
    st().setGateFrame(a, 't6040', 90);
    expect(gate(a).params.gateFrame).toEqual({ baseId: FENCE.id, materialId: 't6040', rot: 90 });
    expect(customModelOf(gate(a).infillModelId)!.parts.filter(isFramePart).every((p) => p.materialId === 't6040')).toBe(true);
    expect(gate(b).infillModelId).toBe(before);
  });

  it('sve kapije: i klizna dobija istu cev i čelo oko svog modela', () => {
    const [a, b] = setup('same');
    st().setGateFrame(a, 't6040', 0);
    for (const id of [a, b]) {
      expect(gate(id).params.gateFrame).toEqual({ baseId: FENCE.id, materialId: 't6040', rot: 0 });
      const m = customModelOf(gate(id).infillModelId)!;
      expect(m.parts.filter(isFramePart).every((p) => p.materialId === 't6040')).toBe(true);
    }
    // bez rama vraća model ograde na obe
    st().setGateFrame(a, null);
    expect([gate(a).infillModelId, gate(b).infillModelId]).toEqual([FENCE.id, FENCE.id]);
  });
});
