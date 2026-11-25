import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { SEED_SETTINGS } from '../data/seed';
import { defaultGateConfig } from '../domain/gates/gateModels';
import { specFromPreset } from '../domain/gates/slidingAssembly';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createGate, createProject } from '../domain/models/factories';
import type { FenceModelId, Gate } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

const U = 'mat_u_60x28';
const FENCE: CustomModel = { ...newCustomModel('cm_ograda_u'), name: 'U profil i prečke', kind: 'fence', parts: [
  { id: 'a', materialId: U, x: 30, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
  { id: 'b', materialId: U, x: 1970, y: 0, lengthMm: 1500, angleDeg: 90, rot: 0, z: 0 },
] };
const part = { id: 'p', materialId: U, x: 0, y: 0, lengthMm: 100, angleDeg: 0, rot: 0, z: 0 };
const TYPE: CustomModel = { ...newCustomModel('cm_moja_klizna'), name: 'Moja klizna', kind: 'gate', leafModelId: FENCE.id, parts: [part], gate: defaultGateConfig('sliding') };
const st = () => useAppStore.getState();
const gateOf = (id: string) => st().projects[0].items.find((i): i is Gate => i.kind === 'gate' && i.id === id)!;

function setup(items: Gate[] = []) {
  const models = [FENCE, TYPE];
  registerCustomModels(models, MODEL_MATERIALS);
  const p = createProject('T', items, null);
  useAppStore.setState({ ready: true, projects: [p], materials: MODEL_MATERIALS, settings: { ...SEED_SETTINGS, customModels: models }, editor: { ...st().editor, projectId: p.id, activeModelId: FENCE.id as FenceModelId } });
}

describe('klizna kapija u editoru je ista kao na stranici Modeli kapija', () => {
  afterEach(() => registerCustomModels([], []));

  it('osnovna klizna kapija dobija krilo sa ramom, isto kao sličica i crtež na stranici Modeli kapija', () => {
    setup();
    const id = st().addSlidingGate({ preset: 'klizna_sina_rucna' })!;
    const g = gateOf(id);
    expect(g.sliding?.drawnLeaf).toBe(true);
    expect(g.infillModelId).toBe(st().gateInfillWithFrame(FENCE.id));
    expect(g.infillModelId).not.toBe(FENCE.id);
    expect(g.params.gateFrame?.baseId).toBe(FENCE.id);
  });

  it('klizna kapija dodata ranije, bez rama, dobija ram pri prvoj izmeni projekta', () => {
    registerCustomModels([FENCE, TYPE], MODEL_MATERIALS);
    const old = createGate('sliding', { infillModelId: FENCE.id as FenceModelId, sliding: { ...specFromPreset('klizna_sina_rucna').spec, drawnLeaf: true, heightTotal: true } });
    setup([old]);
    st().setItemColor(old.id, 'RAL9005');
    expect(gateOf(old.id).infillModelId).toBe(st().gateInfillWithFrame(FENCE.id));
  });

  it('ručno nacrtan tip klizne kapije ostaje izbor i ne dobija drugi ram', () => {
    setup();
    const id = st().addSlidingGate({ preset: 'klizna_sina_rucna' })!;
    st().applyGateModel(id, TYPE.id);
    expect(gateOf(id).design?.template?.id).toBe(TYPE.id);
  });
});

