import { computeInfill } from '../geometry/infill';
import { FENCE_MODELS } from './catalog';
import { applyGuides, attachToGuides } from './guides';
import { materialShape, sectionFace } from './materialShape';
import { clampToFrame, type CustomModel, type CustomPart } from './custom';
import type { FenceModelId, Material } from './types';

/**
 * Dorada modela iz kataloga: crtež modela (letvice, nosači, ram, U vođice, staklo) pretvara se u delove koje crtanje modela
 * zna da menja. Dobija se polje zadate veličine (svetli otvor između stubova); stubovi nisu deo modela, kao ni kod ručno
 * nacrtanih modela. Sitan okov (vijci, nosači, čepovi) nije na crtežu modela iz kataloga, pa se dodaje crtanjem ako treba.
 */

export const DORADA_WIDTH_MM = 2000;
export const DORADA_HEIGHT_MM = 1500;

const FRAME_MATERIAL = 'mat_alu_frame';
const GLASS_MATERIAL = 'mat_glass';

export function builtinToCustom(modelId: FenceModelId, materials: Material[], id: string, widthMm = DORADA_WIDTH_MM, heightMm = DORADA_HEIGHT_MM): CustomModel {
  const def = FENCE_MODELS[modelId];
  const W = widthMm; const H = heightMm;
  const d = def.defaults;
  const byId = new Map(materials.map((m) => [m.id, m]));
  // ram se crta stvarnim profilom iz cenovnika: ispuna počinje tamo gde se ram završava (npr. ram 40 × 40 umesto 30 mm sa slike)
  const frameFace = (materialId: string, want: number): number => {
    const m = byId.get(materialId);
    const s = m ? materialShape(m) : null;
    if (!s || s.type !== 'linear') return want;
    const a = sectionFace(s.section, 0).face; const b = sectionFace(s.section, 90).face;
    return Math.abs(a - want) <= Math.abs(b - want) ? a : b;
  };
  const tubesStyle = def.style === 'tubes';
  const f0 = computeInfill(modelId, W, H, d.frameMm, d.barSizeMm, d.gapMm, d.barCount, d.liftMm, undefined, d.archMm).frame;
  const frameMm = f0 > 0 ? frameFace(tubesStyle ? def.railMaterialId ?? 'mat_u_20x20' : FRAME_MATERIAL, f0) : d.frameMm;
  const geo = computeInfill(modelId, W, H, frameMm, d.barSizeMm, d.gapMm, d.barCount, d.liftMm, undefined, d.archMm);
  const parts: CustomPart[] = [];
  let n = 0;
  const pid = () => `${id}_p${++n}`;

  /** okretanje preseka (0 ili 90) pri kome je vidljiva visina preseka najbliža meri sa crteža */
  const rotFor = (materialId: string, visible: number): number => {
    const m = byId.get(materialId);
    const s = m ? materialShape(m) : null;
    if (!s || s.type !== 'linear') return 0;
    const f0 = sectionFace(s.section, 0).face; const f90 = sectionFace(s.section, 90).face;
    return Math.abs(f90 - visible) < Math.abs(f0 - visible) ? 90 : 0;
  };
  /** vodoravni profil: osa na sredini trake sa crteža (y nagore od tla) */
  const horizontal = (materialId: string, x: number, yTop: number, len: number, h: number, extra: Partial<CustomPart> = {}) =>
    parts.push({ id: pid(), materialId, x, y: H - (yTop + h / 2), lengthMm: len, angleDeg: 0, rot: rotFor(materialId, h), z: 0, ...extra });
  /** uspravan profil: osa na sredini, od donjeg kraja naviše */
  const vertical = (materialId: string, xLeft: number, yTop: number, w: number, len: number, extra: Partial<CustomPart> = {}) =>
    parts.push({ id: pid(), materialId, x: xLeft + w / 2, y: H - (yTop + len), lengthMm: len, angleDeg: 90, rot: rotFor(materialId, w), z: 0, ...extra });

  const f = geo.frame;
  const tubes = tubesStyle;
  const guides: string[] = [];
  if (f > 0 && tubes) {
    // cevi u U profilima: dve bočne U vođice cele visine
    const u = def.railMaterialId ?? 'mat_u_20x20';
    vertical(u, 0, 0, f, H); guides.push(parts[parts.length - 1].id);
    vertical(u, W - f, 0, f, H); guides.push(parts[parts.length - 1].id);
  } else if (f > 0) {
    // ram oko ispune: uspravni delovi cele visine, vodoravni između njih
    vertical(FRAME_MATERIAL, 0, 0, f, H);
    vertical(FRAME_MATERIAL, W - f, 0, f, H);
    horizontal(FRAME_MATERIAL, f, 0, W - 2 * f, f);
    horizontal(FRAME_MATERIAL, f, H - f, W - 2 * f, f);
  }

  const materialOf = (tone: 'main' | 'rail' | 'accent'): string =>
    tone === 'main' ? def.materialId : tone === 'rail' ? def.railMaterialId ?? FRAME_MATERIAL : def.accentMaterialId ?? 'mat_inox_traka';
  for (const b of geo.bars) {
    const mat = materialOf(b.tone);
    if (b.w >= b.h) horizontal(mat, b.x, b.y, b.w, b.h);
    else vertical(mat, b.x, b.y, b.w, b.h);
  }
  if (geo.glass) parts.push({ id: pid(), materialId: GLASS_MATERIAL, x: geo.glass.x, y: H - (geo.glass.y + geo.glass.h), lengthMm: geo.glass.w, heightMm: geo.glass.h, angleDeg: 0, rot: 0, z: 0 });

  let model: CustomModel = {
    id, name: `${def.name} — dorada`, kind: 'fence', widthMm: W, heightMm: H, color: def.defaultColor, parts,
    updatedAt: new Date().toISOString(), baseModelId: modelId,
  };
  // cevi ulaze u U vođice: svaka vodoravna cev se uklapa u njih (dužina do dna kanala, nagib i dubina kao kod crtanja)
  if (guides.length === 2) {
    for (const p of parts.filter((x) => x.angleDeg === 0 && x.materialId === def.materialId)) {
      const r = attachToGuides(model, p.id, materials);
      if (!('error' in r)) model = r.model;
    }
    model = applyGuides(model, materials);
  }
  // profil iz cenovnika može biti viši od letvice sa slike (npr. panel-profil 250 mm za letvicu 180 mm): sve ostaje u okviru
  return clampToFrame(model, (p) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; });
}
