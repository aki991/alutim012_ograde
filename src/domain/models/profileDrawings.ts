import type { Material } from './types';

export type Pt = [number, number];

/** Šematski oblici složenih profila prema tehničkom crtežu (kroz više delova, sa ukrasnim zadebljanjima izostavljenim). */
export type ShapeName = 'mask' | 'maskica' | 'dvemaske' | 'zmali' | 'zveliki';

/** Poprečni presek profila prema tehničkom crtežu iz cenovnika dobavljača (mere u mm). */
export type ProfileSpec =
  /** U profil: A širina, B visina, C debljina zida; otvor je okrenut nagore */
  | { kind: 'u'; a: number; b: number; c: number }
  /** šuplja pravougaona (kvadratna) cev: A širina, B visina, C debljina zida */
  | { kind: 'tube'; a: number; b: number; c: number }
  /** L profil: A donji krak, B uspravni krak, C debljina */
  | { kind: 'l'; a: number; b: number; c: number }
  /** H profil: širina, visina iznad i ispod srednje veze, debljina zida */
  | { kind: 'h'; width: number; up: number; down: number; t: number }
  /** šuplja zakošena letvica: širina donje ivice, visina, debljina zida, pomeraj gornje ivice ulevo */
  | { kind: 'slant'; width: number; height: number; wall: number; offset: number }
  /** složeniji profili (U za masku, maskica, U za 2 maske, Z profili) */
  | { kind: 'shape'; name: ShapeName };

const TUBES: [string, number, number, number][] = [
  ['KV000001', 60, 60, 2], ['KV000002', 60, 60, 2.7], ['KV000003', 60, 40, 2.4], ['KV000004', 60, 40, 3], ['KV000005', 80, 80, 1.8],
  ['KV000025', 80, 80, 1.8], ['KV000006', 80, 80, 3], ['KV000007', 80, 20, 1], ['KV000008', 60, 20, 1], ['KV000010', 40, 20, 1],
  ['KV000011', 100, 100, 2], ['KV000012', 80, 60, 2], ['KV000013', 40, 40, 1.9], ['KV000014', 30, 30, 1], ['KV000016', 80, 20, 1.4],
  ['KV000017', 60, 20, 2], ['KV000018', 100, 20, 1], ['KV000019', 80, 40, 1], ['KV000020', 80, 40, 2], ['KV000021', 30, 30, 2],
  ['KV000022', 20, 20, 1], ['KV000024', 100, 100, 2], ['KV000023', 80, 20, 1], ['KV000026', 100, 20, 1], ['KV000036', 100, 20, 1],
  ['KV000027', 60, 20, 1], ['KV000030', 80, 20, 1],
];

/**
 * Crteži po šifri materijala (Ekoluka Key cenovnik 2026). Kvadratne cevi, U, L, H i zakošena letvica su tačni po merama
 * iz cenovnika. Profili za maske i Z profili su šematski (oblik očitan sa crteža, bez sitnih zadebljanja i kanala).
 * Pomeraj zakošenja KZ000003 očitan je sa crteža: gornja ivica je pomerena za oko 25,6 mm na visini od 20 mm.
 */
export const PROFILE_BY_SKU: Record<string, ProfileSpec> = {
  ...Object.fromEntries(TUBES.map(([sku, a, b, c]) => [sku, { kind: 'tube', a, b, c } as ProfileSpec])),
  KU000001: { kind: 'u', a: 25, b: 20, c: 1.35 },
  KU000002: { kind: 'u', a: 60, b: 20, c: 2 },
  KU000003: { kind: 'shape', name: 'mask' }, KU000007: { kind: 'shape', name: 'mask' }, KU000016: { kind: 'shape', name: 'mask' },
  KU000004: { kind: 'shape', name: 'maskica' }, KU000008: { kind: 'shape', name: 'maskica' }, KU000017: { kind: 'shape', name: 'maskica' },
  KU000005: { kind: 'shape', name: 'dvemaske' }, KU000006: { kind: 'shape', name: 'dvemaske' },
  KL000001: { kind: 'l', a: 20, b: 20, c: 1.5 },
  KL000002: { kind: 'l', a: 40, b: 40, c: 2 },
  KH000001: { kind: 'h', width: 60, up: 20, down: 10, t: 1.2 },
  KZ000001: { kind: 'shape', name: 'zmali' },
  KZ000002: { kind: 'shape', name: 'zveliki' },
  KZ000003: { kind: 'slant', width: 80, height: 20, wall: 1, offset: 25.6 },
  KZ000004: { kind: 'slant', width: 80, height: 20, wall: 1, offset: 25.6 },
};

/** Debljina zida preseka (mm); null za složene oblike kojima se zid ne menja. */
export const specWall = (s: ProfileSpec): number | null => (s.kind === 'u' || s.kind === 'tube' || s.kind === 'l' ? s.c : s.kind === 'h' ? s.t : s.kind === 'slant' ? s.wall : null);

/** Presek sa drugom debljinom zida (spoljne mere ostaju iste); zid ne može biti deblji od pola manje stranice. */
export function withWall(s: ProfileSpec, wallMm: number | undefined): ProfileSpec {
  if (!wallMm || !(wallMm > 0)) return s;
  if (s.kind === 'u' || s.kind === 'l') return { ...s, c: Math.min(wallMm, Math.min(s.a, s.b) / 2 - 0.05) };
  if (s.kind === 'tube') return { ...s, c: Math.min(wallMm, Math.min(s.a, s.b) / 2 - 0.05) };
  if (s.kind === 'h') return { ...s, t: Math.min(wallMm, s.width / 2 - 0.05) };
  if (s.kind === 'slant') return { ...s, wall: Math.min(wallMm, s.height / 2 - 0.05) };
  return s;
}

/** Presek profila po šifri; ako je materijalu zadata debljina zida, presek je sa tom debljinom. */
export const profileSpecFor = (m: Pick<Material, 'sku'> & { wallMm?: number }): ProfileSpec | null => {
  const s = PROFILE_BY_SKU[m.sku.trim().toUpperCase()];
  return s ? withWall(s, m.wallMm) : null;
};

/** Kota na crtežu: duž od `from` do `to`, pomerena upravno za `gap` (mm; pozitivno = udesno/nadole od pravca crtanja). */
export interface Dim { from: Pt; to: Pt; gap: number; label: string }

export interface ProfileGeometry {
  /** SVG putanja: puni deo preseka */
  path: string;
  fillRule: 'evenodd' | 'nonzero';
  /** okvir preseka */
  w: number;
  h: number;
  dims: Dim[];
  /** nazivi mera za tabelu ispod crteža */
  facts: { label: string; value: string }[];
  /** napomena ispod crteža (npr. da je prikaz šematski) */
  note?: string;
}

const area = (p: Pt[]): number => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + (x * y2 - x2 * y); }, 0) / 2;

/** Unutrašnji poligon (miter), pomeren ka unutra za `d` (mm); važi i za nekonveksne oblike dok je pomeraj mali prema ivicama. */
export function insetConvex(poly: Pt[], d: number): Pt[] {
  const sign = area(poly) > 0 ? 1 : -1;
  const lines = poly.map(([x1, y1], i) => {
    const [x2, y2] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = (-(y2 - y1) / len) * sign;
    const ny = ((x2 - x1) / len) * sign;
    return { px: x1 + nx * d, py: y1 + ny * d, dx: (x2 - x1) / len, dy: (y2 - y1) / len };
  });
  return lines.map((l, i) => {
    const p = lines[(i + lines.length - 1) % lines.length];
    const det = p.dx * -l.dy - p.dy * -l.dx;
    const t = ((l.px - p.px) * -l.dy - (l.py - p.py) * -l.dx) / det;
    return [p.px + p.dx * t, p.py + p.dy * t] as Pt;
  });
}

const pathOf = (pts: Pt[]): string => `M${pts.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join('L')}Z`;
/** pravougaonik kao potputanja, uvek istog smera (da se više preklopljenih delova spoji kad je pravilo „nonzero") */
const rectPath = (x: number, y: number, w: number, h: number): string => pathOf([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');
const mm = (n: number): string => `${fmt(n)} mm`;

function shapeGeometry(name: ShapeName): ProfileGeometry {
  const note = 'Šematski prikaz: oblik je očitan sa crteža u cenovniku, bez sitnih zadebljanja i kanala.';
  if (name === 'mask') {
    // U profil za masku 30 × 25,8 × 1,2: leva stranica, dno, desna uspravna veza i gornja polica sa desne strane
    const t = 1.2; const w = 30; const h = 25.8;
    const parts = [rectPath(0, 0, t, h), rectPath(0, h - t, w, t), rectPath(22.7, 0, t, h), rectPath(22.7, 0, w - 22.7, t), rectPath(0, 0, 3.2, t)];
    return {
      path: parts.join(''), fillRule: 'nonzero', w, h, note,
      dims: [{ from: [0, 0], to: [w, 0], gap: -7, label: '30' }, { from: [w, 0], to: [w, h], gap: 7, label: '25,8' }],
      facts: [{ label: 'Širina', value: mm(30) }, { label: 'Visina', value: mm(25.8) }, { label: 'Debljina zida', value: mm(1.2) }],
    };
  }
  if (name === 'maskica') {
    // maskica 22,5 × 6 × 1: gornja ploča sa dve stranice nadole
    const t = 1; const w = 22.5; const h = 6;
    const parts = [rectPath(0, 0, w, t), rectPath(0, 0, t, h), rectPath(w - t, 0, t, h), rectPath(-0.5, h - 1.8, t + 0.5, 1.8), rectPath(w - t, h - 1.8, t + 0.5, 1.8)];
    return {
      path: parts.join(''), fillRule: 'nonzero', w, h, note,
      dims: [{ from: [0, 0], to: [w, 0], gap: -6, label: '22,5' }, { from: [w, 0], to: [w, h], gap: 6, label: '6' }],
      facts: [{ label: 'Širina', value: mm(22.5) }, { label: 'Visina', value: mm(6) }, { label: 'Debljina zida', value: mm(1) }],
    };
  }
  if (name === 'dvemaske') {
    // U profil za 2 maske 79,6 × 26 × 1,5: gornja ploča, dve uspravne veze, donje police sa jezičcima
    const t = 1.5; const w = 79.6; const h = 26;
    const parts = [
      rectPath(0, 0, w, t), rectPath(16.1, 0, t, h), rectPath(65.4, 0, t, h),
      rectPath(0, h - t, 17.6, t), rectPath(64.4, h - t, w - 64.4, t),
      rectPath(7.2, t, 1.2, 3), rectPath(71.2, t, 1.2, 3), rectPath(7.2, h - t - 3, 1.2, 3), rectPath(71.2, h - t - 3, 1.2, 3),
    ];
    return {
      path: parts.join(''), fillRule: 'nonzero', w, h, note: `${note} Crtež u cenovniku je delimično isečen pri dnu.`,
      dims: [{ from: [0, 0], to: [w, 0], gap: -7, label: '79,6' }, { from: [0, 0], to: [0, h], gap: -7, label: '26' }],
      facts: [{ label: 'Širina', value: mm(79.6) }, { label: 'Visina', value: mm(26) }, { label: 'Debljina zida', value: mm(1.5) }],
    };
  }
  if (name === 'zveliki') {
    // Z profil za ogradu — veliki: šuplji, dve kose ruke i srednja komora sa dva rebra
    const wall = 1.2;
    const outer: Pt[] = [[0, 0], [19.5, 18.6], [79.2, 18.6], [99.6, 37.9], [99.6, 56.8], [80.7, 37.9], [20.7, 37.9], [0, 18.6]];
    const inner = insetConvex(outer, wall);
    return {
      path: `${pathOf(outer)}${pathOf(inner)}${rectPath(34.5, 18.6, wall, 19.3)}${rectPath(65.1, 18.6, wall, 19.3)}`, fillRule: 'evenodd', w: 99.6, h: 56.8, note,
      dims: [{ from: [0, 0], to: [99.6, 0], gap: -7, label: '100' }, { from: [99.6, 0], to: [99.6, 56.8], gap: 7, label: '57' }, { from: [99.6, 18.6], to: [99.6, 56.8], gap: 17, label: '38,5' }],
      facts: [{ label: 'Širina', value: mm(100) }, { label: 'Visina', value: mm(57) }, { label: 'Visina od srednje komore', value: mm(38.5) }],
    };
  }
  // zmali: Z profil za ogradu — mali: dve vodoravne ruke povezane kosom šupljom vezom
  const wall = 1;
  const outer: Pt[] = [[0, 0], [24.2, 0], [72.5, 48.1], [93.3, 48.1], [93.3, 55.5], [69.4, 55.5], [21.1, 8.1], [0, 8.1]];
  const inner = insetConvex(outer, wall);
  return {
    path: `${pathOf(outer)}${pathOf(inner)}`, fillRule: 'evenodd', w: 93.3, h: 55.5, note: `${note} Samo širina je jasno čitljiva na crtežu u cenovniku.`,
    dims: [{ from: [0, 0], to: [93.5, 0], gap: -7, label: '93,5' }],
    facts: [{ label: 'Širina', value: mm(93.5) }],
  };
}

export function profileGeometry(spec: ProfileSpec): ProfileGeometry {
  if (spec.kind === 'shape') return shapeGeometry(spec.name);
  if (spec.kind === 'u') {
    const { a, b, c } = spec;
    const pts: Pt[] = [[0, 0], [0, b], [a, b], [a, 0], [a - c, 0], [a - c, b - c], [c, b - c], [c, 0]];
    return {
      path: pathOf(pts), fillRule: 'evenodd', w: a, h: b,
      dims: [
        { from: [0, b], to: [a, b], gap: 7, label: `A = ${fmt(a)}` },
        { from: [0, 0], to: [0, b], gap: -7, label: `B = ${fmt(b)}` },
        { from: [0, 0], to: [c, 0], gap: -5, label: `C = ${fmt(c)}` },
      ],
      facts: [{ label: 'A — širina', value: mm(a) }, { label: 'B — visina', value: mm(b) }, { label: 'C — debljina zida', value: mm(c) }],
    };
  }
  if (spec.kind === 'tube') {
    const { a, b, c } = spec;
    const outer: Pt[] = [[0, 0], [a, 0], [a, b], [0, b]];
    return {
      path: `${pathOf(outer)}${pathOf(insetConvex(outer, c))}`, fillRule: 'evenodd', w: a, h: b,
      dims: [
        { from: [0, b], to: [a, b], gap: 7, label: `A = ${fmt(a)}` },
        { from: [a, 0], to: [a, b], gap: 7, label: `B = ${fmt(b)}` },
        { from: [0, 0], to: [c, 0], gap: -5, label: `C = ${fmt(c)}` },
      ],
      facts: [{ label: 'A — širina', value: mm(a) }, { label: 'B — visina', value: mm(b) }, { label: 'C — debljina zida', value: mm(c) }],
    };
  }
  if (spec.kind === 'l') {
    const { a, b, c } = spec;
    const pts: Pt[] = [[0, 0], [c, 0], [c, b - c], [a, b - c], [a, b], [0, b]];
    return {
      path: pathOf(pts), fillRule: 'evenodd', w: a, h: b,
      dims: [
        { from: [0, b], to: [a, b], gap: 7, label: `A = ${fmt(a)}` },
        { from: [0, 0], to: [0, b], gap: -7, label: `B = ${fmt(b)}` },
        { from: [0, 0], to: [c, 0], gap: -5, label: `C = ${fmt(c)}` },
      ],
      facts: [{ label: 'A — donji krak', value: mm(a) }, { label: 'B — uspravni krak', value: mm(b) }, { label: 'C — debljina', value: mm(c) }],
    };
  }
  if (spec.kind === 'h') {
    const { width, up, down, t } = spec;
    const h = up + down;
    const parts = [rectPath(0, 0, t, h), rectPath(width - t, 0, t, h), rectPath(0, up - t / 2, width, t)];
    return {
      path: parts.join(''), fillRule: 'nonzero', w: width, h,
      dims: [
        { from: [0, 0], to: [width, 0], gap: -7, label: fmt(width) },
        { from: [0, 0], to: [0, h], gap: -7, label: fmt(h) },
        { from: [width, 0], to: [width, up], gap: 7, label: fmt(up) },
        { from: [width, up], to: [width, h], gap: 7, label: fmt(down) },
      ],
      facts: [{ label: 'Širina', value: mm(width) }, { label: 'Visina ukupno', value: mm(h) }, { label: 'Iznad srednje veze', value: mm(up) }, { label: 'Ispod srednje veze', value: mm(down) }, { label: 'Debljina zida', value: mm(t) }],
    };
  }
  const { width, height, wall, offset } = spec;
  const outer: Pt[] = [[0, 0], [width, 0], [offset + width, height], [offset, height]];
  const inner = insetConvex(outer, wall);
  return {
    path: `${pathOf(outer)}${pathOf(inner)}`, fillRule: 'evenodd', w: offset + width, h: height,
    dims: [
      { from: [offset, height], to: [offset + width, height], gap: 7, label: fmt(width) },
      { from: [offset + width, 0], to: [offset + width, height], gap: 7, label: fmt(height) },
      { from: [width - 4, 0], to: [width - 4 + wall, 0], gap: -5, label: fmt(wall) },
    ],
    facts: [{ label: 'Širina', value: mm(width) }, { label: 'Visina', value: mm(height) }, { label: 'Debljina zida', value: mm(wall) }, { label: 'Zakošenje', value: `${fmt(offset)} mm na ${fmt(height)} mm visine` }],
  };
}
