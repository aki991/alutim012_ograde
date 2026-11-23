import { partBounds, type CustomModel, type CustomPart } from './custom';
import type { SlatOverride } from './gateRefill';
import { materialShape } from './materialShape';
import { hwRoleOf, layoutPosts, postPositions, postSpec } from './terraceHardware';
import { capsOver, orphanCaps } from './vbars';
import type { Material } from './types';

type ResizeInfill = (model: CustomModel, width: number, height: number, over?: SlatOverride) => CustomModel;

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
  const xs = [...(over?.postXs ?? postPositions(width, spec))].sort((a, b) => a - b);
  const edge = over?.endOverhangMm ?? spec.half;
  const from = over?.freeEnds?.[0] && xs.length ? Math.max(0, xs[0] - edge) : 0;
  const to = over?.freeEnds?.[1] && xs.length ? Math.min(width, xs[xs.length - 1] + edge) : width;
  let cursor = from;
  const spans: [number, number][] = [];
  for (const x of xs) {
    const end = Math.min(to, x - spec.half);
    if (end > cursor + 0.1) spans.push([cursor, end]);
    cursor = Math.max(cursor, x + spec.half);
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

/** Tarabica ima ravan donji rez iznad najvišeg gazišta koje dodiruje njen ceo presek; vrh i čep ostaju na istoj visini. */
export function fitPicketsToTreads(model: CustomModel, materials: Material[], over?: SlatOverride): CustomModel {
  const tan = over?.stairTan;
  if (!tan || !over?.stairTreads?.length) return model;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const patches = new Map<string, CustomPart>();
  const omitted = new Set<string>();
  const clearance = Math.max(0, over.treadClearanceMm ?? 30);
  for (const p of model.parts) {
    const mat = byId.get(p.materialId);
    if (!mat || p.hw || Math.abs(Math.cos(p.angleDeg * Math.PI / 180)) > 0.02) continue;
    const shape = materialShape(mat);
    if (shape.type !== 'linear' || hwRoleOf(p, shape) === 'post' || shape.u) continue;
    const b = partBounds(p, shape);
    const levels = over.stairTreads.filter((t) => t.toMm > b.x0 + 0.001 && t.fromMm < b.x1 - 0.001).map((t) => t.levelMm);
    if (!levels.length) continue;
    const caps = capsOver(model, p, materials);
    const up = Math.sin(p.angleDeg * Math.PI / 180) > 0;
    const top = up ? p.y + p.lengthMm : p.y;
    const bottom = Math.ceil((Math.max(...levels) + clearance - tan * p.x) * 1000) / 1000;
    const lengthMm = Math.max(0, top - bottom);
    if (lengthMm < 0.001) { omitted.add(p.id); caps.forEach((cap) => omitted.add(cap.id)); continue; }
    const slopeDeg = Math.atan(tan) * 180 / Math.PI;
    patches.set(p.id, { ...p, y: up ? bottom : top, lengthMm, unshearTan: tan,
      ...(up ? { cutStartDeg: 0, ...(!caps.length ? { cutEndDeg: slopeDeg } : {}) }
        : { cutEndDeg: 0, ...(!caps.length ? { cutStartDeg: slopeDeg } : {}) }),
    });
    caps.forEach((cap) => patches.set(cap.id, { ...cap, unshearTan: tan }));
  }
  return patches.size || omitted.size ? { ...model, parts: model.parts.filter((p) => !omitted.has(p.id)).map((p) => patches.get(p.id) ?? p) } : model;
}
