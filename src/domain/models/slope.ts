import { contentBounds, partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape } from './materialShape';
import type { Material } from './types';
import { uid } from '../../utils/id';

/**
 * Pad terena (ograda ili kapija na kosom tlu): ispuna ostaje pravougaona, a ispod nje ide lim sa kosom donjom ivicom
 * (na višoj strani najmanje `minPlateMm`). Uspravni delovi uz donju ivicu (bočne cevi) idu do terena, a donji kraj im je sečen
 * pod uglom pada, u ravni sa donjom ivicom lima; ispod lima nema ničega. Ceo dosadašnji crtež se podiže za pad + visinu lima.
 */

export interface SlopeOptions {
  /** visinska razlika terena na širini polja (mm) */
  dropMm: number;
  /** strana na kojoj je teren niži */
  low: 'left' | 'right';
  /** visina ploče na višoj strani (mm); 0 = ploča se tamo završava u tački */
  minPlateMm: number;
  /** materijal ploče; null = bez ploče */
  plateId: string | null;
}

const norm = (a: number): number => ((a % 360) + 360) % 360;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;


/** Donji vodoravni profil crteža (uz donju ivicu, skoro cele širine): od njega se uzima materijal kosog profila. */
export function bottomProfile(model: CustomModel, materials: Material[]): CustomPart | null {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  const cb = contentBounds(model, shapeOf);
  if (!cb) return null;
  let best: CustomPart | null = null; let bestLen = 0;
  for (const p of model.parts) {
    const s = shapeOf(p);
    if (!s || s.type !== 'linear' || norm(p.angleDeg) % 180 !== 0) continue;
    const b = partBounds(p, s);
    if (b.y0 > cb.y0 + 1) continue;
    const len = b.x1 - b.x0;
    if (len >= 0.6 * (cb.x1 - cb.x0) && len > bestLen) { best = p; bestLen = len; }
  }
  return best;
}

/** Ploče iz cenovnika (lim i druge ploče, bez stakla) za popunu pada. */
export const plateMaterials = (materials: Material[]): Material[] => materials.filter((m) => { const s = materialShape(m); return s.type === 'sheet' && !s.glass; });

export function addSlope(model: CustomModel, materials: Material[], o: SlopeOptions): { model: CustomModel } | { error: string } {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  const cb = contentBounds(model, shapeOf);
  if (!cb || !model.parts.length) return { error: 'Prvo nacrtajte ogradu ili kapiju, pa dodajte pad.' };
  if (!(o.dropMm > 0)) return { error: 'Pad mora biti veći od 0 mm.' };
  if (o.minPlateMm < 0) return { error: 'Visina ploče ne može biti negativna.' };
  const plate = o.plateId ? byId.get(o.plateId) : null;
  if (o.plateId && (!plate || materialShape(plate).type !== 'sheet')) return { error: 'Izabrana ploča nije ploča iz cenovnika.' };
  const bottom = bottomProfile(model, materials);

  const x0 = cb.x0; const x1 = cb.x1; const W = x1 - x0;
  const theta = Math.atan2(o.dropMm, W);
  // linija terena (donja ivica kapije): na nižoj strani 0, na višoj strani pad
  const k = (o.low === 'left' ? 1 : -1) * Math.tan(theta);
  const a0 = o.low === 'left' ? 0 : o.dropMm;
  const groundY = (x: number) => a0 + k * (x - x0);
  const cutDeg = r3((Math.atan(k) * 180) / Math.PI);
  const baseY = cb.y0;
  // uspravni delovi uz donju ivicu (bočne cevi); lim ide između njih
  const isPost = (p: CustomPart) => { const sh = shapeOf(p); return !!sh && sh.type === 'linear' && (norm(p.angleDeg) === 90 || norm(p.angleDeg) === 270) && partBounds(p, sh).y0 <= baseY + 1; };
  if (!model.parts.some(isPost)) return { error: 'Crtež nema bočne cevi uz donju ivicu (uspravne profile do dna), pa nema šta da se seče pod uglom pada.' };
  const postBounds = model.parts.filter(isPost).map((p) => partBounds(p, shapeOf(p)!));
  const leftB = postBounds.filter((b) => b.x0 <= x0 + 1).sort((p, q) => q.x1 - p.x1)[0];
  const rightB = postBounds.filter((b) => b.x1 >= x1 - 1).sort((p, q) => p.x0 - q.x0)[0];
  const innerL = leftB ? leftB.x1 : x0; const innerR = rightB ? rightB.x0 : x1;
  // crtež se podiže toliko da lim na višoj strani (uz bočnu cev) ima zadatu visinu; stari donji kraj je na `lift`
  const lift = Math.max(groundY(innerL), groundY(innerR)) + o.minPlateMm;

  const parts: CustomPart[] = [];
  for (const p of model.parts) {
    const moved = { ...p, y: r3(p.y - baseY + lift) };
    if (!isPost(p)) { parts.push(moved); continue; }
    // bočna cev ide do terena, a donji kraj je sečen pod uglom pada (linija reza prolazi kroz osu cevi na liniji terena)
    const g = groundY(p.x);
    let post: CustomPart = norm(p.angleDeg) === 90
      ? { ...moved, y: r3(g), lengthMm: r3(moved.y + p.lengthMm - g), cutStartDeg: cutDeg }
      : { ...moved, lengthMm: r3(moved.y - g), cutEndDeg: cutDeg };
    // deo rama sa rezom 45°: donji kraj više nije ugao rama
    if (p.cut45 && p.miter) { const ends = p.miterEnds ?? [true, true]; post = { ...post, miterEnds: norm(p.angleDeg) === 90 ? [false, ends[1]] : [ends[0], false] }; }
    parts.push(post);
  }

  // donji vodoravni deo rama sa rezom 45° (ugao sa bočnim cevima) postaje ravan i ide između bočnih cevi
  if (bottom && bottom.cut45 && bottom.miter) {
    const i = parts.findIndex((p) => p.id === bottom.id);
    if (i >= 0) { const { cut45: _c, miter: _m, miterEnds: _e, ...rest } = parts[i]; parts[i] = { ...rest, x: r3(innerL), lengthMm: r3(innerR - innerL), angleDeg: 0 }; }
  }

  // lim između bočnih cevi: donja ivica na liniji terena (u ravni sa donjim krajevima bočnih cevi), gornja do starog donjeg kraja crteža
  if (plate) {
    const yl = groundY(innerL); const yr = groundY(innerR);
    const y = Math.min(yl, yr);
    parts.push({ id: uid('part'), materialId: plate.id, x: r3(innerL), y: r3(y), lengthMm: r3(innerR - innerL), heightMm: r3(lift - y), bottomSlopeMm: r3(yr - yl), angleDeg: 0, rot: 0, z: bottom?.z ?? 0 });
  }
  return { model: { ...model, parts, heightMm: r3(model.heightMm + lift) } };
}

/** za prikaz: ugao terena (stepeni) i nagib u % */
export const slopeInfo = (dropMm: number, widthMm: number): { deg: number; pct: number } => ({ deg: Math.round((Math.atan2(dropMm, widthMm) * 180) / Math.PI * 100) / 100, pct: Math.round((dropMm / Math.max(1, widthMm)) * 1000) / 10 });

