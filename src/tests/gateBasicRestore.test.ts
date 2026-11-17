import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gateModelChoices } from '../components/gates/GateModelPicker';
import { SEED_SETTINGS } from '../data/seed';
import { defaultGateConfig } from '../domain/gates/gateModels';
import { projectModelId } from '../domain/models/catalog';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels, setHiddenModels } from '../domain/models/customRegistry';
import { createProject } from '../domain/models/factories';
import type { FenceModelId, Gate } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

const part = { id: 'p', materialId: 'm', x: 0, y: 0, lengthMm: 100, angleDeg: 0, rot: 0, z: 0 };
/** moj tip kapije (klizna) nacrtan za ogradu „Bela — uske vertikalne letvice“ */
/** ograde su nacrtani modeli (originalni modeli iz kataloga su obrisani, vidi REMOVED_MODELS) */
const FENCE_P: CustomModel = { ...newCustomModel('cm_ograda_bela'), name: 'Bela ograda', kind: 'fence', parts: [part] };
const FENCE_H: CustomModel = { ...newCustomModel('cm_ograda_crna'), name: 'Crna ograda', kind: 'fence', parts: [part] };
const P = FENCE_P.id; const H = FENCE_H.id;
const TYPE: CustomModel = { ...newCustomModel('cm_klizna'), name: 'Samonoseća · ručna', kind: 'gate', leafModelId: P, parts: [part], gate: defaultGateConfig('sliding') };
/** isti tip za drugu ogradu */
const OTHER: CustomModel = { ...newCustomModel('cm_klizna_crna'), name: 'Crna klizna', kind: 'gate', leafModelId: H, parts: [part], gate: defaultGateConfig('sliding') };
const st = () => useAppStore.getState();
const items = () => st().projects[0].items;
const gateOf = (id?: string) => items().find((i): i is Gate => i.kind === 'gate' && (!id || i.id === id))!;
const fenceOf = () => projectModelId(items());

function setup(models0: CustomModel[], active: string = P) {
  const models = [FENCE_P, FENCE_H, ...models0];
  registerCustomModels(models, []);
  const p = createProject('T', [], null);
  useAppStore.setState({ ready: true, projects: [p], settings: { ...SEED_SETTINGS, customModels: models }, editor: { ...st().editor, projectId: p.id, activeModelId: active as FenceModelId } });
}

describe('tip kapije nije model ograde', () => {
  beforeEach(() => setup([TYPE, OTHER]));
  afterEach(() => { registerCustomModels([], []); setHiddenModels([]); });

  it('izbor tipa kapije ne menja model ograde, a povratak na običnu kapiju ga ostavlja', () => {
    const id = st().addElement({ kind: 'gate', gateType: 'sliding', modelId: P as FenceModelId })!;
    expect(fenceOf()).toBe(P);
    st().applyGateModel(id, TYPE.id);
    expect(fenceOf()).toBe(P); // ne „Samonoseća · ručna“
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe(P);
    expect(gateOf().design).toBeUndefined();
  });

  it('kapija dodata odmah kao tip ima ogradu tog tipa, bez obzira na ogradu izabranu u editoru', () => {
    const id = st().addGateFromModel(TYPE.id)!;
    expect(fenceOf()).toBe(P);
    st().setActiveModel(H as FenceModelId);
    expect(fenceOf()).toBe(P);
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe(P);
  });

  it('ograda ostaje i kad je dorađena (ima svoj crtež): tip kapije za originalni model važi za njen dorađen crtež', () => {
    const reworked: CustomModel = { ...newCustomModel('cm_bela'), name: 'Bela — uske vertikalne letvice', kind: 'fence', replaces: 'picket_narrow', parts: [part] };
    const TYPE_ORIG: CustomModel = { ...TYPE, id: 'cm_klizna_orig', leafModelId: 'picket_narrow' };
    setup([TYPE_ORIG, reworked]);
    st().setActiveModel(reworked.id as FenceModelId);
    const id = st().addSlidingGate({ preset: 'klizna_sina_rucna' })!;
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([TYPE_ORIG.id]);
    st().applyGateModel(id, TYPE_ORIG.id);
    expect(fenceOf()).toBe(reworked.id);
    st().setActiveModel(H as FenceModelId);
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe(reworked.id);
  });

  it('tip kapije se nudi samo uz svoju ogradu', () => {
    st().setActiveModel(H as FenceModelId);
    st().addSlidingGate({ preset: 'klizna_sina_rucna' });
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([OTHER.id]); // crna ograda: samo crni tip
    st().mutate((p) => ({ ...p, items: [], posts: [] }));
    st().setActiveModel(P as FenceModelId);
    st().addSlidingGate({ preset: 'klizna_sina_rucna' });
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([TYPE.id]);
  });

  it('tip se ne dodaje u projekat sa drugom ogradom', () => {
    st().addElement({ kind: 'fence', modelId: H as FenceModelId });
    expect(st().addGateFromModel(TYPE.id)).toBeNull();
    expect(items()).toHaveLength(1);
    expect(st().editor.notice).toMatch(/drugu ogradu/);
    expect(st().addGateFromModel(OTHER.id)).not.toBeNull();
    expect(items()).toHaveLength(2);
  });

  it('promena modela ograde vraća kapiju sa tipom druge ograde na običnu kapiju nove ograde', () => {
    const id = st().addSlidingGate({ preset: 'klizna_sina_rucna' })!;
    st().applyGateModel(id, TYPE.id);
    st().setItemModel('', H as FenceModelId);
    expect(gateOf().infillModelId).toBe(H);
    expect(gateOf().design).toBeUndefined();
    expect(fenceOf()).toBe(H);
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([OTHER.id]);
  });

  it('obrisana ograda se ne vraća: ni zapamćena, ni ograda tipa kapije', () => {
    const id = st().addElement({ kind: 'gate', gateType: 'sliding', modelId: P as FenceModelId })!;
    st().applyGateModel(id, TYPE.id);
    st().removeCustomModel(P); // obrisana ograda (nacrtan model)
    st().setActiveModel(H as FenceModelId);
    expect(fenceOf()).not.toBe(P);
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe(H);
  });
});
