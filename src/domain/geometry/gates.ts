import type { Gate, Mm, OpeningSide, SwingDirection } from '../models/types';
import { resolveGate } from '../gates/design';

/**
 * Konvencija 3D scene: 1 jedinica = 1000 mm. X duž trase (rastući redosled elemenata), Y visina, Z dubina.
 * +Z je „spolja" (ulica), −Z je „unutra" (dvorište). Pogled „spreda" je sa +Z ka −Z.
 */
export const SCENE_UNIT_MM = 1000;
export const mmToScene = (mm: number): number => mm / SCENE_UNIT_MM;

export const MAX_SWING_RAD = Math.PI / 2;
export const LEAF_GAP_MM = 20;

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export interface LeafPose {
  /** x položaj ose šarki (mm, od ose prvog stuba) */
  pivotX: Mm;
  /** pravac u kome se krilo prostire od šarke: +1 (ka većem x) ili −1 */
  extendDir: 1 | -1;
  widthMm: Mm;
  /** rotacija oko vertikalne ose šarke (rad) */
  rotationY: number;
  /** translacija duž trase (mm), za kliznu kapiju */
  slideX: Mm;
}

/**
 * Rotacija krila oko šarke. Rotacija oko +Y za ugao θ prevodi +x u (cosθ, 0, −sinθ), pa je za šarku levo
 * pozitivan ugao „unutra" (−Z). Za šarku desno krilo se prostire u −x i znak se obrće.
 */
export function swingAngle(open: number, hinge: OpeningSide, swing: SwingDirection): number {
  const sign = (swing === 'inward' ? 1 : -1) * (hinge === 'left' ? 1 : -1);
  return sign * clamp01(open) * MAX_SWING_RAD;
}

/** Širine krila dvokrilne kapije (levo, desno) u okviru svetlog otvora. Nikad negativne. */
export function doubleLeafWidths(g: Pick<Gate, 'unequalLeaves' | 'leftLeafMm'> & Partial<Gate>, clearWidthMm: Mm): [Mm, Mm] {
  // mere kapije: ručno zadate ili izračunate širine krila imaju prednost nad okvirnom podelom
  if (g.design && g.kind === 'gate' && g.gateType === 'double') {
    const r = resolveGate(g as Gate, clearWidthMm);
    const wl = r.values.WL?.v; const wr = r.values.WR?.v;
    if (typeof wl === 'number' && typeof wr === 'number' && wl > 0 && wr > 0) return [wl, wr];
  }
  const avail = Math.max(0, clearWidthMm - LEAF_GAP_MM);
  if (!g.unequalLeaves || g.leftLeafMm <= 0) return [avail / 2, avail / 2];
  const left = Math.min(Math.max(g.leftLeafMm, Math.min(300, avail / 2)), Math.max(Math.min(300, avail / 2), avail - 300));
  const l = Math.min(left, avail);
  return [l, Math.max(0, avail - l)];
}

/** Položaj krila kapije za zadat procenat otvaranja (0–1) u okviru svetlog otvora [clearStart, clearEnd]. */
export function gateLeafPoses(g: Gate, clearStart: Mm, clearEnd: Mm, open: number): LeafPose[] {
  const o = clamp01(open);
  const clear = Math.max(0, clearEnd - clearStart);
  if (g.gateType === 'sliding') {
    const dir = g.opening === 'right' ? 1 : -1;
    return [{ pivotX: clearStart, extendDir: 1, widthMm: clear, rotationY: 0, slideX: dir * o * clear }];
  }
  if (g.gateType === 'double') {
    const [lw, rw] = doubleLeafWidths(g, clear);
    // bočni zazori iz mera kapije pomeraju krila od lica stubova
    const r = g.design ? resolveGate(g, clear) : null;
    const gl = r?.values.gL?.v ?? 0; const gr = r?.values.gR?.v ?? 0;
    return [
      { pivotX: clearStart + gl, extendDir: 1, widthMm: lw, rotationY: swingAngle(o, 'left', g.swing), slideX: 0 },
      { pivotX: clearEnd - gr, extendDir: -1, widthMm: rw, rotationY: swingAngle(o, 'right', g.swing), slideX: 0 },
    ];
  }
  const left = g.opening === 'left';
  return [{ pivotX: left ? clearStart : clearEnd, extendDir: left ? 1 : -1, widthMm: clear, rotationY: swingAngle(o, g.opening, g.swing), slideX: 0 }];
}

/** Da li je zadat raspoloživ prostor za povlačenje klizne kapije dovoljan. known=false: prostor nije zadat. */
export function slidingSpaceStatus(g: Gate, clearWidthMm: Mm): { known: boolean; ok: boolean; neededMm: Mm; availableMm: Mm | null } {
  if (g.gateType !== 'sliding') return { known: false, ok: true, neededMm: 0, availableMm: null };
  const avail = g.availableSpaceMm;
  if (avail === undefined || avail === null) return { known: false, ok: true, neededMm: clearWidthMm, availableMm: null };
  return { known: true, ok: avail >= clearWidthMm, neededMm: clearWidthMm, availableMm: avail };
}
