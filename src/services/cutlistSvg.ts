import type { CutBar, CutPosition } from '../domain/pricing/cutting';

/** Crtež jedne šipke krojne liste (SVG tekst): komadi u boji pozicije, dužina u mm na komadu, razmak = rez testere, ostatak šrafiran. */

/** Boje pozicija: dovoljno tamne da bela slova budu čitljiva. */
export const POSITION_COLORS = ['#d71920', '#1d6fd1', '#0f8f6a', '#d97706', '#7c3aed', '#0e7490', '#be185d', '#4d7c0f', '#475569', '#9a3412'];

/** Isti ključ pozicije uvek dobija istu boju (redosledom iz legende). */
export function positionColors(positions: CutPosition[]): Map<string, string> {
  return new Map(positions.map((p, i) => [p.key, POSITION_COLORS[i % POSITION_COLORS.length]]));
}

const FONT = "Arial, Helvetica, sans-serif";
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const BAR_VIEW_W = 1000;
export const BAR_VIEW_H = 52;
const TRACK_Y = 6;
const TRACK_H = 34;

export function barSvg(bar: CutBar, stockMm: number, kerfMm: number, colors: Map<string, string>, uid: string): string {
  const barMm = bar.stockMm ?? stockMm;
  const scale = BAR_VIEW_W / Math.max(stockMm, barMm);
  const W = Math.max(8, barMm * scale); // ostatak materijala je kraći od cele šipke: crta se u istoj razmeri
  const hatch = `h${uid}`;
  const parts: string[] = [];
  parts.push(`<defs><pattern id="${hatch}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f1f5f9"/><line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" stroke-width="3"/></pattern></defs>`);
  // šipka: ostatak je šrafiran, komadi se crtaju preko
  parts.push(`<rect x="0.5" y="${TRACK_Y}" width="${(W - 1).toFixed(2)}" height="${TRACK_H}" rx="6" fill="url(#${hatch})" stroke="${bar.offcut ? '#b45309' : '#94a3b8'}" stroke-width="${bar.offcut ? 1.6 : 1}"/>`);
  let x = 0;
  for (const p of bar.pieces) {
    const w = p.lengthMm * scale;
    const fill = colors.get(p.pos) ?? '#475569';
    const gap = Math.max(1.5, kerfMm * scale);
    const rw = Math.max(1, w - 0);
    const label = p.miter ? `${p.lengthMm} (45°)` : String(p.lengthMm);
    const fs = 15;
    const textW = label.length * fs * 0.6;
    parts.push(`<rect x="${x.toFixed(2)}" y="${TRACK_Y}" width="${rw.toFixed(2)}" height="${TRACK_H}" rx="3" fill="${fill}"/>`);
    const cx = x + rw / 2;
    const cy = TRACK_Y + TRACK_H / 2;
    if (rw >= textW + 8) parts.push(`<text x="${cx.toFixed(2)}" y="${(cy + 5.5).toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="#ffffff">${esc(label)}</text>`);
    else if (rw >= 13) parts.push(`<text x="0" y="0" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#ffffff" transform="translate(${(cx + 4).toFixed(2)} ${cy.toFixed(2)}) rotate(-90)">${esc(label)}</text>`);
    // oznaka pozicije ispod komada
    const tag = /^\d/.test(p.pos) ? `P${p.pos}` : p.pos;
    if (rw >= tag.length * 6.2 + 4) parts.push(`<text x="${cx.toFixed(2)}" y="${BAR_VIEW_H - 3}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="600" fill="${fill}">${esc(tag)}</text>`);
    x += rw + gap;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAR_VIEW_W} ${BAR_VIEW_H}" width="${BAR_VIEW_W}" height="${BAR_VIEW_H}">${parts.join('')}</svg>`;
}
