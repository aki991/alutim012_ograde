import { partBounds, type CustomModel, type CustomPart } from './custom';
import type { SlatOverride } from './gateRefill';
import { materialShape, sectionFace, type MatShape } from './materialShape';
import { hGuideInfo } from './guides';
import { hwRoleOf, layoutPosts, postSpec, terracePostSlots } from './terraceHardware';
import { capsOver, orphanCaps } from './vbars';
import type { Material } from './types';

type ResizeInfill = (model: CustomModel, width: number, height: number, over?: SlatOverride) => CustomModel;

function isPicket(p: CustomPart, shape: MatShape): shape is Extract<MatShape, { type: 'linear' }> {
  return !p.hw && Math.abs(Math.cos(p.angleDeg * Math.PI / 180)) < 0.02 && shape.type === 'linear' && !shape.u && hwRoleOf(p, shape) !== 'post';
}

/** Uklapanje važi i za starije crteže bez veze `guides`, kada kraj već leži u kanalu. */
function picketReceivers(model: CustomModel, materials: Material[]) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const guides = model.parts.flatMap((part) => {
    const mat = byId.get(part.materialId); const info = mat && hGuideInfo(part, materialShape(mat));
    return info ? [{ part, info }] : [];
  });
  return (p: CustomPart, shape: Extract<MatShape, { type: 'linear' }>) => {
    const b = partBounds(p, shape); const depth = sectionFace(shape.section, p.rot + (p.tiltDeg ?? 0));
    const up = Math.sin(p.angleDeg * Math.PI / 180) > 0;
    const bottom = up ? p.y : p.y - p.lengthMm; const top = bottom + p.lengthMm;
    const at = (dir: 1 | -1, end: number) => guides.find(({ part, info: g }) => {
      if (g.dirY !== dir || b.x0 < g.x0 - 0.1 || b.x1 > g.x1 + 0.1 || p.z + depth.v0 < g.zc - g.half - 0.1 || p.z + depth.v1 > g.zc + g.half + 0.1) return false;
      return p.guides?.includes(part.id) || (end >= Math.min(g.backY, g.mouthY) - 0.1 && end <= Math.max(g.backY, g.mouthY) + 0.1);
    });
    return { bottom: at(1, bottom), top: at(-1, top) };
  };
}

/** Zazor iznad gazišta ima smisla samo za tarabice čiji donji kraj ne ulazi u profil. */
export function hasFreeStairPickets(model: CustomModel, materials: Material[]): boolean {
  const byId = new Map(materials.map((m) => [m.id, m])); const receivers = picketReceivers(model, materials);
  return model.parts.some((p) => {
    const mat = byId.get(p.materialId); const shape = mat && materialShape(mat);
    return !!shape && isPicket(p, shape) && !receivers(p, shape).bottom;
  });
}

export function sharedInfillSource(model: CustomModel, materials: Material[]): CustomModel {
  const byId = new Map(materials.map((m) => [m.id, m]));
  return { ...model, kind: 'fence', terraceSourceId: undefined, parts: model.parts.filter((p) => {
    const mat = byId.get(p.materialId);
    return !p.hw && (!mat || hwRoleOf(p, materialShape(mat)) !== 'post');
  }) };
}

/** Svetli otvori, uključujući deo do susednog polja kada krajnji stub stoji na gazištu. */
export function sharedBaySpans(model: CustomModel, width: number, materials: Material[], over?: SlatOverride): [number, number][] {
  const spec = postSpec(model, materials, over);
  if (!spec) return [[0, width]];
  const slots = terracePostSlots(width, spec, materials, over).sort((a, b) => a.x - b.x);
  const xs = slots.map((s) => s.x);
  const edge = over?.endOverhangMm ?? spec.half;
  const from = over?.freeEnds?.[0] && xs.length ? Math.max(0, xs[0] - edge) : 0;
  const to = over?.freeEnds?.[1] && xs.length ? Math.min(width, xs[xs.length - 1] + edge) : width;
  let cursor = from;
  const spans: [number, number][] = [];
  for (const { x, half } of slots) {
    const end = Math.min(to, x - half);
    if (end > cursor + 0.1) spans.push([cursor, end]);
    cursor = Math.max(cursor, x + half);
  }
  if (to > cursor + 0.1) spans.push([cursor, to]);
  return spans;
}

export function scaleSharedTerrace(model: CustomModel, width: number, height: number, materials: Material[], over: SlatOverride | undefined, resize: ResizeInfill): CustomModel {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const source = sharedInfillSource(model, materials);
  const lift = Math.max(0, over?.infillLiftMm ?? 0);
  const posts = layoutPosts({ ...model, widthMm: width, heightMm: height + lift, parts: [] }, model, materials, over?.postXs, over);
  const posted = { ...posts, heightMm: height, parts: posts.parts.map((p) => ({ ...p, y: p.y - lift })) };
  const infill = sharedBaySpans(model, width, materials, over).flatMap(([from, to], i) => {
    const scaled = resize(source, to - from, height, over);
    // Na veoma kratkom kraju nema mesta ni za jednu letvicu: ne ostavljati uzorke van otvora.
    const inside = scaled.parts.filter((p) => {
      const mat = byId.get(p.materialId);
      if (!mat) return true;
      const shape = materialShape(mat); const b = partBounds(p, shape);
      return (shape.type === 'piece' || p.lengthMm > 0) && b.x0 >= -0.1 && b.x1 <= to - from + 0.1;
    });
    const orphan = new Set(orphanCaps({ ...scaled, parts: inside }, materials).map((p) => p.id));
    const id = (s: string) => `${s}~bay${i}`;
    return inside.filter((p) => !orphan.has(p.id)).map((p): CustomPart => ({
      ...p, id: id(p.id), x: p.x + from,
      ...(p.guides ? { guides: p.guides.map(id) as [string, string] } : {}),
      ...(p.nests ? { nests: p.nests.map(id) } : {}),
      ...(p.splitOf ? { splitOf: id(p.splitOf) } : {}),
      ...(p.glazing ? { glazing: { ...p.glazing, left: id(p.glazing.left), right: id(p.glazing.right) } } : {}),
    }));
  });
  return fitPicketsToTreads({ ...posted, parts: [...posted.parts, ...infill] }, materials, over);
}

/** Uklopljena tarabica prati kanal modela; slobodan donji kraj ima ravan rez iznad celog gazišta. */
export function fitPicketsToTreads(model: CustomModel, materials: Material[], over?: SlatOverride): CustomModel {
  const tan = over?.stairTan;
  if (!tan) return model;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const receivers = picketReceivers(model, materials);
  const patches = new Map<string, CustomPart>();
  const omitted = new Set<string>();
  const clearance = Math.max(0, over.treadClearanceMm ?? 30);
  for (const p of model.parts) {
    const mat = byId.get(p.materialId);
    if (!mat) continue;
    const shape = materialShape(mat);
    if (!isPicket(p, shape)) continue;
    const support = receivers(p, shape);
    const b = partBounds(p, shape);
    const levels = (over.stairTreads ?? []).filter((t) => t.toMm > b.x0 + 0.001 && t.fromMm < b.x1 - 0.001).map((t) => t.levelMm);
    if (!support.bottom && !levels.length) continue;
    const caps = capsOver(model, p, materials);
    const up = Math.sin(p.angleDeg * Math.PI / 180) > 0;
    const originalTop = up ? p.y + p.lengthMm : p.y;
    const originalBottom = originalTop - p.lengthMm;
    // Kruti profil prati nagib, pa se ista dubina uvlačenja meri normalno na njegovu osu.
    const inChannel = (end: number, receiver: NonNullable<typeof support.bottom>) => receiver.part.y + (end - receiver.part.y) * Math.hypot(1, tan);
    const top = support.top ? inChannel(originalTop, support.top) : originalTop;
    const bottom = support.bottom ? inChannel(originalBottom, support.bottom) : Math.ceil((Math.max(...levels) + clearance - tan * p.x) * 1000) / 1000;
    const lengthMm = Math.max(0, top - bottom);
    if (lengthMm < 0.001) { omitted.add(p.id); caps.forEach((cap) => omitted.add(cap.id)); continue; }
    const slopeDeg = Math.atan(tan) * 180 / Math.PI;
    const bottomCut = support.bottom ? slopeDeg : 0;
    const topCut = support.top || !caps.length ? slopeDeg : undefined;
    patches.set(p.id, { ...p, y: up ? bottom : top, lengthMm, unshearTan: tan,
      ...(up ? { cutStartDeg: bottomCut, ...(topCut !== undefined ? { cutEndDeg: topCut } : {}) }
        : { cutEndDeg: bottomCut, ...(topCut !== undefined ? { cutStartDeg: topCut } : {}) }),
    });
    caps.forEach((cap) => patches.set(cap.id, { ...cap, unshearTan: tan }));
  }
  // Uža vertikala iza tarabice prati njen donji rez, uključujući tarabicu koja prelazi preko ivice gazišta.
  const pickets = model.parts.flatMap((p) => { const mat = byId.get(p.materialId); const shape = mat && materialShape(mat); return shape && isPicket(p, shape) ? [{ p, b: partBounds(p, shape) }] : []; });
  for (const { p, b } of pickets) {
    const front = pickets.filter((q) => q.p.z > p.z + 0.1 && q.b.x0 <= b.x0 + 0.1 && q.b.x1 >= b.x1 - 0.1 && q.b.x1 - q.b.x0 > b.x1 - b.x0 + 0.1
      && Math.min(q.b.y1, b.y1) - Math.max(q.b.y0, b.y0) > 0.6 * Math.min(q.b.y1 - q.b.y0, b.y1 - b.y0))
      .sort((a, q) => a.p.z - q.p.z)[0];
    if (!front) continue;
    if (omitted.has(front.p.id)) { omitted.add(p.id); continue; }
    const bar = patches.get(front.p.id) ?? front.p; const current = patches.get(p.id) ?? p;
    const up = Math.sin(current.angleDeg * Math.PI / 180) > 0; const barUp = Math.sin(bar.angleDeg * Math.PI / 180) > 0;
    const barBottom = barUp ? bar.y : bar.y - bar.lengthMm;
    const cut = (barUp ? bar.cutStartDeg : bar.cutEndDeg) ?? 0;
    const bottom = barBottom + tan * (bar.x - current.x) + Math.tan(cut * Math.PI / 180) * (current.x - bar.x);
    const top = up ? current.y + current.lengthMm : current.y;
    const oldBottom = top - current.lengthMm;
    if (bottom <= oldBottom + 0.001) continue;
    if (bottom >= top) { omitted.add(p.id); continue; }
    patches.set(p.id, { ...current, y: up ? bottom : top, lengthMm: top - bottom, ...(up ? { cutStartDeg: cut } : { cutEndDeg: cut }) });
  }
  return patches.size || omitted.size ? { ...model, parts: model.parts.filter((p) => !omitted.has(p.id)).map((p) => patches.get(p.id) ?? p) } : model;
}
