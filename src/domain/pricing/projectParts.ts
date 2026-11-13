import { AUTOMATION_LABELS, FENCE_MODELS, HINGE_LABELS, LOCK_LABELS, POST_LABELS, projectModelId } from '../models/catalog';
import { isCustomModel } from '../models/customRegistry';
import { materialShape } from '../models/materialShape';
import { RAM_TUBE_MATERIAL, specFor, type ModelSpecs } from '../models/spec';
import { isTubesModel } from '../models/tubes';
import type { FenceParams, LayoutItem, Material, Project } from '../models/types';
import { LIMITS } from '../validation/limits';
import { buildBom, HINGE_MATERIAL, LOCK_MATERIAL, MOTOR_MATERIAL, POST_MATERIAL, type BomGroup } from './calc';

/**
 * Delovi ograde koji se mogu zameniti u projektu: svaki deo koji ulazi u sastavnicu (profili ispune, bočne strane, ramovi,
 * prečke, stubovi, nosači, vijci, okov kapije) ima „mesto“ u specifikaciji modela, a za projekat se bira koji materijal iz
 * cenovnika ide na to mesto. Zamena važi za kalkulaciju i krojnu listu; kod profila koji određuju izgled (letvica, bočni U profil,
 * ram) menjaju se i mere ograde (visina letvice, širina U profila, širina rama), pa se crtež i broj letvica usklađuju.
 */

export type PartRole = 'main' | 'rail' | 'frame' | 'ram' | null;

export interface ProjectPart {
  /** mesto u specifikaciji (ID materijala iz specifikacije modela) */
  id: string;
  label: string;
  group: BomGroup;
  /** profil koji se seče po dužini (bira se među profilima) ili komadni deo */
  linear: boolean;
  role: PartRole;
  /** materijal koji je trenutno na tom mestu (izabrani ili onaj iz specifikacije) */
  currentId: string;
  replaced: boolean;
}

const FIXED_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(POST_MATERIAL).map(([k, id]) => [id, POST_LABELS[k as keyof typeof POST_MATERIAL]])),
  ...Object.fromEntries(Object.entries(HINGE_MATERIAL).map(([k, id]) => [id, HINGE_LABELS[k as keyof typeof HINGE_MATERIAL]])),
  ...Object.fromEntries(Object.entries(LOCK_MATERIAL).map(([k, id]) => [id, LOCK_LABELS[k as keyof typeof LOCK_MATERIAL]])),
  ...Object.fromEntries(Object.entries(MOTOR_MATERIAL).map(([k, id]) => [id, AUTOMATION_LABELS[k as keyof typeof MOTOR_MATERIAL]])),
  mat_wheel: 'Točkići klizne kapije', mat_anchor: 'Sidrenje stuba', mat_pipe_bend: 'Savijanje cevi',
};

/** Svi delovi koji ulaze u sastavnicu projekta, po mestu u specifikaciji. Ručno nacrtani modeli se menjaju u svom crtežu. */
export function projectParts(project: Project, materials: Material[], specs?: ModelSpecs): ProjectPart[] {
  const modelId = projectModelId(project.items);
  if (!modelId) return [];
  const def = FENCE_MODELS[modelId];
  const spec = specFor(modelId, specs).filter((p) => p.enabled);
  const names = new Map<string, { names: string[]; linear: boolean }>();
  for (const p of spec) {
    const cur = names.get(p.materialId) ?? { names: [], linear: false };
    cur.names.push(p.name);
    if (p.lengthMm && p.lengthMm.trim() !== '') cur.linear = true;
    names.set(p.materialId, cur);
  }
  // sastavnica bez zamena daje mesta iz specifikacije (i ona koja dolaze iz stubova, okova kapije i posebnih modela)
  const lines = buildBom({ ...project, partMaterials: undefined }, materials, specs).filter((l) => l.materialId !== 'extra');
  const seen = new Set<string>();
  const out: ProjectPart[] = [];
  for (const l of lines) {
    if (seen.has(l.materialId)) continue;
    seen.add(l.materialId);
    const n = names.get(l.materialId);
    const known = materials.find((m) => m.id === l.materialId);
    const role: PartRole = l.materialId === def.materialId ? 'main' : l.materialId === def.railMaterialId ? 'rail' : l.materialId === RAM_TUBE_MATERIAL ? 'ram' : l.materialId === 'mat_alu_frame' ? 'frame' : null;
    const currentId = project.partMaterials?.[l.materialId] ?? l.materialId;
    out.push({
      id: l.materialId,
      label: n ? [...new Set(n.names)].join(' / ') : FIXED_LABELS[l.materialId] ?? known?.name ?? l.name,
      group: l.group,
      linear: n ? n.linear : known ? materialShape(known).type === 'linear' : l.group === 'Profili ispune' || l.group === 'Ramovi',
      role,
      currentId,
      replaced: currentId !== l.materialId,
    });
  }
  return out;
}

export const partsEditable = (project: Project): boolean => { const m = projectModelId(project.items); return !!m && !isCustomModel(m); };

const clamp = (v: number, r: { min: number; max: number }): number => Math.min(r.max, Math.max(r.min, v));

/** Mere ograde koje slede iz izabranog profila za dato mesto (letvica, bočni U profil, ram). */
export function paramsForPart(modelId: string, role: PartRole, material: Material, params: FenceParams): Partial<FenceParams> {
  const shape = materialShape(material);
  if (shape.type !== 'linear' || !role) return {};
  const tubes = isTubesModel(modelId as never);
  const style = FENCE_MODELS[modelId as never]?.style;
  const { w, h } = shape.section;
  if (role === 'main') {
    const bar = clamp(Math.round(w * 10) / 10, style === 'rods' ? { min: 8, max: 60 } : LIMITS.barSize);
    return tubes ? { barSizeMm: bar, hn: { ...(params.hn ?? {}), tubeDepthMm: h, ...(shape.wall ? { tubeWallMm: shape.wall } : {}) } } : { barSizeMm: bar };
  }
  if (role === 'rail' && tubes) {
    // U profil: spreda se vidi krilce (B), dubina panela je širina U (A); kvadratna cev kao vođica: njena širina
    return shape.u
      ? { frameMm: clamp(shape.u.b, { min: 5, max: 200 }), hn: { ...(params.hn ?? {}), uDepthMm: shape.u.a, uWallMm: shape.u.c } }
      : { frameMm: clamp(w, { min: 5, max: 200 }) };
  }
  if (role === 'ram') return { ramMm: clamp(Math.round(w * 10) / 10, { min: 10, max: 200 }) };
  if (role === 'frame' && style !== 'tubes' && style !== 'tarabica' && style !== 'rods' && style !== 'custom') return { frameMm: clamp(Math.round(w), LIMITS.frame) };
  return {};
}

/** Zamena materijala na mestu `partId` u celom projektu (null vraća materijal iz specifikacije); mere ograde se usklađuju. */
export function setPartMaterial(project: Project, part: Pick<ProjectPart, 'id' | 'role'>, material: Material | null): Project {
  const next: Record<string, string> = { ...(project.partMaterials ?? {}) };
  if (material && material.id !== part.id) next[part.id] = material.id; else delete next[part.id];
  const modelId = projectModelId(project.items);
  const items: LayoutItem[] = material && modelId
    ? project.items.map((it) => {
      if (it.kind === 'opening') return it;
      const patch = paramsForPart(modelId, part.role, material, it.params);
      return Object.keys(patch).length ? ({ ...it, params: { ...it.params, ...patch } } as LayoutItem) : it;
    })
    : project.items;
  return { ...project, items, partMaterials: Object.keys(next).length ? next : undefined, updatedAt: new Date().toISOString() };
}

/** Ram na svim poljima i kapijama projekta (model sa horizontalnim kvadratnim cevima). */
export function setRam(project: Project, ram: 'u' | 'tube' | undefined): Project {
  const items = project.items.map((it) => {
    const model = it.kind === 'fence' ? it.modelId : it.kind === 'gate' ? it.infillModelId : null;
    return model && isTubesModel(model) && it.kind !== 'opening' ? ({ ...it, params: { ...it.params, ram } } as LayoutItem) : it;
  });
  return { ...project, items, updatedAt: new Date().toISOString() };
}
