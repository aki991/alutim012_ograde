import { isFramePart, modelWithFrame } from './frame';
import { materialShape, sectionFace } from './materialShape';
import { partBounds, type CustomModel } from './custom';
import type { Material } from './types';

/**
 * Ram kapije u projektu. Kapija od ručno nacrtanog modela bez rama dobija ram od kvadratne cevi: u katalogu se vodi kao izvedeni model
 * (`derivedFrom` + `frameMaterialId`), koji se pri učitavanju sastavlja iz osnovnog modela, pa izmena osnovnog crteža važi i za kapiju.
 */
export const FRAMED_SEP = '~gf~';
export const framedModelId = (baseId: string, materialId: string, rot?: 0 | 90): string => `${baseId}${FRAMED_SEP}${materialId}${rot === undefined ? '' : `~r${rot}`}`;

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

/**
 * Crtež sa ramom od izabrane cevi (rez 45°) i zadatim okretanjem preseka (koja strana je čelo; bez njega po dubini modela). Crtež koji
 * već ima ram (rez 45°) dobija novu cev umesto postojeće: ispuna ostaje ista, a okov na ramu i izvan njega prati ivicu rama.
 * Ram nacrtan bez reza 45° se ne menja.
 */
export function framedGateModel(base: CustomModel, mat: Material, materials: Material[], rot?: 0 | 90): CustomModel | { error: string } {
  const r = rot ?? frameRotFor(mat, modelDepthMm(base.parts.some(isFramePart) ? { parts: base.parts.filter((p) => !isFramePart(p)) } : base, materials));
  if (base.parts.some(isFramePart)) return reframedModel(base, mat, materials, r);
  if (hasRealFrame(base, materials)) return base;
  return modelWithFrame(base, mat, materials, r);
}

/** materijal i okretanje postojećeg rama crteža (rez 45°); null kad ga nema */
export function drawnFrameOf(m: Pick<CustomModel, 'parts'>): { materialId: string; rot: 0 | 90 } | null {
  const f = m.parts.find(isFramePart);
  return f ? { materialId: f.materialId, rot: (((f.rot % 180) + 180) % 180) === 90 ? 90 : 0 } : null;
}

function reframedModel(base: CustomModel, mat: Material, materials: Material[], rot: 0 | 90): CustomModel | { error: string } {
  const W = base.widthMm; const H = base.heightMm;
  const shapeOf = (id: string) => materialShape(materials.find((m) => m.id === id) ?? mat);
  const frame = base.parts.filter(isFramePart).map((p) => ({ p, b: partBounds(p, shapeOf(p.materialId)), v: Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.99 }));
  const L = frame.filter((f) => f.v && f.b.x0 < W / 2); const R = frame.filter((f) => f.v && f.b.x1 > W / 2);
  const B = frame.filter((f) => !f.v && f.b.y0 < H / 2); const T = frame.filter((f) => !f.v && f.b.y1 > H / 2);
  const inner = { x0: L.length ? Math.max(...L.map((f) => f.b.x1)) : 0, x1: R.length ? Math.min(...R.map((f) => f.b.x0)) : W, y0: B.length ? Math.max(...B.map((f) => f.b.y1)) : 0, y1: T.length ? Math.min(...T.map((f) => f.b.y0)) : H };
  const rest = base.parts.filter((p) => !isFramePart(p));
  const out = modelWithFrame({ ...base, parts: rest }, mat, materials, rot, { left: L.length > 0, right: R.length > 0, top: T.length > 0, bottom: B.length > 0 }, inner);
  if ('error' in out) return out;
  // ispuna je pomerena za razliku debljine rama; deo na ramu ili izvan njega (okov) prati svoju ivicu rama
  const s = materialShape(mat); const face = s.type === 'linear' ? sectionFace(s.section, rot).face : 0;
  const nl = L.length ? face : 0; const nb = B.length ? face : 0;
  const W2 = out.widthMm; const H2 = out.heightMm;
  const map = (x: number, lo: number, hi: number, n0: number, size: number, size2: number): number => {
    if (x < 0) return x;
    if (x < lo) return lo > 0 ? (x / lo) * n0 : x;
    if (x <= hi) return x - lo + n0;
    if (x <= size) { const band = size - hi; const nb2 = size2 - (hi - lo + n0); return hi - lo + n0 + (band > 0 ? ((x - hi) / band) * nb2 : 0); }
    return x + size2 - size;
  };
  const moved = new Map(rest.map((p) => {
    const b = partBounds(p, shapeOf(p.materialId));
    const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2;
    const dx = map(cx, inner.x0, inner.x1, nl, W, W2) - cx - (nl - inner.x0);
    const dy = map(cy, inner.y0, inner.y1, nb, H, H2) - cy - (nb - inner.y0);
    return [p.id, [dx, dy] as const];
  }));
  return { ...out, parts: out.parts.map((p) => { const d = moved.get(p.id); return d && (Math.abs(d[0]) > 1e-6 || Math.abs(d[1]) > 1e-6) ? { ...p, x: p.x + d[0], y: p.y + d[1] } : p; }) };
}

