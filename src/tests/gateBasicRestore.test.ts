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
const TYPE: CustomModel = { ...newCustomModel('cm_klizna'), name: 'Samonoseća · ručna', kind: 'gate', leafModelId: 'picket_narrow', parts: [part], gate: defaultGateConfig('sliding') };
/** isti tip za drugu ogradu */
const OTHER: CustomModel = { ...newCustomModel('cm_klizna_crna'), name: 'Crna klizna', kind: 'gate', leafModelId: 'h_narrow', parts: [part], gate: defaultGateConfig('sliding') };
const st = () => useAppStore.getState();
const items = () => st().projects[0].items;
const gateOf = (id?: string) => items().find((i): i is Gate => i.kind === 'gate' && (!id || i.id === id))!;
const fenceOf = () => projectModelId(items());

function setup(models: CustomModel[], active: string = 'picket_narrow') {
  registerCustomModels(models, []);
  const p = createProject('T', [], null);
  useAppStore.setState({ ready: true, projects: [p], settings: { ...SEED_SETTINGS, customModels: models }, editor: { ...st().editor, projectId: p.id, activeModelId: active as FenceModelId } });
}

describe('tip kapije nije model ograde', () => {
  beforeEach(() => setup([TYPE, OTHER]));
  afterEach(() => { registerCustomModels([], []); setHiddenModels([]); });

  it('izbor tipa kapije ne menja model ograde, a povratak na običnu kapiju ga ostavlja', () => {
    const id = st().addElement({ kind: 'gate', gateType: 'sliding', modelId: 'picket_narrow' as FenceModelId })!;
    expect(fenceOf()).toBe('picket_narrow');
    st().applyGateModel(id, TYPE.id);
    expect(fenceOf()).toBe('picket_narrow'); // ne „Samonoseća · ručna“
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe('picket_narrow');
    expect(gateOf().design).toBeUndefined();
  });

  it('kapija dodata odmah kao tip ima ogradu tog tipa, bez obzira na ogradu izabranu u editoru', () => {
    const id = st().addGateFromModel(TYPE.id)!;
    expect(fenceOf()).toBe('picket_narrow');
    st().setActiveModel('h_narrow' as FenceModelId);
    expect(fenceOf()).toBe('picket_narrow');
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe('picket_narrow');
  });

  it('ograda ostaje i kad je dorađena (ima svoj crtež): tip kapije za originalni model važi za njen dorađen crtež', () => {
    const reworked: CustomModel = { ...newCustomModel('cm_bela'), name: 'Bela — uske vertikalne letvice', kind: 'fence', replaces: 'picket_narrow', parts: [part] };
    setup([TYPE, reworked]);
    st().setActiveModel(reworked.id as FenceModelId);
    const id = st().addSlidingGate({ preset: 'klizna_sina_rucna' })!;
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([TYPE.id]);
    st().applyGateModel(id, TYPE.id);
    expect(fenceOf()).toBe(reworked.id);
    st().setActiveModel('h_narrow' as FenceModelId);
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe(reworked.id);
  });

  it('tip kapije se nudi samo uz svoju ogradu', () => {
    st().setActiveModel('h_narrow' as FenceModelId);
    st().addSlidingGate({ preset: 'klizna_sina_rucna' });
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([OTHER.id]); // crna ograda: samo crni tip
    st().mutate((p) => ({ ...p, items: [], posts: [] }));
    st().setActiveModel('picket_narrow' as FenceModelId);
    st().addSlidingGate({ preset: 'klizna_sina_rucna' });
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([TYPE.id]);
  });

  it('tip se ne dodaje u projekat sa drugom ogradom', () => {
    st().addElement({ kind: 'fence', modelId: 'h_narrow' as FenceModelId });
    expect(st().addGateFromModel(TYPE.id)).toBeNull();
    expect(items()).toHaveLength(1);
    expect(st().editor.notice).toMatch(/drugu ogradu/);
    expect(st().addGateFromModel(OTHER.id)).not.toBeNull();
    expect(items()).toHaveLength(2);
  });

  it('promena modela ograde vraća kapiju sa tipom druge ograde na običnu kapiju nove ograde', () => {
    const id = st().addSlidingGate({ preset: 'klizna_sina_rucna' })!;
    st().applyGateModel(id, TYPE.id);
    st().setItemModel('', 'h_narrow' as FenceModelId);
    expect(gateOf().infillModelId).toBe('h_narrow');
    expect(gateOf().design).toBeUndefined();
    expect(fenceOf()).toBe('h_narrow');
    expect(gateModelChoices(st().settings.customModels, gateOf()).map((m) => m.id)).toEqual([OTHER.id]);
  });

  it('obrisana ograda se ne vraća: ni zapamćena, ni ograda tipa kapije', () => {
    const id = st().addElement({ kind: 'gate', gateType: 'sliding', modelId: 'picket_narrow' as FenceModelId })!;
    st().applyGateModel(id, TYPE.id);
    setHiddenModels(['picket_narrow']);
    st().setActiveModel('h_narrow' as FenceModelId);
    expect(fenceOf()).not.toBe('picket_narrow');
    st().applyBasicGate(id);
    expect(gateOf().infillModelId).toBe('h_narrow');
  });
});
