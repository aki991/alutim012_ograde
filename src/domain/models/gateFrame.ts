import { isFramePart, modelWithFrame } from './frame';
import { materialShape, sectionFace } from './materialShape';
import type { CustomModel } from './custom';
import type { Material } from './types';

/**
 * Ram kapije u projektu. Kapija od ručno nacrtanog modela bez rama dobija ram od kvadratne cevi: u katalogu se vodi kao izvedeni model
 * (`derivedFrom` + `frameMaterialId`), koji se pri učitavanju sastavlja iz osnovnog modela, pa izmena osnovnog crteža važi i za kapiju.
 */
export const FRAMED_SEP = '~gf~';
export const framedModelId = (baseId: string, materialId: string): string => `${baseId}${FRAMED_SEP}${materialId}`;

/** Ima li crtež ram: delovi sa rezom 45° ili ramovski profil. */
export function hasRealFrame(m: Pick<CustomModel, 'parts'> & Partial<Pick<CustomModel, 'widthMm' | 'heightMm'>>, materials: Material[] = []): boolean {
  if (m.parts.some((p) => isFramePart(p) || p.materialId === 'mat_alu_frame')) return true;
  // ram bez reza 45°: vodoravni profili celom širinom uz gornju i donju ivicu i uspravni celom visinom uz obe bočne ivice
  const W = m.widthMm ?? 0; const H = m.heightMm ?? 0;
  if (!W || !H) return false;
  const ortho = (p: { angleDeg: number }, a: number): boolean => Math.abs(((p.angleDeg % 180) + 180) % 180 - a) < 0.5;
  // bočne U vođice i prečke koje ulaze u njih nisu ram
  const isU = (id: string): boolean => { const mt = materials.find((x) => x.id === id); const s = mt ? materialShape(mt) : null; return !!s && s.type === 'linear' && !!s.u; };
  const hs = m.parts.filter((p) => ortho(p, 0) && p.lengthMm >= W * 0.9 && !p.guides?.length && !isU(p.materialId));
  const vs = m.parts.filter((p) => ortho(p, 90) && p.lengthMm >= H * 0.9 && !isU(p.materialId));
  return hs.some((p) => p.y < H * 0.06) && hs.some((p) => p.y > H * 0.94) && vs.some((p) => p.x < W * 0.06) && vs.some((p) => p.x > W * 0.94);
}

/** da li kapija od ovog ručno nacrtanog modela ograde dobija ram (izbor u crtanju; bez izbora ima ram, osim tarabica) */
export const wantsGateFrame = (m: Pick<CustomModel, 'gateFrame' | 'name'>): boolean => m.gateFrame ?? !/tarabic/i.test(m.name);

const isTube = (m: Material): boolean => { const s = materialShape(m); return s.type === 'linear' && s.group === 'kv' && !s.u && !/stub/i.test(m.name); };

/** cevi koje nudi izbor rama kapije */
export const frameCandidates = (materials: Material[]): Material[] => materials.filter(isTube);

/**
 * Dubina modela (mm): najveća dubina uspravnog U profila (ili, bez njega, bilo kog profila) kakav je okrenut na crtežu.
 * Kvadratna cev rama prati tu meru.
 */
export function modelDepthMm(model: Pick<CustomModel, 'parts'>, materials: Material[]): number {
  let u = 0; let any = 0;
  for (const p of model.parts) {
    const m = materials.find((x) => x.id === p.materialId);
    const s = m ? materialShape(m) : null;
    if (!s || s.type !== 'linear') continue;
    const d = sectionFace(s.section, p.rot).depth;
    any = Math.max(any, d);
    if (s.u) u = Math.max(u, Math.max(s.section.w, s.section.h, d));
  }
  return u || any;
}

/** okretanje preseka rama pri kome je vidljiva širina najbliža dubini modela */
export function frameRotFor(mat: Material, depth: number): 0 | 90 {
  const s = materialShape(mat);
  if (s.type !== 'linear') return 0;
  return Math.abs(sectionFace(s.section, 90).face - depth) + 1e-6 < Math.abs(sectionFace(s.section, 0).face - depth) ? 90 : 0;
}

/** cev za ram po dubini modela: najbliža mera, kvadratna ima prednost */
export function suggestFrameMaterial(model: Pick<CustomModel, 'parts'>, materials: Material[]): Material | null {
  const depth = modelDepthMm(model, materials);
  let best: { m: Material; score: number } | null = null;
  for (const m of frameCandidates(materials)) {
    const s = materialShape(m);
    if (s.type !== 'linear') continue;
    const a = s.section.w; const b = s.section.h;
    const score = Math.min(Math.abs(a - depth), Math.abs(b - depth)) * 4 + Math.abs(a - b) + (Math.min(a, b) < 20 ? 100 : 0);
    if (!best || score < best.score) best = { m, score };
  }
  return best?.m ?? null;
}

/** crtež sa ramom od izabrane cevi oko celog crteža (rez 45°); ram već nacrtan se ne dodaje drugi put */
export function framedGateModel(base: CustomModel, mat: Material, materials: Material[]): CustomModel | { error: string } {
  if (hasRealFrame(base, materials)) return base;
  return modelWithFrame(base, mat, materials, frameRotFor(mat, modelDepthMm(base, materials)));
}

