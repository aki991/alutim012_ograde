import type { CutBar, CutPosition } from '../domain/pricing/cutting';
import { hasAngledEnds, MITER_SHAPE, VIEWS, viewShape } from '../domain/pricing/cutEnds';

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
export const BAR_VIEW_H = 68;
/** iznad šipke je mesto za ugao gornjeg reza kod kraja sa dva reza (zasek V) */
const TRACK_Y = 16;
/** visina šipke: ima mesta za dve kote (gornja i donja ivica) kod komada sa kosim krajevima */
const TRACK_H = 40;
const MITER_SLANT = TRACK_H; // pravi ugao 45°: kosina po širini jednaka visini (viewBox se ne izobličava)

/** jedna ivica komada na crtežu: krajevi (px) na visini kote, uvlačenje krajeva (u širinama cevi) i dužina u mm, kad je poznata */
interface Edge { x0: number; x1: number; inset: number; mm: number | null }
interface EdgeDims { top: Edge; bottom: Edge }

/** ds (u širinama cevi) na visini tn, linearno između tačaka kraja (tačke su poređane po tn) */
function dsAt(c: [number, number][], tn: number): number {
  if (c.length === 1 || tn <= c[0][1]) return c[0][0];
  for (let i = 1; i < c.length; i++) {
    const [d0, t0] = c[i - 1]; const [d1, t1] = c[i];
    if (tn <= t1) return t1 - t0 < 1e-9 ? Math.min(d0, d1) : d0 + ((d1 - d0) * (tn - t0)) / (t1 - t0);
  }
  return c[c.length - 1][0];
}

/** gornja i donja ivica komada: koliko su kraće od pune dužine (mera vrh–vrh) i gde su na crtežu */
function edgeDims(chA: [number, number][], chB: [number, number][], x: number, rw: number, k: number, lengthMm: number, w: number | undefined): EdgeDims {
  const edge = (tn: number, tnLine: number): Edge => {
    const inset = dsAt(chA, tn) + dsAt(chB, tn);
    return { x0: x + dsAt(chA, tnLine) * k, x1: x + rw - dsAt(chB, tnLine) * k, inset, mm: inset < 1e-3 ? lengthMm : w ? Math.round(lengthMm - inset * w) : null };
  };
  return { top: edge(0, 4 / TRACK_H), bottom: edge(1, 1 - 4 / TRACK_H) };
}

/**
 * Kote po ivicama: ivica koja ima punu dužinu nosi meru (gore ili dole); kad su obe ivice pune (ravni rezovi) kota je na sredini (null),
 * a kad nijedna nije puna (npr. zasek V na oba kraja) obe ivice dobijaju svoju meru.
 */
function edgeMarks(e: EdgeDims, lengthMm: number): { edge: 'top' | 'bottom'; mm: number; x0: number; x1: number; room: number }[] | null {
  const tFull = e.top.inset < 1e-3; const bFull = e.bottom.inset < 1e-3;
  const mk = (edge: 'top' | 'bottom', g: Edge, mm: number) => ({ edge, mm, x0: g.x0, x1: g.x1, room: g.x1 - g.x0 - 6 });
  if (tFull && bFull) return null;
  if (tFull) return [mk('top', e.top, lengthMm)];
  if (bFull) return [mk('bottom', e.bottom, lengthMm)];
  if (e.top.mm === null || e.bottom.mm === null) return null;
  return [mk('top', e.top, e.top.mm), mk('bottom', e.bottom, e.bottom.mm)];
}

export function barSvg(bar: CutBar, stockMm: number, kerfMm: number, colors: Map<string, string>, uid: string): string {
  const barMm = bar.stockMm ?? stockMm;
  const scale = BAR_VIEW_W / Math.max(stockMm, barMm);
  const W = Math.max(8, barMm * scale); // ostatak materijala je kraći od cele šipke: crta se u istoj razmeri
  const hatch = `h${uid}`;
  const parts: string[] = [];
  parts.push(`<defs><pattern id="${hatch}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f1f5f9"/><line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" stroke-width="3"/></pattern></defs>`);
  // šipka: ostatak je šrafiran, komadi se crtaju preko
  parts.push(`<rect x="0.5" y="${TRACK_Y}" width="${(W - 1).toFixed(2)}" height="${TRACK_H}" rx="6" fill="url(#${hatch})" stroke="${bar.offcut ? '#b45309' : '#94a3b8'}" stroke-width="${bar.offcut ? 1.6 : 1}"/>`);
  const gap = Math.max(1.5, kerfMm * scale);
  const shapeOf = (p: CutBar['pieces'][number]) => p.endShape ?? (p.miter && p.w ? MITER_SHAPE : undefined);
  const viewOf = (p: CutBar['pieces'][number]) => p.view ?? VIEWS[0];
  /** px po širini cevi: kosine se crtaju tako da ugao ostane veran (isto po obe ose), a kratak komad ih skuplja */
  const kOf = (p: CutBar['pieces'][number], rw: number): number => {
    const sh = shapeOf(p); if (!sh) return TRACK_H;
    const [ca, cb] = viewShape(sh, viewOf(p));
    return Math.min(TRACK_H, (rw * 0.45) / Math.max(0.0001, ...ca.map((q) => q[0]), ...cb.map((q) => q[0])));
  };
  /** koliko (px) komad zalazi u prethodni kad dele kosi rez: tačno koliko je nacrtana kosina, da se rezovi poklope */
  const overlapOf = (p: CutBar['pieces'][number], rw: number): number => {
    const sh = shapeOf(p); if (!p.share || !sh) return 0;
    const cl = viewShape(sh, viewOf(p))[0];
    return Math.abs(cl[cl.length - 1][0] - cl[0][0]) * kOf(p, rw);
  };
  // štednja materijala: komadi dele kosi rez (zalaze jedan u drugi). Zalaženje se crta po nacrtanoj kosini (ugao je veran), pa se dužine
  // blago razvlače (do nekoliko %), da kraj poslednjeg komada i ostatak ostanu tamo gde jesu
  const shared = bar.pieces.some((q) => q.share || q.view);
  let f = 1;
  if (shared) {
    const sumRw = bar.pieces.reduce((sum, q) => sum + q.lengthMm * scale, 0);
    const sumOv = bar.pieces.reduce((sum, q) => sum + overlapOf(q, q.lengthMm * scale), 0);
    const target = W - (bar.leftoverMm + kerfMm) * scale;
    f = Math.min(1.3, Math.max(0.9, (target + sumOv - (bar.pieces.length - 1) * gap) / Math.max(1, sumRw)));
  }
  let x = 0;
  bar.pieces.forEach((p, i) => {
    const rw = Math.max(1, p.lengthMm * scale * f);
    if (i > 0 && p.share) x -= overlapOf(p, rw);
    const fill = colors.get(p.pos) ?? '#475569';
    const label = String(p.lengthMm);
    const fs = 15;
    const textW = label.length * fs * 0.6;
    const shape = shapeOf(p);
    /** ivice komada (px): gornja i donja, sa dužinom u mm kad je poznata; za kote po ivici na koju se mera odnosi */
    let edges: EdgeDims | null = null;
    if (shape && (shared || p.view || p.share || (p.endShape && p.ends && hasAngledEnds(p.ends)))) {
      // komad koji se seče pod uglom (ojačanja repa, ram): pravi oblik krajeva (kosi rez ili zasek sa šiljkom ka spolja), uglovi su verni;
      // u šipki sa deljenim rezovima komad je okrenut tako da se kosi rez poklopi sa susednim
      const [chA, chB] = viewShape(shape, viewOf(p));
      const k = kOf(p, rw);
      const yOf = (tn: number): number => TRACK_Y + tn * TRACK_H;
      const poly = [...chB.map(([ds, tn]) => [x + rw - ds * k, yOf(tn)]), ...chA.slice().reverse().map(([ds, tn]) => [x + ds * k, yOf(tn)])] as [number, number][];
      parts.push(`<polygon points="${poly.map(([a1, b1]) => `${a1.toFixed(2)},${b1.toFixed(2)}`).join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="1" stroke-linejoin="round"/>`);
      edges = edgeDims(chA, chB, x, rw, k, p.lengthMm, p.w);
      // deljeni rez: jasna bela linija po sredini reza, da se vidi gde se jedan komad završava, a drugi počinje
      if (i > 0 && p.share) {
        const mid = chA.map(([ds, tn]) => [x + ds * k - gap / 2, yOf(tn)] as [number, number]);
        parts.push(`<polyline data-shared-cut="true" points="${mid.map(([a1, b1]) => `${a1.toFixed(2)},${b1.toFixed(2)}`).join(' ')}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="butt" stroke-linejoin="round"/>`);
      }
    } else if (p.miter) {
      // rez 45° na oba kraja: komad je trapez, duža (spoljna) mera je gore
      const sl = Math.min(MITER_SLANT, rw / 2);
      const pts = [[x, TRACK_Y], [x + rw, TRACK_Y], [x + rw - sl, TRACK_Y + TRACK_H], [x + sl, TRACK_Y + TRACK_H]].map(([a, b]) => `${a.toFixed(2)},${b}`).join(' ');
      parts.push(`<polygon points="${pts}" fill="${fill}" stroke="${fill}" stroke-width="1" stroke-linejoin="round"/>`);
      const sl1 = sl / TRACK_H;
      edges = edgeDims([[0, 0], [sl1, 1]], [[0, 0], [sl1, 1]], x, rw, TRACK_H, p.lengthMm, undefined);
    } else parts.push(`<rect x="${x.toFixed(2)}" y="${TRACK_Y}" width="${rw.toFixed(2)}" height="${TRACK_H}" rx="3" fill="${fill}"/>`);
    const cx = x + rw / 2;
    const cy = TRACK_Y + TRACK_H / 2;
    const textRoom = p.miter || shape ? rw - Math.min(MITER_SLANT, rw / 2) : rw; // kod trapeza tekst je na polovini visine
    // mera se piše uz ivicu na koju se odnosi (gornja ili donja); kad ivice nisu iste, a nijedna nije puna dužina (zasek V), obe imaju svoju kotu
    const marks = edges ? edgeMarks(edges, p.lengthMm) : null;
    const fitsAll = marks?.every((m) => m.room >= String(m.mm).length * 13 * 0.6 + 10);
    if (marks && marks.length && fitsAll) {
      for (const m of marks) {
        const top = m.edge === 'top';
        const ly = top ? TRACK_Y + 4 : TRACK_Y + TRACK_H - 4;
        const ty = top ? TRACK_Y + 17.5 : TRACK_Y + TRACK_H - 8;
        const tick = top ? 5 : -5;
        parts.push(`<g data-edge-dim="${m.edge}"><line x1="${(m.x0 + 3).toFixed(2)}" y1="${ly}" x2="${(m.x1 - 3).toFixed(2)}" y2="${ly}" stroke="#ffffff" stroke-width="1.2"/>`
          + `<line x1="${(m.x0 + 3).toFixed(2)}" y1="${ly}" x2="${(m.x0 + 3).toFixed(2)}" y2="${ly + tick}" stroke="#ffffff" stroke-width="1.2"/>`
          + `<line x1="${(m.x1 - 3).toFixed(2)}" y1="${ly}" x2="${(m.x1 - 3).toFixed(2)}" y2="${ly + tick}" stroke="#ffffff" stroke-width="1.2"/>`
          + `<text x="${((m.x0 + m.x1) / 2).toFixed(2)}" y="${ty}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#ffffff">${esc(String(m.mm))}</text></g>`);
      }
    } else if (textRoom >= textW + 8) parts.push(`<text x="${cx.toFixed(2)}" y="${(cy + 5.5).toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="#ffffff">${esc(label)}</text>`);
    else if (rw >= 13) parts.push(`<text x="0" y="0" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#ffffff" transform="translate(${(cx + 4).toFixed(2)} ${cy.toFixed(2)}) rotate(-90)">${esc(label)}</text>`);
    // oznaka pozicije ispod komada
    const tag = /^\d/.test(p.pos) ? `P${p.pos}` : p.pos;
    if (rw >= tag.length * 6.2 + 4) parts.push(`<text x="${cx.toFixed(2)}" y="${BAR_VIEW_H - 3}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="600" fill="${fill}">${esc(tag)}</text>`);
    // oznake uglova uz oba kraja komada koji se seče pod uglom; redosled prati položaj komada u šipki (okrenut komad ima krajeve zamenjene).
    // Kraj sa jednim rezom: ugao ispod šipke. Kraj sa dva reza (zasek V): ugao gornjeg reza iznad šipke, a donjeg ispod, uz svoj rez.
    // Na deljenom rezu ugao se piše samo jednom (uz prethodni komad).
    const txt = (xx: number, y: number, anchor: 'start' | 'end', t: string) => parts.push(`<text x="${xx.toFixed(2)}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="10" font-weight="600" fill="#64748b">${esc(t)}</text>`);
    const yTop = TRACK_Y - 4; const yBot = BAR_VIEW_H - 3;
    if (shape && rw >= tag.length * 6.2 + 80 && (p.miter || (p.ends && hasAngledEnds(p.ends)))) {
      const [chA, chB] = viewShape(shape, viewOf(p));
      /** uglovi rezova jednog kraja, odozgo naniže: ugao između reza i ose komada (90° = ravan rez) */
      const segAngles = (c: [number, number][]): number[] => c.slice(1).map((q, j) => Math.round((Math.atan2(Math.abs(q[1] - c[j][1]), Math.abs(q[0] - c[j][0])) * 180) / Math.PI));
      const put = (c: [number, number][], xx: number, anchor: 'start' | 'end') => {
        const a = segAngles(c);
        if (a.length >= 2) { txt(xx, yTop, anchor, String(a[0])); txt(xx, yBot, anchor, String(a[a.length - 1])); } else txt(xx, yBot, anchor, String(a[0] ?? 90));
      };
      if (!p.share) put(chA, x + 2, 'start');
      put(chB, x + rw - 2, 'end');
    } else {
      const angleLabel = (a: number[]) => (a.length > 1 ? a.map((v) => Math.round(v)).join('+') : String(Math.round(a[0] ?? 90)));
      const ends: [number[], number[]] | undefined = p.ends ?? (p.miter ? [[45], [45]] : undefined);
      if (ends && (p.ends ? hasAngledEnds(p.ends) : true) && rw >= tag.length * 6.2 + 80) {
        const [le, re] = viewOf(p).swap ? [ends[1], ends[0]] : ends;
        if (!p.share) txt(x + 2, yBot, 'start', angleLabel(le));
        txt(x + rw - 2, yBot, 'end', angleLabel(re));
      }
    }
    x += rw + gap;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAR_VIEW_W} ${BAR_VIEW_H}" width="${BAR_VIEW_W}" height="${BAR_VIEW_H}">${parts.join('')}</svg>`;
}
