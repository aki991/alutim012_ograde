import { linearEndLines, miterEndsOf, partAngle, type CustomPart } from './custom';
import { sectionFace, type MatShape } from './materialShape';

export type ProfileEnd = 0 | 1;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sredine stvarnih krajnjih ivica, uključujući kose rezove i okrenut presek. */
export function profileGrips(p: CustomPart, shape: MatShape): [number, number][] {
  if (shape.type !== 'linear') return [];
  const f = sectionFace(shape.section, partAngle(p));
  const lines = linearEndLines(p, f.u0, f.u1);
  const ends = miterEndsOf(p);
  const a = p.angleDeg * Math.PI / 180; const c = Math.cos(a); const s = Math.sin(a);
  return ([0, 1] as const).map((end) => {
    const edge = end === 0 ? lines.start : lines.end;
    let x = edge.reduce((sum, q) => sum + q[0], 0) / edge.length; const y = (f.u0 + f.u1) / 2;
    if (!p.endCuts && p.miter && ends[end] && p.lengthMm > f.face * (+ends[0] + +ends[1])) x = end === 0 ? f.face / 2 : p.lengthMm - f.face / 2;
    return [p.x + x * c - y * s, p.y + x * s + y * c];
  });
}

/** Suprotni kraj ostaje fiksan. Obično se menja samo dužina duž ose, a sa Shift i pravac profila. */
export function resizeProfileByDrag(p: CustomPart, end: ProfileEnd, dx: number, dy: number, freeAngle: boolean, gridMm = 1): CustomPart | null {
  if (![dx, dy].every(Number.isFinite)) return null;
  const a = p.angleDeg * Math.PI / 180; const c = Math.cos(a); const s = Math.sin(a);
  if (!freeAngle) {
    const delta = dx * c + dy * s;
    const step = gridMm > 0 ? gridMm : 0.001;
    const shift = Math.round(delta / step) * step;
    if (Math.abs(shift) < 1e-9) return p;
    const lengthMm = r3(p.lengthMm + (end === 0 ? -shift : shift));
    if (lengthMm < 1) return null;
    return { ...p, x: r3(p.x + (end === 0 ? shift * c : 0)), y: r3(p.y + (end === 0 ? shift * s : 0)), lengthMm, guides: undefined, nests: undefined, autoGuides: false };
  }
  const step = gridMm > 0 ? gridMm : 0.001;
  const mx = Math.round(dx / step) * step; const my = Math.round(dy / step) * step;
  if (mx === 0 && my === 0) return p;
  const x = p.x + (end === 0 ? mx : 0); const y = p.y + (end === 0 ? my : 0);
  const vx = p.lengthMm * c + (end === 0 ? -mx : mx); const vy = p.lengthMm * s + (end === 0 ? -my : my);
  const lengthMm = r3(Math.hypot(vx, vy));
  if (lengthMm < 1) return null;
  return { ...p, x: r3(x), y: r3(y), lengthMm, angleDeg: r3(Math.atan2(vy, vx) * 180 / Math.PI), guides: undefined, nests: undefined, autoGuides: false };
}
