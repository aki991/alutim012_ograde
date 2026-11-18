import { doubleLeafWidths, gateSpecWidth } from '../geometry/gates';
import type { Gate, Mm } from '../models/types';

/**
 * Broj šarki po krilu (važi za pešačku, jednokrilnu i dvokrilnu kapiju; kod dvokrilne za svako krilo): 3 šarke kad je visina krila preko
 * 1500 mm, ili kad je širina krila preko 1200 mm (bez obzira na visinu); inače 2.
 */
export const HINGE_MAX_TWO_HEIGHT_MM = 1500;
export const HINGE_MAX_TWO_WIDTH_MM = 1200;
export const hingeCountFor = (leafWidthMm: Mm, leafHeightMm: Mm): number => (leafHeightMm > HINGE_MAX_TWO_HEIGHT_MM || leafWidthMm > HINGE_MAX_TWO_WIDTH_MM ? 3 : 2);

/** šarke levog i desnog krila kapije (kod jednokrilne i pešačke isto) za zadat svetli otvor */
export function gateHingeQty(g: Gate, clearWidthMm: Mm): { left: number; right: number } {
  if (g.gateType === 'double') {
    const [l, r] = doubleLeafWidths(g, clearWidthMm);
    return { left: hingeCountFor(l, g.heightMm), right: hingeCountFor(r, g.heightMm) };
  }
  const n = hingeCountFor(gateSpecWidth(g, clearWidthMm), g.heightMm);
  return { left: n, right: n };
}
