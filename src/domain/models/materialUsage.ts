import { allFenceModels } from './customRegistry';
import { customBom, type CustomModel } from './custom';
import { isTerraceModel } from './catalog';
import { isTerraceMaterial } from './materialShape';
import { specFor } from './spec';
import { buildBom } from '../pricing/calc';
import { createFence, createProject } from './factories';
import type { AppSettings, FenceModelId, Material, Project } from './types';

/** Materijali crteža, uključujući automatske zavrtnje i izabrani okov. */
export function modelMaterialIds(model: CustomModel, materials: Material[]): Set<string> {
  const ids = new Set(customBom(model, materials).map((line) => line.materialId));
  const references = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (/materialId$/i.test(key) && typeof v === 'string' && v) ids.add(v);
      else if (key === 'hwPick' && v) Object.values(v).forEach((id) => { if (typeof id === 'string' && id) ids.add(id); });
      else if (typeof v === 'object') references(v);
    }
  };
  references(model);
  return ids;
}

/** Stvarna upotreba u dostupnim modelima, sastavnicama, šablonima stubova i sačuvanim projektima. */
export function collectMaterialUsage(materials: Material[], settings: AppSettings, projects: Project[]) {
  const used = new Set<string>();
  const yard = new Set<string>();
  const terrace = new Set<string>();
  const add = (id: string, isTerrace: boolean) => { if (id) { used.add(id); (isTerrace ? terrace : yard).add(id); } };
  const addSpec = (id: string, isTerrace: boolean) => {
    for (const part of specFor(id as FenceModelId, settings.modelSpecs)) if (part.enabled) add(part.materialId, isTerrace);
  };
  for (const model of allFenceModels()) {
    addSpec(model.id, Boolean(model.terrace));
    // Detaljne sastavnice terasnih modela računaju stubove i okov iz geometrije,
    // pa ti materijali nisu svi navedeni u specifikaciji po jednom polju.
    if (model.style !== 'custom') {
      const sample = createProject('Materijali modela', [createFence({ modelId: model.id })]);
      for (const line of buildBom(sample, materials, settings.modelSpecs)) if (line.geometricQty > 0) add(line.materialId, Boolean(model.terrace));
    }
  }
  for (const model of settings.customModels ?? []) {
    const isTerrace = model.kind === 'terrace';
    for (const id of modelMaterialIds(model, materials)) add(id, isTerrace);
    addSpec(model.id, isTerrace);
    if (settings.terraceModelIds?.includes(model.id)) {
      for (const id of modelMaterialIds(model, materials)) add(id, true);
      addSpec(model.id, true);
    }
  }
  for (const template of settings.postTemplates ?? []) {
    for (const id of [template.materialId, template.capTopMaterialId, template.capBottomMaterialId]) if (id) add(id, false);
  }
  const byId = new Map(materials.map((m) => [m.id, m]));
  for (const project of projects) {
    const terraceOnly = project.items.length > 0 && project.items.every((item) => item.kind === 'fence' && isTerraceModel(item.modelId));
    const yardOnly = project.items.every((item) => item.kind !== 'fence' || !isTerraceModel(item.modelId));
    for (const line of buildBom(project, materials, settings.modelSpecs)) {
      if (!line.materialId || line.geometricQty <= 0) continue;
      add(line.materialId, terraceOnly || (!yardOnly && isTerraceMaterial(byId.get(line.materialId) ?? {})));
    }
  }
  return { used, yard, terrace };
}
