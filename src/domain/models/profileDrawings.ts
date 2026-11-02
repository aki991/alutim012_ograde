import type { Material } from './types';

export type Pt = [number, number];

/** Poprečni presek profila prema tehničkom crtežu iz cenovnika dobavljača (mere u mm). */
export type ProfileSpec =
  /** U profil: A širina, B visina, C debljina zida; otvor je okrenut nagore */
  | { kind: 'u'; a: number; b: number; c: number }
  /** šuplja zakošena letvica: širina donje ivice, visina, debljina zida, pomeraj gornje ivice ulevo */
  | { kind: 'slant'; width: number; height: number; wall: number; offset: number };

/**
 * Crteži po šifri materijala (Ekoluka Key cenovnik 2026). Za sada: U profil 60×20×2 (KU000002)
 * i zakošena letvica 80×20×1 (KZ000003); ostali crteži se dodaju ovde.
 * Pomeraj zakošenja je očitan sa crteža: gornja ivica je pomerena ulevo za oko 25,6 mm na visini od 20 mm.
 */
export const PROFILE_BY_SKU: Record<string, ProfileSpec> = {
  KU000002: { kind: 'u', a: 60, b: 20, c: 2 },
  KZ000003: { kind: 'slant', width: 80, height: 20, wall: 1, offset: 25.6 },
};

export const profileSpecFor = (m: Pick<Material, 'sku'>): ProfileSpec | null => PROFILE_BY_SKU[m.sku.trim().toUpperCase()] ?? null;

/** Kota na crtežu: duž od `from` do `to`, pomerena upravno za `gap` (mm; pozitivno = udesno/nadole od pravca crtanja). */
export interface Dim { from: Pt; to: Pt; gap: number; label: string }

export interface ProfileGeometry {
  /** SVG putanja (evenodd): puni deo preseka */
  path: string;
  /** okvir preseka */
  w: number;
  h: number;
  dims: Dim[];
  /** nazivi mera za tabelu ispod crteža */
  facts: { label: string; value: string }[];
}

const area = (p: Pt[]): number => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + (x * y2 - x2 * y); }, 0) / 2;

/** Unutrašnji poligon konveksnog mnogougla, pomeren ka unutra za `d` (mm). */
export function insetConvex(poly: Pt[], d: number): Pt[] {
  const sign = area(poly) > 0 ? 1 : -1;
  const lines = poly.map(([x1, y1], i) => {
    const [x2, y2] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    // normala ka unutrašnjosti
    const nx = (-(y2 - y1) / len) * sign;
    const ny = ((x2 - x1) / len) * sign;
    return { px: x1 + nx * d, py: y1 + ny * d, dx: (x2 - x1) / len, dy: (y2 - y1) / len };
  });
  return lines.map((l, i) => {
    const p = lines[(i + lines.length - 1) % lines.length];
    // presek prethodne i ove pomerene prave
    const det = p.dx * -l.dy - p.dy * -l.dx;
    const t = ((l.px - p.px) * -l.dy - (l.py - p.py) * -l.dx) / det;
    return [p.px + p.dx * t, p.py + p.dy * t] as Pt;
  });
}

const pathOf = (pts: Pt[]): string => `M${pts.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join('L')}Z`;
const fmt = (n: number): string => String(n).replace('.', ',');

export function profileGeometry(spec: ProfileSpec): ProfileGeometry {
  if (spec.kind === 'u') {
    const { a, b, c } = spec;
    const pts: Pt[] = [[0, 0], [0, b], [a, b], [a, 0], [a - c, 0], [a - c, b - c], [c, b - c], [c, 0]];
    return {
      path: pathOf(pts), w: a, h: b,
      dims: [
        { from: [0, b], to: [a, b], gap: 7, label: `A = ${fmt(a)}` },
        { from: [0, 0], to: [0, b], gap: -7, label: `B = ${fmt(b)}` },
        { from: [0, 0], to: [c, 0], gap: -5, label: `C = ${fmt(c)}` },
      ],
      facts: [{ label: 'A — širina', value: `${fmt(a)} mm` }, { label: 'B — visina', value: `${fmt(b)} mm` }, { label: 'C — debljina zida', value: `${fmt(c)} mm` }],
    };
  }
  const { width, height, wall, offset } = spec;
  const outer: Pt[] = [[0, 0], [width, 0], [offset + width, height], [offset, height]];
  const inner = insetConvex(outer, wall);
  return {
    path: `${pathOf(outer)}${pathOf(inner)}`, w: offset + width, h: height,
    dims: [
      { from: [offset, height], to: [offset + width, height], gap: 7, label: fmt(width) },
      { from: [offset + width, 0], to: [offset + width, height], gap: 7, label: fmt(height) },
      { from: [width - 4, 0], to: [width - 4 + wall, 0], gap: -5, label: fmt(wall) },
    ],
    facts: [{ label: 'Širina', value: `${fmt(width)} mm` }, { label: 'Visina', value: `${fmt(height)} mm` }, { label: 'Debljina zida', value: `${fmt(wall)} mm` }, { label: 'Zakošenje', value: `${fmt(offset)} mm na ${fmt(height)} mm visine` }],
  };
}
