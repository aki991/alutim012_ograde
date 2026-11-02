/**
 * Perspektivno preslikavanje pravougaonika na četvorougao (simulacija ograde na fotografiji).
 * Uglovi četvorougla redom: gore levo, gore desno, dole desno, dole levo.
 */
export type Pt = [number, number];

export interface Homography { a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number }

/** Preslikavanje jediničnog kvadrata (u, v ∈ [0, 1]) na četvorougao (Heckbert). */
export function squareToQuad(q: Pt[]): Homography {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2; const dx2 = x3 - x2; const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2; const dy2 = y3 - y2; const dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return { a: x1 - x0, b: x2 - x1, c: x0, d: y1 - y0, e: y2 - y1, f: y0, g: 0, h: 0 };
  }
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return { a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h };
}

export function mapPoint(H: Homography, u: number, v: number): Pt {
  const w = H.g * u + H.h * v + 1;
  return [(H.a * u + H.b * v + H.c) / w, (H.d * u + H.e * v + H.f) / w];
}

/** CSS matrix3d koji element širine w i visine h (transform-origin 0 0) preslikava na četvorougao. */
export function cssMatrix3d(w: number, h: number, q: Pt[]): string {
  const H = squareToQuad(q);
  const m = [H.a / w, H.b / h, H.c, H.d / w, H.e / h, H.f, H.g / w, H.h / h, 1];
  return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,${m[8]})`;
}

/** Crta sliku preslikanu na četvorougao (mreža trouglova sa afinim preslikavanjem). */
export function drawImageToQuad(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, q: Pt[], steps = 24): void {
  const H = squareToQuad(q);
  const tri = (s: Pt[], d: Pt[]) => {
    const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s;
    const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
    const det = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (Math.abs(det) < 1e-9) return;
    const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / det;
    const c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / det;
    const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / det;
    const dd = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / det;
    const e = dx0 - a * sx0 - c * sy0;
    const f = dy0 - b * sx0 - dd * sy0;
    // trougao se malo proširi da se ne vide šavovi između trouglova
    const cx = (dx0 + dx1 + dx2) / 3; const cy = (dy0 + dy1 + dy2) / 3;
    const grow = (x: number, y: number): Pt => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / l) * 0.6, y + ((y - cy) / l) * 0.6]; };
    ctx.save();
    ctx.beginPath();
    const p = d.map(([x, y]) => grow(x, y));
    ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, dd, e, f);
    ctx.drawImage(img, 0, 0, iw, ih);
    ctx.restore();
  };
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const u0 = i / steps; const u1 = (i + 1) / steps; const v0 = j / steps; const v1 = (j + 1) / steps;
      const s00: Pt = [u0 * iw, v0 * ih]; const s10: Pt = [u1 * iw, v0 * ih]; const s11: Pt = [u1 * iw, v1 * ih]; const s01: Pt = [u0 * iw, v1 * ih];
      const d00 = mapPoint(H, u0, v0); const d10 = mapPoint(H, u1, v0); const d11 = mapPoint(H, u1, v1); const d01 = mapPoint(H, u0, v1);
      tri([s00, s10, s11], [d00, d10, d11]);
      tri([s00, s11, s01], [d00, d11, d01]);
    }
  }
}
