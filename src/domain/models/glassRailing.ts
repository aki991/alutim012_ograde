import { partBounds, type CustomModel, type CustomPart, type GlassRailingSpec } from './custom';
import { materialShape, norm, solidsBounds } from './materialShape';
import type { Material } from './types';

const mm = (v: number) => Math.round(v * 1000) / 1000;
const gap = (v: number | undefined, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : fallback;

export function glassClampMaterials(materials: Material[]): Material[] {
  return materials.filter((m) => /stezaljk.*stakla|drzac stakla/.test(norm(m.name)) && materialShape(m).type === 'piece')
    .sort((a, b) => Number(b.sku === 'AK-5205') - Number(a.sku === 'AK-5205') || a.name.localeCompare(b.name, 'sr'));
}

export function railingGlassMaterials(materials: Material[]): Material[] {
  return materials.filter((m) => { const shape = materialShape(m); return shape.type === 'sheet' && shape.glass; })
    .sort((a, b) => Number(b.sku === 'TER-VSG-66') - Number(a.sku === 'TER-VSG-66') || a.name.localeCompare(b.name, 'sr'));
}

export interface GlassEndWidths { start?: number; end?: number }

function glassPosts(model: CustomModel, materials: Material[]) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  return model.parts.flatMap((p) => {
    const m = byId.get(p.materialId); const sh = m && materialShape(m);
    if (p.hw || p.glazing || sh?.type !== 'linear' || sh.group !== 't_stubovi' || Math.abs(Math.cos(p.angleDeg * Math.PI / 180)) > 0.02) return [];
    const box = partBounds(p, sh);
    return box.x1 - box.x0 < 25 ? [] : [{ p, box }];
  }).sort((a, b) => a.box.x0 - b.box.x0);
}

/** Najveća nominalna širina do ivice polja, od staklene čeljusti najbližeg stuba; stvarna kosa mera. */
export function glassEndLimits(model: CustomModel, spec: GlassRailingSpec, materials: Material[], slopeFactor = 1): { start: number; end: number; min: number } {
  const posts = glassPosts(model, materials);
  const clamp = materials.find((m) => m.id === spec.clampMaterialId);
  const shape = clamp && materialShape(clamp);
  if (!posts.length || shape?.type !== 'piece') return { start: 0, end: 0, min: 1 };
  const b = solidsBounds(shape.solids); const half = (b.x1 - b.x0) / 2;
  const factor = Number.isFinite(slopeFactor) ? Math.max(1, slopeFactor) : 1;
  const limit = (width: number) => Math.floor(Math.max(0, width * factor) * 10) / 10;
  return { start: limit(posts[0].box.x0 - half), end: limit(model.widthMm - posts[posts.length - 1].box.x1 - half),
    min: Math.ceil((half * factor + gap(spec.toleranceMm, 0)) * 10) / 10 };
}

/** Četiri držača između stubova, a dodatno krajnje staklo nose dva držača na jednom stubu. */
export function glassRailingLayout(model: CustomModel, spec: GlassRailingSpec, materials: Material[], slopeFactor = 1, ends?: GlassEndWidths): { parts: CustomPart[]; errors: string[] } {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const clamp = byId.get(spec.clampMaterialId);
  const shape = clamp && materialShape(clamp);
  if (!clamp || shape?.type !== 'piece' || !glassClampMaterials(materials).some((m) => m.id === clamp.id)) {
    return { parts: [], errors: ['Izaberite držač stakla iz cenovnika.'] };
  }
  const glass = spec.glassMaterialId && byId.get(spec.glassMaterialId);
  const sheet = glass ? materialShape(glass) : null;
  if (spec.glassMaterialId && (sheet?.type !== 'sheet' || !sheet.glass)) return { parts: [], errors: ['Izaberite staklo iz cenovnika.'] };
  const posts = glassPosts(model, materials);
  if (!posts.length || (posts.length < 2 && !ends?.start && !ends?.end)) return { parts: [], errors: ['Nacrtajte najmanje dva stuba. Držači i staklo se postavljaju između susednih stubova.'] };

  const cb = solidsBounds(shape.solids);
  const clampWidth = cb.x1 - cb.x0; const clampHeight = cb.y1 - cb.y0;
  const tolerance = gap(spec.toleranceMm, 0);
  // Na stepeništu je širina stvarna kosa ivica, a ne njena horizontalna projekcija.
  const factor = Number.isFinite(slopeFactor) ? Math.max(1, slopeFactor) : 1;
  const widthTolerance = tolerance / factor;
  const parts: CustomPart[] = []; const errors: string[] = [];
  for (let i = 0; i < posts.length - 1; i++) {
    const l = posts[i]; const r = posts[i + 1];
    const x0 = l.box.x1; const x1 = r.box.x0;
    const bottom = Math.max(l.box.y0, r.box.y0) + gap(spec.bottomMm, 100);
    const top = Math.min(l.box.y1, r.box.y1) - gap(spec.topMm, 100);
    if (Math.abs(l.p.z - r.p.z) > 0.5) { errors.push(`Polje ${i + 1}: stubovi moraju biti u istoj ravni po dubini.`); continue; }
    if (x1 - x0 < 2 * clampWidth + 10 || top - bottom < 2 * clampHeight + 10) {
      errors.push(`Polje ${i + 1}: nema dovoljno prostora za držače i staklo. Smanjite odstojanja ili povećajte razmak stubova.`); continue;
    }
    const inset = Math.max(clampHeight / 2, Math.min(gap(spec.insetMm, 100), (top - bottom) / 3));
    const z = mm((l.p.z + r.p.z) / 2);
    const tag = { left: l.p.id, right: r.p.id };
    const key = `${l.p.id}~${r.p.id}`;
    for (const [end, x, angleDeg] of [['left', x0 - cb.x0, 0], ['right', x1 + cb.x0, 180]] as const) {
      for (const [level, y] of [['bottom', bottom + inset], ['top', top - inset]] as const) {
        parts.push({ id: `glazing~clamp~${key}~${end}~${level}`, materialId: clamp.id, x: mm(x), y: mm(y), z,
          lengthMm: 0, angleDeg, rot: 0, glazing: { kind: 'clamp', ...tag } });
      }
    }
    if (glass) {
      const width = mm(x1 - x0 - clampWidth - widthTolerance); const height = mm(top - bottom);
      if (width <= 0 || height <= 0) { errors.push(`Polje ${i + 1}: tolerancija je prevelika za dimenzije stakla.`); continue; }
      parts.push({ id: `glazing~pane~${key}`, materialId: glass.id, x: mm(x0 + clampWidth / 2 + widthTolerance / 2), y: mm(bottom), z,
        lengthMm: width, heightMm: height, angleDeg: 0, rot: 0, glazing: { kind: 'pane', ...tag } });
    }
  }
  const limits = glassEndLimits(model, spec, materials, factor);
  for (const side of ['start', 'end'] as const) {
    const requested = gap(ends?.[side], 0);
    if (!requested) continue;
    const post = posts[side === 'start' ? 0 : posts.length - 1];
    const neighbor = posts[side === 'start' ? 1 : posts.length - 2] ?? post;
    const bottom = Math.max(post.box.y0, neighbor.box.y0) + gap(spec.bottomMm, 100);
    const top = Math.min(post.box.y1, neighbor.box.y1) - gap(spec.topMm, 100);
    const nominal = Math.min(requested, limits[side]) / factor;
    const width = mm(nominal - widthTolerance);
    if (width < clampWidth / 2 || top - bottom < 2 * clampHeight + 10) {
      errors.push(`${side === 'start' ? 'Početak' : 'Kraj'} platna: nema dovoljno prostora za krajnje staklo i dva držača.`); continue;
    }
    const inset = Math.max(clampHeight / 2, Math.min(gap(spec.insetMm, 100), (top - bottom) / 3));
    const start = side === 'start'; const z = mm(post.p.z);
    const tag = { left: start ? 'stair-start' : post.p.id, right: start ? post.p.id : 'stair-end', end: side };
    const key = `${side}~${post.p.id}`;
    for (const [level, y] of [['bottom', bottom + inset], ['top', top - inset]] as const) {
      parts.push({ id: `glazing~clamp~end~${key}~${level}`, materialId: clamp.id,
        x: mm(start ? post.box.x0 + cb.x0 : post.box.x1 - cb.x0), y: mm(y), z,
        lengthMm: 0, angleDeg: start ? 180 : 0, rot: 0, glazing: { kind: 'clamp', ...tag } });
    }
    if (glass) parts.push({ id: `glazing~pane~end~${key}`, materialId: glass.id,
      x: mm(start ? post.box.x0 - clampWidth / 2 - nominal + widthTolerance / 2 : post.box.x1 + clampWidth / 2 + widthTolerance / 2), y: mm(bottom), z,
      lengthMm: width, heightMm: mm(top - bottom), angleDeg: 0, rot: 0, glazing: { kind: 'pane', ...tag } });
  }
  return { parts, errors };
}

/** Menja samo delove koje pravi ova opcija; ponovni poziv ne dodaje kopije. */
export function syncGlassRailing(model: CustomModel, materials: Material[], options?: { toleranceMm?: number; slopeFactor?: number; stairTan?: number; ends?: GlassEndWidths }): CustomModel {
  const own = model.parts.filter((p) => !p.glazing);
  const old = model.parts.filter((p) => p.glazing);
  const spec = model.glassRailing && options?.toleranceMm !== undefined ? { ...model.glassRailing, toleranceMm: options.toleranceMm } : model.glassRailing;
  const generated = model.kind === 'terrace' && spec ? glassRailingLayout(model, spec, materials, options?.slopeFactor, options?.ends).parts : [];
  // Držač naleže ravno na stub. Poništava se smicanje oko njegovog sidra, dok tabla i dalje prati nagib.
  const next = options?.stairTan ? generated.map((p) => p.glazing?.kind === 'clamp' ? { ...p, unshearTan: options.stairTan } : p) : generated;
  if (JSON.stringify(old) === JSON.stringify(next)) return model;
  return { ...model, parts: [...own, ...next] };
}
