/**
 * Privlačenje (object snap) pri crtanju modela: ivice dela koji se crta, pomera ili lepi privlače se uz ivice susednih delova
 * (i uz tlo) kad su bliže od praga. Svaka osa se privlači zasebno, pa deo može da „sedne“ uz sused po širini a da po visini
 * ostane gde je. Sve mere su u mm, y nagore.
 */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface SnapRefs { xs: number[]; ys: number[] }
export interface SnapResult { dx: number; dy: number; /** x linije uz koju je privučeno (za prikaz) */ gx: number | null; gy: number | null }

/** Ivice svih okvira (x0, x1, y0, y1) i tlo kao horizontalna linija; bez duplikata. */
export function snapRefs(boxes: Box[], groundY: number | null = null): SnapRefs {
  const xs = new Set<number>(); const ys = new Set<number>();
  const r = (n: number) => Math.round(n * 1000) / 1000;
  for (const b of boxes) { xs.add(r(b.x0)); xs.add(r(b.x1)); ys.add(r(b.y0)); ys.add(r(b.y1)); }
  if (groundY !== null) ys.add(r(groundY));
  return { xs: [...xs], ys: [...ys] };
}

/** Najmanji pomeraj (referenca − vrednost) po apsolutnoj vrednosti koji ne prelazi prag; null kad nijedna referenca nije dovoljno blizu. */
export function nearestShift(values: number[], refs: number[], thr: number): { shift: number; ref: number } | null {
  let best: { shift: number; ref: number } | null = null;
  for (const v of values) for (const ref of refs) {
    const d = ref - v;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.shift) - 1e-9)) best = { shift: d, ref };
  }
  return best;
}

/** Privlačenje okvira: leva/desna ivica uz x reference, donja/gornja uz y reference (svaka osa zasebno). */
export function snapBox(b: Box, refs: SnapRefs, thr: number, axes: { x?: boolean; y?: boolean } = { x: true, y: true }): SnapResult {
  const sx = axes.x === false ? null : nearestShift([b.x0, b.x1], refs.xs, thr);
  const sy = axes.y === false ? null : nearestShift([b.y0, b.y1], refs.ys, thr);
  return { dx: sx?.shift ?? 0, dy: sy?.shift ?? 0, gx: sx?.ref ?? null, gy: sy?.ref ?? null };
}

/** Privlačenje tačke (kraj profila, ugao ploče). */
export function snapPoint(x: number, y: number, refs: SnapRefs, thr: number, axes: { x?: boolean; y?: boolean } = { x: true, y: true }): { x: number; y: number; gx: number | null; gy: number | null } {
  const sx = axes.x === false ? null : nearestShift([x], refs.xs, thr);
  const sy = axes.y === false ? null : nearestShift([y], refs.ys, thr);
  return { x: x + (sx?.shift ?? 0), y: y + (sy?.shift ?? 0), gx: sx?.ref ?? null, gy: sy?.ref ?? null };
}
