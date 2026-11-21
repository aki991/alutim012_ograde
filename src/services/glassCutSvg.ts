import { glassMm, type GlassCutPiece } from '../domain/pricing/glassCutting';

/** Skica table u istom smeru kao crtež, sa oznakama temena i merama ivica. */
export function glassCutSvg(p: GlassCutPiece): string {
  const scale = Math.min(220 / Math.max(1, p.horizontalMm), 105 / Math.max(1, p.heightMm));
  const pts = p.points.map(([x, y]) => [(340 - p.horizontalMm * scale) / 2 + x * scale, 145 - y * scale]);
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length; const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  const labels = pts.map((q, i) => {
    const next = pts[(i + 1) % pts.length];
    const mx = (q[0] + next[0]) / 2; const my = (q[1] + next[1]) / 2;
    const d = Math.hypot(mx - cx, my - cy) || 1;
    return `<text x="${mx + 18 * (mx - cx) / d}" y="${my + 18 * (my - cy) / d}" text-anchor="middle" dominant-baseline="middle" font-size="11">${glassMm(p.edgesMm[i])}</text><text x="${q[0] + (q[0] < cx ? -10 : 10)}" y="${q[1] + (q[1] < cy ? -8 : 14)}" text-anchor="middle" font-size="11" font-weight="bold">${'ABCD'[i]}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="190" viewBox="0 0 340 190"><rect width="340" height="190" fill="white"/><g font-family="Arial, sans-serif" fill="#17212e"><polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="#d4edf3" stroke="#355b69" stroke-width="1.4"/>${labels}<text x="170" y="181" text-anchor="middle" font-size="10">Mere ivica u mm · pogled spreda</text></g></svg>`;
}
