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

/** Četiri držača i jedna tabla između svakog para stubova. Staklo ulazi u čeljusti, a telo držača naleže na bočnu stranu stuba. */
export function glassRailingLayout(model: CustomModel, spec: GlassRailingSpec, materials: Material[]): { parts: CustomPart[]; errors: string[] } {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const clamp = byId.get(spec.clampMaterialId);
  const shape = clamp && materialShape(clamp);
  if (!clamp || shape?.type !== 'piece' || !glassClampMaterials(materials).some((m) => m.id === clamp.id)) {
    return { parts: [], errors: ['Izaberite držač stakla iz cenovnika.'] };
  }
  const glass = spec.glassMaterialId && byId.get(spec.glassMaterialId);
  const sheet = glass ? materialShape(glass) : null;
  if (spec.glassMaterialId && (sheet?.type !== 'sheet' || !sheet.glass)) return { parts: [], errors: ['Izaberite staklo iz cenovnika.'] };
  const posts = model.parts.flatMap((p) => {
    const m = byId.get(p.materialId); const sh = m && materialShape(m);
    if (p.hw || p.glazing || sh?.type !== 'linear' || sh.group !== 't_stubovi' || Math.abs(Math.cos(p.angleDeg * Math.PI / 180)) > 0.02) return [];
    const box = partBounds(p, sh);
    if (box.x1 - box.x0 < 25) return [];
    return [{ p, box }];
  }).sort((a, b) => a.box.x0 - b.box.x0);
  if (posts.length < 2) return { parts: [], errors: ['Nacrtajte najmanje dva stuba. Držači i staklo se postavljaju između susednih stubova.'] };

  const cb = solidsBounds(shape.solids);
  const clampWidth = cb.x1 - cb.x0; const clampHeight = cb.y1 - cb.y0;
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
    if (glass) parts.push({ id: `glazing~pane~${key}`, materialId: glass.id, x: mm(x0 + clampWidth / 2), y: mm(bottom), z,
      lengthMm: mm(x1 - x0 - clampWidth), heightMm: mm(top - bottom), angleDeg: 0, rot: 0, glazing: { kind: 'pane', ...tag } });
  }
  return { parts, errors };
}

/** Menja samo delove koje pravi ova opcija; ponovni poziv ne dodaje kopije. */
export function syncGlassRailing(model: CustomModel, materials: Material[]): CustomModel {
  const own = model.parts.filter((p) => !p.glazing);
  const old = model.parts.filter((p) => p.glazing);
  const next = model.kind === 'terrace' && model.glassRailing ? glassRailingLayout(model, model.glassRailing, materials).parts : [];
  if (JSON.stringify(old) === JSON.stringify(next)) return model;
  return { ...model, parts: [...own, ...next] };
}
