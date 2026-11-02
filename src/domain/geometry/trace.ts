import { FENCE_MODELS } from '../models/catalog';
import { applyPostRoles, createCorner, createFence } from '../models/factories';
import { CORNER_GAP_MM, type FenceModelId, type LayoutItem, type Project } from '../models/types';
import { LIMITS } from '../validation/limits';
import { insertItem } from './operations';

/** Tačka nacrtane trase u mm (x udesno, z naniže, kao u tlocrtu). */
export interface TracePoint { x: number; z: number }

/** Najveća širina jednog polja ograde pri automatskoj podeli nacrtane stranice. */
export const TRACE_MAX_FIELD_MM = 2000;
/** Ugao do kog se crtanje „hvata" (stepeni) i korak dužine (mm). */
export const TRACE_ANGLE_STEP_DEG = 15;
export const TRACE_LENGTH_STEP_MM = 10;

export const segmentLength = (a: TracePoint, b: TracePoint): number => Math.hypot(b.x - a.x, b.z - a.z);
const headingOf = (a: TracePoint, b: TracePoint): number => Math.atan2(b.z - a.z, b.x - a.x);

/** Tačka u pravcu `angleDeg` na dužini `lengthMm` od `from`. */
export function pointAt(from: TracePoint, angleDeg: number, lengthMm: number): TracePoint {
  const r = (angleDeg * Math.PI) / 180;
  return { x: from.x + lengthMm * Math.cos(r), z: from.z + lengthMm * Math.sin(r) };
}

/**
 * Hvatanje kursora: bez prethodne tačke na mrežu od 100 mm; inače pravac na korak od 15° i dužina na 10 mm
 * (`free` isključuje hvatanje pravca).
 */
export function snapTracePoint(prev: TracePoint | null, raw: TracePoint, free = false): TracePoint {
  if (!prev) return { x: Math.round(raw.x / 100) * 100, z: Math.round(raw.z / 100) * 100 };
  const len = segmentLength(prev, raw);
  const lenSnapped = Math.round(len / TRACE_LENGTH_STEP_MM) * TRACE_LENGTH_STEP_MM;
  const ang = (Math.atan2(raw.z - prev.z, raw.x - prev.x) * 180) / Math.PI;
  const angSnapped = free ? ang : Math.round(ang / TRACE_ANGLE_STEP_DEG) * TRACE_ANGLE_STEP_DEG;
  return pointAt(prev, angSnapped, lenSnapped);
}

/** Skretanje (stepeni, + udesno) između dolazeće i odlazeće stranice, u opsegu (−180, 180]. */
export function turnBetween(a: TracePoint, b: TracePoint, c: TracePoint): number {
  let d = ((headingOf(b, c) - headingOf(a, b)) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return Math.round(d * 10) / 10;
}

/** Uklanja duplirane i kolinearne tačke (ne prave skretanje). */
export function cleanTrace(points: TracePoint[]): TracePoint[] {
  const out: TracePoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && segmentLength(last, p) < 1) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    if (Math.abs(turnBetween(out[i - 1], out[i], out[i + 1])) < 0.5) out.splice(i, 1);
  }
  return out;
}

export interface TraceResult {
  project: Project;
  fields: number;
  corners: number;
  lengthMm: number;
  warnings: string[];
}

const rotateAround = (p: TracePoint, c: TracePoint, rad: number): TracePoint => {
  const dx = p.x - c.x; const dz = p.z - c.z;
  const cos = Math.cos(rad); const sin = Math.sin(rad);
  return { x: c.x + dx * cos - dz * sin, z: c.z + dx * sin + dz * cos };
};

/** Menja dužinu stranice `i` (tačke i → i+1): pravac ostaje, sve naredne tačke se pomeraju za razliku. */
export function setSegmentLength(points: TracePoint[], i: number, lengthMm: number): TracePoint[] {
  if (i < 0 || i >= points.length - 1 || !(lengthMm > 0)) return points;
  const a = points[i]; const b = points[i + 1];
  const len = segmentLength(a, b);
  if (len < 1) return points;
  const nb = { x: a.x + ((b.x - a.x) / len) * lengthMm, z: a.z + ((b.z - a.z) / len) * lengthMm };
  const dx = nb.x - b.x; const dz = nb.z - b.z;
  return points.map((p, k) => (k > i ? { x: p.x + dx, z: p.z + dz } : p));
}

/** Menja ugao skretanja na unutrašnjoj tački `i`: sve naredne tačke se zaokreću oko nje. */
export function setTurnAt(points: TracePoint[], i: number, turnDeg: number): TracePoint[] {
  if (i < 1 || i > points.length - 2) return points;
  const cur = turnBetween(points[i - 1], points[i], points[i + 1]);
  const rad = ((turnDeg - cur) * Math.PI) / 180;
  return points.map((p, k) => (k > i ? rotateAround(p, points[i], rad) : p));
}

/** Podela dužine na polja do TRACE_MAX_FIELD_MM, zaokružena na 10 mm; poslednje polje prima ostatak. */
export function splitLength(lengthMm: number, maxMm = TRACE_MAX_FIELD_MM): number[] {
  const n = Math.max(1, Math.ceil(lengthMm / maxMm - 1e-9));
  const w = Math.round(lengthMm / n / 10) * 10;
  const widths = Array<number>(n).fill(w);
  widths[n - 1] = Math.round(lengthMm - w * (n - 1));
  return widths;
}

/**
 * Pretvara nacrtanu trasu u ogradu izabranog modela: svaka stranica se deli na polja (stubovi na svakoj podeli),
 * a na svakom skretanju nastaje ugaoni spoj (modeli sa prečkama, savija se između dva stuba) ili stub sa
 * uglom skretanja. Postojeći elementi projekta se zamenjuju (korisnik može da poništi).
 */
export function traceToProject(project: Project, rawPoints: TracePoint[], modelId: FenceModelId): TraceResult {
  const pts = cleanTrace(rawPoints);
  const warnings: string[] = [];
  const empty = { ...project, items: [] as LayoutItem[], posts: [] as Project['posts'] };
  if (pts.length < 2) return { project, fields: 0, corners: 0, lengthMm: 0, warnings: ['Nacrtajte bar jednu stranicu (dve tačke).'] };

  const useBend = FENCE_MODELS[modelId].style === 'rods';
  const half = CORNER_GAP_MM / 2;
  const turns = new Map<number, number>(); // indeks stuba -> skretanje (samo bez ugaonog spoja)
  let p = empty;
  let fields = 0;
  let corners = 0;
  let lengthMm = 0;

  for (let s = 0; s < pts.length - 1; s++) {
    const len = segmentLength(pts[s], pts[s + 1]);
    lengthMm += len;
    const startTurn = s > 0 ? turnBetween(pts[s - 1], pts[s], pts[s + 1]) : 0;
    const endTurn = s < pts.length - 2 ? turnBetween(pts[s], pts[s + 1], pts[s + 2]) : 0;
    if (useBend && startTurn !== 0) {
      p = insertItem(p, createCorner({ heightMm: project.settings.defaultHeightMm, bendDeg: startTurn }), p.items.length);
      corners++;
    } else if (startTurn !== 0) {
      turns.set(p.items.length, startTurn);
    }
    const eff = len - (useBend && startTurn !== 0 ? half : 0) - (useBend && endTurn !== 0 ? half : 0);
    const minW = LIMITS.fenceWidth.min;
    if (eff < minW) warnings.push(`Stranica ${s + 1} je prekratka za polje (${Math.round(eff)} mm, najmanje ${minW} mm): polje je povećano.`);
    const widths = splitLength(Math.max(eff, minW));
    for (const w of widths) {
      p = insertItem(p, createFence({ modelId, widthMm: w, heightMm: project.settings.defaultHeightMm }), p.items.length);
      fields++;
    }
  }
  // skretanja bez ugaonog spoja: ugao se zadaje na stubu na početku sledeće stranice
  if (turns.size) {
    p = { ...p, posts: p.posts.map((post, i) => (turns.has(i) ? { ...post, turnDeg: turns.get(i) } : post)) };
  }
  p = applyPostRoles(p);
  if (fields === 0) warnings.push('Nijedno polje nije napravljeno.');
  return { project: { ...p, updatedAt: new Date().toISOString() }, fields, corners, lengthMm, warnings };
}
