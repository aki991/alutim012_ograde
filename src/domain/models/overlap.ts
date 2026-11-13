import { partAngle, type CustomModel, type CustomPart } from './custom';
import { materialShape, rotateDeg, sectionFace, type Section } from './materialShape';
import type { Material } from './types';

/**
 * Delovi (profili) ne mogu da stoje jedan preko drugog: dva profila se preklapaju ako im se poklope i pogled spreda
 * (okvir profila sa nagibom preseka) i dubina. Izuzetak je prečka i njene bočne U vođice (ona u njih ulazi namerno).
 */

const EPS = 0.01;

type Pt = [number, number];

/** Konveksni omotač tačaka (lanac po x), suprotno od kazaljke. */
export function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = []; const upper: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const area = (poly: Pt[]): number => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

/** Površina preseka dva konveksna poligona (Sutherland–Hodgman); oba suprotno od kazaljke. */
export function intersectionArea(subject: Pt[], clip: Pt[]): number {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]; const b = clip[(i + 1) % clip.length];
    const side = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j]; const q = inp[(j + 1) % inp.length];
      const sp = side(p); const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
  }
  return out.length >= 3 ? area(out) : 0;
}

/** Omotač spoljnog obrisa preseka okrenut za ugao (u: uspravno u ravni crteža, v: dubina). */
export function sectionHull(section: Section, deg: number): Pt[] {
  return hull(section.polys.flatMap((p) => p.outline.map((pt) => rotateDeg(pt, deg))));
}

/**
 * Najmanji vertikalni korak (mm) pri kome dva ista preseka, pomerena samo po visini, ne prodiru jedan u drugi:
 * to je najduža tetiva omotača preseka u pravcu visine. Nagnuti preseci se „uvlače“ jedan u drugi, pa je korak manji od
 * vidljive visine (npr. cev 80 × 20 pod 28,73° ima korak 41,6 mm, a vidljivu visinu 79,7 mm).
 */
export function minVerticalPitch(section: Section, deg: number): number {
  const h = sectionHull(section, deg);
  let best = 0;
  for (const [, v] of h) {
    const us: number[] = [];
    for (let i = 0; i < h.length; i++) {
      const [pu, pv] = h[i]; const [qu, qv] = h[(i + 1) % h.length];
      if (v < Math.min(pv, qv) - 1e-9 || v > Math.max(pv, qv) + 1e-9) continue;
      if (Math.abs(pv - qv) < 1e-12) us.push(pu, qu); else us.push(pu + ((v - pv) / (qv - pv)) * (qu - pu));
    }
    if (us.length) best = Math.max(best, Math.max(...us) - Math.min(...us));
  }
  return best;
}

interface Box { id: string; corners: [number, number][]; axes: [number, number][]; z0: number; z1: number; name: string; dir: [number, number]; ox: number; oy: number; len: number; z: number; hull: Pt[] }

function boxOf(p: CustomPart, materials: Map<string, Material>): Box | null {
  const m = materials.get(p.materialId);
  const shape = m ? materialShape(m) : null;
  if (!shape || shape.type !== 'linear') return null;
  const e = sectionFace(shape.section, partAngle(p));
  const a = (p.angleDeg * Math.PI) / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  const corners = ([[0, e.u0], [p.lengthMm, e.u0], [p.lengthMm, e.u1], [0, e.u1]] as [number, number][]).map(([lx, ly]) => [p.x + lx * c - ly * s, p.y + lx * s + ly * c] as [number, number]);
  return { id: p.id, corners, axes: [[c, s], [-s, c]], z0: p.z + e.v0, z1: p.z + e.v1, name: m?.name ?? 'deo', dir: [c, s], ox: p.x, oy: p.y, len: p.lengthMm, z: p.z, hull: sectionHull(shape.section, partAngle(p)) };
}

const range = (b: Box, ax: [number, number]): [number, number] => {
  const d = b.corners.map(([x, y]) => x * ax[0] + y * ax[1]);
  return [Math.min(...d), Math.max(...d)];
};

function overlaps(a: Box, b: Box): boolean {
  // paralelni profili: tačna provera po stvarnom preseku (nagnute prečke mogu da se uvuku jedna u drugu)
  if (Math.abs(a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]) < 1e-9) {
    const nA: Pt = [-a.dir[1], a.dir[0]];
    const sgn = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] < 0 ? -1 : 1; // suprotan smer ose obrće normalu preseka
    const along = (x: number, y: number) => x * a.dir[0] + y * a.dir[1];
    const a0 = along(a.ox, a.oy); const a1 = a0 + a.len;
    const b0 = along(b.ox, b.oy); const b1 = b0 + sgn * b.len;
    if (Math.min(a1, Math.max(b0, b1)) - Math.max(a0, Math.min(b0, b1)) <= EPS) return false;
    const pa = a.ox * nA[0] + a.oy * nA[1];
    const pb = b.ox * nA[0] + b.oy * nA[1];
    const A = hull(a.hull.map(([u, v]) => [pa + u, a.z + v] as Pt));
    const B = hull(b.hull.map(([u, v]) => [pb + sgn * u, b.z + v] as Pt));
    return intersectionArea(A, B) > 0.05;
  }
  if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= EPS) return false;
  for (const ax of [...a.axes, ...b.axes]) {
    const [a0, a1] = range(a, ax); const [b0, b1] = range(b, ax);
    if (Math.min(a1, b1) - Math.max(a0, b0) <= EPS) return false;
  }
  return true;
}

export interface Overlap { a: CustomPart; b: CustomPart; nameA: string; nameB: string }

/** Svi parovi profila koji se preklapaju (prečka i njene U vođice se ne računaju). */
export function findOverlaps(model: Pick<CustomModel, 'parts'>, materials: Material[]): Overlap[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const items = model.parts.map((p) => ({ p, box: boxOf(p, byId) })).filter((x): x is { p: CustomPart; box: Box } => !!x.box);
  const out: Overlap[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i]; const B = items[j];
      if (A.p.guides?.includes(B.p.id) || B.p.guides?.includes(A.p.id)) continue;
      if (overlaps(A.box, B.box)) out.push({ a: A.p, b: B.p, nameA: A.box.name, nameB: B.box.name });
    }
  }
  return out;
}

const pairKey = (o: Overlap): string => [o.a.id, o.b.id].sort().join('|');

/** Obaveštenje ako izmena (prev → next) pravi NOVO preklapanje; null kad je izmena dozvoljena. Već postojeća preklapanja se ne računaju. */
export function checkNewOverlap(prev: CustomModel, next: CustomModel, materials: Material[]): string | null {
  const before = new Set(findOverlaps(prev, materials).map(pairKey));
  const added = findOverlaps(next, materials).filter((o) => !before.has(pairKey(o)));
  if (!added.length) return null;
  const o = added[0];
  const more = added.length > 1 ? ` (i još ${added.length - 1} ${added.length === 2 ? 'preklapanje' : 'preklapanja'})` : '';
  return `Operacija nije izvršena: „${o.nameA}“ bi se preklopio sa „${o.nameB}“${more}. Delovi ne mogu da stoje jedan preko drugog; ostavite razmak ili ih pomerite.`;
}
