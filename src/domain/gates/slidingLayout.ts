import type { LaidOutItem } from '../geometry/layout';
import type { Gate } from '../models/types';

/**
 * Visina sklopa od tla do vrha rama. Kod krila iz modela (nacrtano ili model ograde) visina kapije je visina krila, a krilo je
 * podignuto od tla za odstojanje donje ivice rama.
 */
export const slidingH = (g: Pick<Gate, 'heightMm' | 'sliding'>): number => g.heightMm + (g.sliding?.drawnLeaf ? g.sliding.frameBottomY : 0);
import { localToWorld, resolveSliding, type SlidingResult } from './slidingAssembly';

/** Klizni sklop postavljen u projekat: rezultat i preslikavanje lokalne ose X u X crteža. */
export interface PlacedSliding {
  gate: Gate;
  res: SlidingResult;
  X: (x: number) => number;
  /** granice crteža sklopa u X crteža (sa otvorenim položajem i fiksnim delovima) */
  minX: number;
  maxX: number;
}

export function placeSliding(gate: Gate, li: Pick<LaidOutItem, 'clearStart' | 'clearEnd' | 'clearWidth'>): PlacedSliding | null {
  if (!gate.sliding) return null;
  const res = resolveSliding(gate.sliding, li.clearWidth, slidingH(gate));
  const X = (x: number) => localToWorld(x, gate.opening, li.clearStart, li.clearEnd);
  const a = X(res.extents.minX); const b = X(res.extents.maxX);
  return { gate, res, X, minX: Math.min(a, b), maxX: Math.max(a, b) };
}

/** Koliko crtež kliznih sklopova izlazi levo i desno van elemenata projekta (za prostor oko crteža). */
export function slidingOverflow(items: LaidOutItem[], left: number, right: number): { left: number; right: number; any: boolean } {
  let l = 0; let r = 0; let any = false;
  for (const li of items) {
    if (li.item.kind !== 'gate' || !li.item.sliding) continue;
    const p = placeSliding(li.item, li);
    if (!p) continue;
    any = true;
    l = Math.max(l, left - p.minX);
    r = Math.max(r, p.maxX - right);
  }
  return { left: l, right: r, any };
}
