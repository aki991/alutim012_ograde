import { describe, expect, it } from 'vitest';
import { SEED_SETTINGS } from '../data/seed';
import { newCustomModel } from '../domain/models/custom';
import { DEFAULT_MODEL_ID } from '../domain/models/catalog';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import type { FenceModelId } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

describe('sinhronizacija: modeli iz baze', () => {
  const model = { ...newCustomModel('cm_sync1'), name: 'Nacrtan', parts: [] };

  it('projekat koji koristi nacrtan model zadržava ga kad model stiže u istoj razmeni', () => {
    registerCustomModels([], []);
    const p = createProject('P', [createFence({ modelId: DEFAULT_MODEL_ID })]);
    const remote = { ...p, items: p.items.map((it) => (it.kind === 'fence' ? { ...it, modelId: 'cm_sync1' as FenceModelId } : it)) };
    useAppStore.setState({ projects: [], settings: { ...SEED_SETTINGS, customModels: [] } });
    useAppStore.getState().applyRemote({ projects: { upsert: [remote], remove: [] }, settings: { ...SEED_SETTINGS, customModels: [model] } });
    const it = useAppStore.getState().projects[0].items[0];
    expect(it.kind === 'fence' && it.modelId).toBe('cm_sync1');
  });

  it('model obrisan u bazi: projekat i izabrani model prelaze na podrazumevani, bez greške', () => {
    registerCustomModels([model], []);
    const p = createProject('P', [createFence({ modelId: DEFAULT_MODEL_ID })]);
    const local = { ...p, items: p.items.map((it) => (it.kind === 'fence' ? { ...it, modelId: 'cm_sync1' as FenceModelId } : it)) };
    useAppStore.setState((s) => ({ projects: [local], settings: { ...SEED_SETTINGS, customModels: [model] }, editor: { ...s.editor, activeModelId: 'cm_sync1' as FenceModelId } }));
    expect(() => useAppStore.getState().applyRemote({ settings: { ...SEED_SETTINGS, customModels: [] } })).not.toThrow();
    const it = useAppStore.getState().projects[0].items[0];
    expect(it.kind === 'fence' && it.modelId).toBe(DEFAULT_MODEL_ID);
    expect(useAppStore.getState().editor.activeModelId).toBe(DEFAULT_MODEL_ID);
  });
});
