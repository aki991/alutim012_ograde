import { partBounds, type CustomModel, type CustomPart, type PartFit } from './custom';
import { applyGuides, shapeLookup } from './guides';
import { repeatOffIds, slatGroupBars } from './gateRefill';
import { capsOver } from './vbars';
import type { MatShape } from './materialShape';
import type { Material } from './types';

/**
 * Model na polju druge veličine: delovi se NE razvlače srazmerno (ram bi menjao debljinu, nosači bi se pomerali, a letvice bi se
 * širile), nego svaka mera ostaje vezana za ivicu polja, kao kod ugrađenog crteža. Podrazumevano („automatski“) se svaki kraj dela
 * vezuje za bližu ivicu:
 *  - ram i profili uz ivicu ostaju uz ivicu iste debljine, a prečke i letvice između njih se produžavaju do ramova;
 *  - nosač blizu dna ostaje na istom odstojanju od dna, a nosač blizu vrha na istom odstojanju od vrha;
 *  - komadni delovi (čepovi) i kosi profili se samo pomeraju.
 * Radnik za svaki deo može da zada drugačije pravilo (`part.fit`): prati jednu ivicu, ostaje na sredini, proteže se od ivice do
 * ivice ili se menja srazmerno. Broj i razmak letvica i prečki zatim računaju `refillVBars` i `refillPattern`.
 */

const norm = (a: number): number => ((a % 360) + 360) % 360;

type Mode = 'auto' | 'start' | 'end' | 'center' | 'stretch' | 'scale';
const MODE: Record<string, Mode> = { auto: 'auto', left: 'start', bottom: 'start', right: 'end', top: 'end', center: 'center', stretch: 'stretch', scale: 'scale' };
const modeOf = (v: string | undefined): Mode => MODE[v ?? 'auto'] ?? 'auto';

/** krajevi [a0, a1] dela u polju veličine V0 koje postaje V1: nova mesta krajeva po pravilu */
function span(mode: Mode, a0: number, a1: number, V0: number, V1: number): [number, number] {
  const d = V1 - V0;
  switch (mode) {
    case 'start': return [a0, a1];
    case 'end': return [a0 + d, a1 + d];
    case 'center': return [a0 + d / 2, a1 + d / 2];
    case 'stretch': return [a0, a1 + d];
    case 'scale': return [(a0 * V1) / V0, (a1 * V1) / V0];
    default: return [a0 < V0 / 2 ? a0 : a0 + d, a1 < V0 / 2 ? a1 : a1 + d];
  }
}
/** pomeraj dela koji se ne rasteže (sredina): „protegnut“ za deo koji se samo pomera važi kao automatski */
const shiftOf = (mode: Mode, c: number, V0: number, V1: number): number => span(mode === 'stretch' ? 'auto' : mode, c, c, V0, V1)[0] - c;

/**
 * Pravila dela po širini i po visini. Deo isključen iz preračuna niza (`repeat: 'off'`) bez zadatog pravila menja razmak srazmerno
 * u pravcu ponavljanja (vodoravne prečke po visini, uspravne letvice po širini), a po dužini ostaje vezan za ivice.
 */
function modesOf(p: CustomPart, off = false): [Mode, Mode] {
  const a = norm(p.angleDeg);
  let h = modeOf(p.fit?.h); let v = modeOf(p.fit?.v);
  if (off || p.fit?.repeat === 'off') {
    if ((a === 0 || a === 180) && v === 'auto') v = 'scale';
    if ((a === 90 || a === 270) && h === 'auto') h = 'scale';
  }
  return [h, v];
}

export function anchoredModel(m: CustomModel, widthMm: number, heightMm: number, materials: Material[]): CustomModel {
  if (Math.abs(m.widthMm - widthMm) < 1e-9 && Math.abs(m.heightMm - heightMm) < 1e-9) return m;
  const shapeOf = shapeLookup(materials);
  const W0 = m.widthMm; const H0 = m.heightMm;
  // pravila svakog dela; isključen preračun važi za ceo niz, a čep na vrhu letvice ide za svojom letvicom
  const off = repeatOffIds(m, materials);
  const modes = new Map<string, [Mode, Mode]>(m.parts.map((p) => [p.id, modesOf(p, off.has(p.id))]));
  for (const bar of slatGroupBars(m, materials)) for (const cap of capsOver(m, bar, materials)) modes.set(cap.id, modes.get(bar.id)!);
  const parts = m.parts.map((p): CustomPart => {
    const s = shapeOf(p);
    if (!s) return p;
    const [hm, vm] = modes.get(p.id) ?? modesOf(p);
    const b = partBounds(p, s);
    const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2;
    const a = norm(p.angleDeg);
    if (s.type === 'sheet') {
      const [x0, x1] = span(hm, b.x0, b.x1, W0, widthMm); const [y0, y1] = span(vm, b.y0, b.y1, H0, heightMm);
      return { ...p, x: x0, y: y0, lengthMm: x1 - x0, heightMm: y1 - y0 };
    }
    if (s.type === 'linear' && Math.abs(a - 90) < 1e-6) {
      const [n0, n1] = span(vm, Math.min(p.y, p.y + p.lengthMm), Math.max(p.y, p.y + p.lengthMm), H0, heightMm);
      return { ...p, x: p.x + shiftOf(hm, cx, W0, widthMm), y: n0, lengthMm: n1 - n0 };
    }
    if (s.type === 'linear' && Math.abs(a - 270) < 1e-6) {
      const [n0, n1] = span(vm, Math.min(p.y, p.y - p.lengthMm), Math.max(p.y, p.y - p.lengthMm), H0, heightMm);
      return { ...p, x: p.x + shiftOf(hm, cx, W0, widthMm), y: n1, lengthMm: n1 - n0 };
    }
    if (s.type === 'linear' && Math.abs(a) < 1e-6) {
      const [n0, n1] = span(hm, p.x, p.x + p.lengthMm, W0, widthMm);
      return { ...p, x: n0, y: p.y + shiftOf(vm, cy, H0, heightMm), lengthMm: n1 - n0 };
    }
    if (s.type === 'linear' && Math.abs(a - 180) < 1e-6) {
      const [n0, n1] = span(hm, p.x - p.lengthMm, p.x, W0, widthMm);
      return { ...p, x: n1, y: p.y + shiftOf(vm, cy, H0, heightMm), lengthMm: n1 - n0 };
    }
    return { ...p, x: p.x + shiftOf(hm, cx, W0, widthMm), y: p.y + shiftOf(vm, cy, H0, heightMm) };
  });
  return applyGuides({ ...m, widthMm, heightMm, parts }, materials);
}

/**
 * Dužina profila u specifikaciji za polje širine W i visine H kao formula, po istom pravilu kao crtež: kod automatskog pravila dužina
 * raste za razliku mera samo ako su krajevi sa raznih strana sredine; „protegnut“ raste za celu razliku, „srazmerno“ prati srazmeru,
 * a ostala pravila ne menjaju dužinu (null za kose profile: važi srazmerno razvlačenje).
 */
export function anchoredLengthFormula(m: CustomModel, p: CustomPart, off = false): string | null {
  const a = norm(p.angleDeg);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const half = (v: number, v0: number) => (v >= v0 / 2 ? 1 : 0);
  let dim: string; let v0: number; let a0: number; let mode: Mode;
  if (a === 0 || a === 180) { a0 = Math.min(p.x, p.x + (a === 0 ? p.lengthMm : -p.lengthMm)); dim = 'W'; v0 = m.widthMm; mode = modesOf(p, off)[0]; }
  else if (a === 90 || a === 270) { a0 = Math.min(p.y, p.y + (a === 90 ? p.lengthMm : -p.lengthMm)); dim = 'H'; v0 = m.heightMm; mode = modesOf(p, off)[1]; }
  else return null;
  const L = r1(p.lengthMm);
  if (mode === 'scale') return `${L}*${dim}/${v0}`;
  const coef = mode === 'stretch' ? 1 : mode === 'auto' ? half(a0 + p.lengthMm, v0) - half(a0, v0) : 0;
  return coef ? `${L}+${coef}*(${dim}-${v0})` : String(L);
}

/** Kako se deo ponaša kad je pravilo „automatski“: za prikaz uz izbor pravila (po širini i po visini). */
export function autoFit(m: CustomModel, p: CustomPart, shape: MatShape): { h: NonNullable<PartFit['h']>; v: NonNullable<PartFit['v']> } {
  const b = shape.type === 'sheet' || shape.type === 'linear' ? partBounds(p, shape) : { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
  const lo = (v: number, v0: number) => v < v0 / 2;
  const h = lo(b.x0, m.widthMm) === lo(b.x1, m.widthMm) ? (lo(b.x0, m.widthMm) ? 'left' : 'right') : 'stretch';
  const v = lo(b.y0, m.heightMm) === lo(b.y1, m.heightMm) ? (lo(b.y0, m.heightMm) ? 'bottom' : 'top') : 'stretch';
  return { h, v };
}
