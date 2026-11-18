import type { Gate, Mm, OpeningSide, SwingDirection } from '../models/types';
import { travelOf } from '../gates/slidingAssembly';
import { resolveGate } from '../gates/design';

/**
 * Konvencija 3D scene: 1 jedinica = 1000 mm. X duž trase (rastući redosled elemenata), Y visina, Z dubina.
 * +Z je „spolja" (ulica), −Z je „unutra" (dvorište). Pogled „spreda" je sa +Z ka −Z.
 * Klizno krilo i njegov okov (ručka, zasun, letva, motor) su sa strane dvorišta (−Z), iza stubova gledano sa ulice.
 */
export const SCENE_UNIT_MM = 1000;
export const mmToScene = (mm: number): number => mm / SCENE_UNIT_MM;

export const MAX_SWING_RAD = Math.PI / 2;
/** razmak između krila bez zadatih mera kapije: nema ga (krila se dodiruju); razmak postoji tek kad se upiše u Mere kapije (gC) */
export const LEAF_GAP_MM = 0;

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
  // zazori iz mera kapije (središnji gC i bočni gL, gR) oduzimaju se samo kad su upisani; inače krila dele ceo svetli otvor
  const dv = g.design && g.kind === 'gate' && g.gateType === 'double' ? resolveGate(g as Gate, clearWidthMm).values : null;
  const gaps = LEAF_GAP_MM + (dv?.gC?.v ?? 0) + (dv?.gL?.v ?? 0) + (dv?.gR?.v ?? 0);
  const avail = Math.max(0, clearWidthMm - gaps);
  if (!g.unequalLeaves || g.leftLeafMm <= 0) return [avail / 2, avail / 2];
  const left = Math.min(Math.max(g.leftLeafMm, Math.min(300, avail / 2)), Math.max(Math.min(300, avail / 2), avail - 300));
  const l = Math.min(left, avail);
  return [l, Math.max(0, avail - l)];
}

/** Položaj krila kapije za zadat procenat otvaranja (0–1) u okviru svetlog otvora [clearStart, clearEnd]. */
/** širina krila za izradu: kod jednokrilne kapije sa merama to je „Širina krila“ (otvor − zazori), inače svetli otvor */
export function gateSpecWidth(g: Gate, clear: Mm): Mm {
  if (g.gateType === 'sliding' || g.gateType === 'double' || !g.design) return clear;
  const wk = resolveGate(g, clear).values.Wk?.v;
  return wk !== null && wk !== undefined && wk > 0 ? wk : clear;
}

/** krila krilne kapije sa merama, u odnosu na levo lice stuba (isto što crta skica mera); nepoznat zazor je 0, a nepoznata širina krila popunjava ostatak */
export function swingLeafBoxes(g: Gate, clear: Mm): { x: Mm; w: Mm; hinge: 'left' | 'right' }[] | null {
  if (!g.design || g.gateType === 'sliding') return null;
  const r = resolveGate(g, clear);
  const v = (k: string): number => r.values[k]?.v ?? 0;
  if (g.gateType === 'double') {
    const room = clear - v('gL') - v('gR') - v('gC');
    const wl = r.values.WL?.v ?? (r.values.WR?.v != null ? room - r.values.WR.v : room / 2);
    const wr = r.values.WR?.v ?? room - wl;
    return [{ x: v('gL'), w: wl, hinge: 'left' }, { x: clear - v('gR') - wr, w: wr, hinge: 'right' }];
  }
  const left = g.opening === 'left';
  const w = r.values.Wk?.v ?? Math.max(clear - v('gH') - v('gZ'), 0);
  return [{ x: left ? v('gH') : clear - v('gH') - w, w, hinge: left ? 'left' : 'right' }];
}

export function gateLeafPoses(g: Gate, clearStart: Mm, clearEnd: Mm, open: number): LeafPose[] {
  const o = clamp01(open);
  const clear = Math.max(0, clearEnd - clearStart);
  if (g.gateType === 'sliding') {
    const dir = g.opening === 'right' ? 1 : -1;
    return [{ pivotX: clearStart, extendDir: 1, widthMm: clear, rotationY: 0, slideX: dir * o * (g.sliding ? travelOf(g.sliding, clear) : clear) }];
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
  const gh = g.design ? resolveGate(g, clear).values.gH?.v ?? 0 : 0;
  return [{ pivotX: left ? clearStart + gh : clearEnd - gh, extendDir: left ? 1 : -1, widthMm: gateSpecWidth(g, clear), rotationY: swingAngle(o, g.opening, g.swing), slideX: 0 }];
}

/** Da li je zadat raspoloživ prostor za povlačenje klizne kapije dovoljan. known=false: prostor nije zadat. */
export function slidingSpaceStatus(g: Gate, clearWidthMm: Mm): { known: boolean; ok: boolean; neededMm: Mm; availableMm: Mm | null } {
  if (g.gateType !== 'sliding') return { known: false, ok: true, neededMm: 0, availableMm: null };
  // klizni sklop: bočni prostor se proverava prema hodu i repu u panelu kapije
  if (g.sliding) return { known: false, ok: true, neededMm: travelOf(g.sliding, clearWidthMm), availableMm: null };
  const avail = g.availableSpaceMm;
  if (avail === undefined || avail === null) return { known: false, ok: true, neededMm: clearWidthMm, availableMm: null };
  return { known: true, ok: avail >= clearWidthMm, neededMm: clearWidthMm, availableMm: avail };
}

/* ---------- dvokrilna kapija: aktivno i pasivno krilo ---------- */

/** Način otvaranja dvokrile kapije u prikazu: samo aktivno krilo ili oba (prvo aktivno, pa se podiže zasun, pa pasivno). */
export type DoubleOpenMode = 'active' | 'both';

/** deo hoda (0–1) u kome se otvara aktivno krilo, podiže zasun i otvara pasivno krilo kad se otvaraju oba krila */
const BOTH_ACTIVE_END = 0.45;
const BOTH_BOLT_END = 0.55;

/**
 * Otvorenost delova za napredak `t` (0–1). Aktivno krilo: samo ono. Oba krila: aktivno, zatim zasun gore, zatim pasivno krilo;
 * unazad (zatvaranje) ide obrnutim redom: pasivno, zasun dole, aktivno. `bolt` je 0 spušten (u prihvatu), 1 podignut.
 */
export function doubleOpenState(t: number, mode: DoubleOpenMode): { active: number; passive: number; bolt: number } {
  const o = clamp01(t);
  if (mode === 'active') return { active: o, passive: 0, bolt: 0 };
  return {
    active: clamp01(o / BOTH_ACTIVE_END),
    bolt: clamp01((o - BOTH_ACTIVE_END) / (BOTH_BOLT_END - BOTH_ACTIVE_END)),
    passive: clamp01((o - BOTH_BOLT_END) / (1 - BOTH_BOLT_END)),
  };
}

/** Aktivno krilo: 0 = levo, 1 = desno, gledano sa ulice. Strana se čuva u `opening` (kod dvokrilne to nije strana šarki). */
export const activeLeafIndex = (g: Pick<Gate, 'opening'> & { design?: { activeLeaf?: 'left' | 'right' } }): 0 | 1 => ((g.design?.activeLeaf ?? g.opening) === 'left' ? 0 : 1);

/** Krila dvokrilne kapije u odnosu na levo lice stuba (levo, desno): iz mera kapije, a bez njih iz širina krila. */
export function doubleLeafBoxes(g: Gate, clear: Mm): { x: Mm; w: Mm; hinge: 'left' | 'right' }[] {
  // mere kapije imaju prednost samo kad zadaju širinu bar jednog krila; inače važe „Različita krila“ (podela jednakih ili zadatih širina)
  const r = g.design ? resolveGate(g, clear).values : null;
  const boxes = r && (r.WL?.v != null || r.WR?.v != null) ? swingLeafBoxes(g, clear) : null;
  if (boxes) return boxes;
  const [lw, rw] = doubleLeafWidths(g, clear);
  return [{ x: 0, w: lw, hinge: 'left' }, { x: clear - rw, w: rw, hinge: 'right' }];
}

/** visina ose brave od donje ivice krila (mm): iz mera kapije, inače nešto iznad sredine */
export function lockHeightMm(g: Gate, clear: Mm, leafHeightMm: Mm): Mm {
  const v = g.design ? resolveGate(g, clear).values.lockH?.v ?? null : null;
  return v !== null ? Math.min(Math.max(v, 0), leafHeightMm) : Math.min(1000, leafHeightMm * 0.55);
}

/** dužina vertikalnog podnog zasuna (mm) */
export const floorBoltLengthMm = (leafHeightMm: Mm): Mm => Math.round(Math.min(800, leafHeightMm * 0.45));
/** odstojanje ose zasuna od unutrašnje ivice pasivnog krila (mm) */
export const BOLT_INSET_MM = 55;
