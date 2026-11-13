import { RAL_COLORS } from './catalog';
import { profileGeometry, profileSpecFor, specWall, type ProfileSpec, type Pt } from './profileDrawings';
import type { Material } from './types';

/**
 * Oblik materijala za crtanje modela: svaki materijal iz cenovnika dobija poprečni presek (profili), ploču (staklo, paneli)
 * ili sklop jednostavnih tela (kape, stope, čepovi, okov). Isti opis koriste 2D crtež i 3D prikaz.
 * Oblik se određuje po šifri (tačni crteži iz cenovnika), a inače po nazivu i merama u nazivu.
 */

export type MaterialGroupId =
  | 'kv' | 'u' | 'maske' | 'l' | 'h' | 'z' | 'kose' | 'okrugle' | 'trake'
  | 'kape' | 'rozetne' | 'stope' | 'cepovi' | 'okov' | 'automatika' | 'ploce' | 'ostalo';

export const MATERIAL_GROUPS: { id: MaterialGroupId; label: string }[] = [
  { id: 'kv', label: 'Kvadratne i pravougaone cevi' },
  { id: 'u', label: 'U profili' },
  { id: 'maske', label: 'Profili za maske i maskice' },
  { id: 'l', label: 'L profili' },
  { id: 'h', label: 'H profili' },
  { id: 'z', label: 'Z profili' },
  { id: 'kose', label: 'Zakošene letvice' },
  { id: 'okrugle', label: 'Okrugle cevi' },
  { id: 'trake', label: 'Ostali profili, letvice i trake' },
  { id: 'kape', label: 'Kape' },
  { id: 'rozetne', label: 'Rozetne' },
  { id: 'stope', label: 'Stope' },
  { id: 'cepovi', label: 'Čepovi' },
  { id: 'okov', label: 'Okov (šarke, brave, nosači, vijci)' },
  { id: 'automatika', label: 'Automatika' },
  { id: 'ploce', label: 'Staklo i paneli' },
  { id: 'ostalo', label: 'Ostalo' },
];

/** Poprečni presek profila, centriran u (0, 0): u je širina (vidi se spreda kad presek nije okrenut), v je dubina. */
export interface Section {
  polys: { outline: Pt[]; holes: Pt[][] }[];
  w: number;
  h: number;
  /** okrugla cev: u 2D se ne crtaju skrivene ivice */
  round?: boolean;
}

/** Jednostavno telo u mm; koordinatni početak dela je sredina donje ivice (x udesno, y nagore, z ka posmatraču). */
export type Solid =
  | { prim: 'box'; size: [number, number, number]; pos: [number, number, number] }
  | { prim: 'cyl'; r: number; len: number; axis: 'x' | 'y' | 'z'; pos: [number, number, number] }
  /** piramida: pos je sredina osnove, vrh je nagore */
  | { prim: 'pyr'; base: [number, number]; h: number; pos: [number, number, number] };

export type MatShape =
  /** u: mere U profila (A širina, B visina, C zid) — profil može da bude bočna vođica u koju ulaze prečke */
  | { type: 'linear'; group: MaterialGroupId; section: Section; exact: boolean; u?: { a: number; b: number; c: number }; /** debljina zida (mm) ako presek ima zid koji se može menjati */ wall?: number }
  | { type: 'sheet'; group: MaterialGroupId; thick: number; glass: boolean }
  | { type: 'piece'; group: MaterialGroupId; solids: Solid[] };

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj');
const num = (s: string): number => parseFloat(s.replace(',', '.'));
const N = '(\\d+(?:[.,]\\d+)?)';

/** Mere iz naziva: „80×20×1 mm“, „80mmx80mm“, „A:25mm B:20mm C: 1,35mm“. */
export function dimsFromName(name: string): number[] {
  const abc = new RegExp(`a\\s*:\\s*${N}\\s*(?:mm)?\\s*b\\s*:\\s*${N}\\s*(?:mm)?(?:\\s*c\\s*:\\s*${N})?`, 'i').exec(name);
  if (abc) return abc.slice(1).filter(Boolean).map(num);
  const m = new RegExp(`${N}\\s*(?:mm)?\\s*[x×]\\s*${N}\\s*(?:mm)?(?:\\s*[x×]\\s*${N})?`, 'i').exec(name);
  return m ? m.slice(1).filter(Boolean).map(num) : [];
}

/** Prečnik (i debljina zida) iz naziva: „Ø50 × 2 mm“. */
function roundFromName(name: string): { d: number; wall: number } | null {
  const m = new RegExp(`[øØ⌀]\\s*${N}(?:\\s*[–-]\\s*\\d+)?(?:\\s*[x×]\\s*${N})?`).exec(name);
  if (!m) return null;
  const d = num(m[1]);
  return { d, wall: m[2] ? num(m[2]) : Math.max(1, Math.min(2, d / 12)) };
}

const parsePath = (path: string): Pt[][] =>
  path.split('Z').filter((s) => s.trim()).map((sub) => sub.replace(/^M/, '').split('L').map((p) => p.trim().split(/\s+/).map(Number) as Pt));

/** Presek iz tehničkog crteža profila (isti koji se vidi na strani Materijali i cene). */
export function sectionOfSpec(spec: ProfileSpec): Section {
  const geo = profileGeometry(spec);
  const subs = parsePath(geo.path).map((poly) => poly.map(([x, y]) => [x - geo.w / 2, y - geo.h / 2] as Pt));
  const polys = geo.fillRule === 'evenodd'
    ? [{ outline: subs[0], holes: subs[1] ? [subs[1]] : [] }, ...subs.slice(2).map((s) => ({ outline: s, holes: [] as Pt[][] }))]
    : subs.map((s) => ({ outline: s, holes: [] as Pt[][] }));
  return { polys, w: geo.w, h: geo.h };
}

const circle = (r: number, n = 40): Pt[] => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as Pt);
const roundSection = (d: number, wall: number): Section => ({ polys: [{ outline: circle(d / 2), holes: wall > 0 && wall < d / 2 ? [circle(d / 2 - wall)] : [] }], w: d, h: d, round: true });
const solidSection = (w: number, h: number): Section => ({ polys: [{ outline: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], holes: [] }], w, h });

/* ---------- komadni delovi (kape, stope, okov) ---------- */
const box = (w: number, h: number, d: number, x: number, y: number, z = 0): Solid => ({ prim: 'box', size: [w, h, d], pos: [x, y, z] });
const cyl = (r: number, len: number, axis: 'x' | 'y' | 'z', x: number, y: number, z = 0): Solid => ({ prim: 'cyl', r, len, axis, pos: [x, y, z] });

type PieceKind = 'cap_flat' | 'cap_pyramid' | 'rosette' | 'foot' | 'side_foot' | 'plug' | 'hinge' | 'lock' | 'wheel' | 'motor' | 'bracket' | 'ring' | 'screw' | 'box';

/** Tela komadnog dela; w × d je mera profila na koji deo ide (npr. kapa 80 × 80). */
export function pieceSolids(kind: PieceKind, w: number, d: number): Solid[] {
  switch (kind) {
    case 'cap_flat': return [box(w + 4, 5, d + 4, 0, 2.5)];
    case 'cap_pyramid': return [box(w + 4, 4, d + 4, 0, 2), { prim: 'pyr', base: [w + 2, d + 2], h: Math.max(12, w * 0.28), pos: [0, 4, 0] }];
    case 'rosette': return [box(w + 44, 4, d + 44, 0, 2), box(w + 14, 16, d + 14, 0, 12)];
    case 'foot': return [box(w + 60, 6, d + 60, 0, 3), box(w + 6, 70, d + 6, 0, 41)];
    case 'side_foot': return [box(6, Math.max(90, w + 50), d + 40, -3, Math.max(90, w + 50) / 2), box(60, w + 6, d + 6, 30, Math.max(90, w + 50) / 2)];
    case 'plug': return [box(w, 4, d, 0, 2), box(Math.max(2, w - 4), 12, Math.max(2, d - 4), 0, -6)];
    case 'hinge': return [cyl(9, 90, 'y', 0, 45), box(38, 60, 5, 22, 45), box(38, 60, 5, -22, 45)];
    case 'lock': return [box(34, 170, 44, 0, 85), box(22, 150, 4, 0, 85, 24), cyl(8, 110, 'x', 45, 105, 38), cyl(8, 24, 'z', 0, 105, 34), cyl(6, 6, 'z', 0, 60, 27)];
    case 'wheel': return [cyl(40, 22, 'z', 0, 40), box(100, 8, 44, 0, 86), box(6, 50, 44, -47, 60), box(6, 50, 44, 47, 60)];
    case 'motor': return [box(320, 240, 180, 0, 130), box(360, 10, 220, 0, 5), cyl(34, 30, 'z', 60, 90, 105)];
    case 'bracket': return [box(Math.max(30, w), 4, Math.max(25, d), 0, 2), box(4, Math.max(30, w), Math.max(25, d), -Math.max(30, w) / 2 + 2, Math.max(30, w) / 2)];
    case 'ring': return [cyl(w / 2 + 6, 14, 'y', 0, 7)];
    case 'screw': return [cyl(3, 28, 'z', 0, 0, 0), cyl(6.5, 4, 'z', 0, 0, 16)];
    default: return [box(w, w, d, 0, w / 2)];
  }
}

/** Okvir tela u pogledu spreda (x, y). */
export function solidsBounds(solids: Solid[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const s of solids) {
    let hw: number; let b: number; let t: number;
    if (s.prim === 'box') { hw = s.size[0] / 2; b = s.pos[1] - s.size[1] / 2; t = s.pos[1] + s.size[1] / 2; }
    else if (s.prim === 'pyr') { hw = s.base[0] / 2; b = s.pos[1]; t = s.pos[1] + s.h; }
    else { hw = s.axis === 'x' ? s.len / 2 : s.r; b = s.pos[1] - (s.axis === 'y' ? s.len / 2 : s.r); t = s.pos[1] + (s.axis === 'y' ? s.len / 2 : s.r); }
    x0 = Math.min(x0, s.pos[0] - hw); x1 = Math.max(x1, s.pos[0] + hw); y0 = Math.min(y0, b); y1 = Math.max(y1, t);
  }
  return { x0, y0, x1, y1 };
}

const piece = (group: MaterialGroupId, kind: PieceKind, w: number, d: number): MatShape => ({ type: 'piece', group, solids: pieceSolids(kind, w, d) });

const cache = new Map<string, MatShape>();

/** Oblik materijala (uvek postoji: nepoznat materijal dobija opšti oblik prema jedinici mere). */
type ShapeInput = Pick<Material, 'sku' | 'name' | 'unit' | 'category'> & { wallMm?: number };

export function materialShape(m: ShapeInput): MatShape {
  const key = `${m.sku}|${m.name}|${m.unit}|${m.category}|${m.wallMm ?? ''}`;
  let s = cache.get(key);
  if (!s) { s = resolveShape(m); cache.set(key, s); }
  return s;
}

function resolveShape(m: ShapeInput): MatShape {
  const spec = profileSpecFor(m);
  if (spec) {
    const group: MaterialGroupId = spec.kind === 'tube' ? 'kv' : spec.kind === 'u' ? 'u' : spec.kind === 'l' ? 'l' : spec.kind === 'h' ? 'h' : spec.kind === 'slant' ? 'kose'
      : spec.name === 'zmali' || spec.name === 'zveliki' ? 'z' : 'maske';
    return { type: 'linear', group, section: sectionOfSpec(spec), exact: true, u: spec.kind === 'u' ? { a: spec.a, b: spec.b, c: spec.c } : undefined, wall: specWall(spec) ?? undefined };
  }
  const n = norm(m.name);
  const dims = dimsFromName(m.name);
  const rd = roundFromName(m.name);
  const w = dims[0] ?? rd?.d ?? 60;
  const d = dims[1] ?? rd?.d ?? w;
  const has = (re: RegExp): boolean => re.test(n);

  // komadni delovi (naziv često sadrži i meru profila na koji idu, zato se proveravaju pre profila)
  if (has(/\bkap[aeu]\b/)) return piece('kape', has(/pismo|piramid|siljat/) ? 'cap_pyramid' : 'cap_flat', w, d);
  if (has(/rozetn/)) return piece('rozetne', 'rosette', w, d);
  if (has(/\bstop[aeu]\b/)) return piece('stope', has(/bocn/) ? 'side_foot' : 'foot', w, d);
  if (has(/\bcep\b|\bcepovi\b|\bcepa\b/)) return piece('cepovi', 'plug', w, d);
  if (has(/sark/)) return piece('okov', 'hinge', w, d);
  if (has(/brav|kvak/)) return piece('okov', 'lock', w, d);
  if (has(/tocki/)) return piece('okov', 'wheel', w, d);
  if (has(/motor|automatik|pogon/) || m.category === 'automatika') return piece('automatika', 'motor', w, d);
  if (has(/vijak|vijci|sraf|zakiv|sidro|anker|tipl/)) return piece('okov', 'screw', w, d);
  if (has(/prsten|maska stuba/)) return piece('okov', 'ring', rd?.d ?? 40, rd?.d ?? 40);
  if (has(/nosac|spojnic|veza|zglob|kolen|zavrsetak|podlosk|drzac|ugaonik|sidrenje|savijanje/)) return piece('okov', 'bracket', Math.min(w, 60), Math.min(d, 60));

  // ploče
  if (m.unit === 'm2' || m.category === 'staklo' || m.category === 'panel' || has(/stakl|\bpanel\b|\blim\b|ploca/)) {
    if (!has(/panel-profil|profil/)) {
      const t = new RegExp(`${N}\\s*mm`).exec(m.name);
      return { type: 'sheet', group: 'ploce', thick: t ? num(t[1]) : has(/stakl/) ? 8 : 3, glass: has(/stakl/) || m.category === 'staklo' };
    }
  }

  // profili po nazivu
  if (rd) { const w = Math.min(m.wallMm ?? rd.wall, rd.d / 2 - 0.05); return { type: 'linear', group: 'okrugle', section: roundSection(rd.d, w), exact: true, wall: w }; }
  const wall = m.wallMm ?? dims[2] ?? 1.5;
  if (has(/\bu[- ]?profil|^u \d/)) {
    const u = { a: dims[0] ?? 20, b: dims[1] ?? 20, c: Math.min(wall, Math.min(dims[0] ?? 20, dims[1] ?? 20) / 2 - 0.05) };
    return { type: 'linear', group: 'u', section: sectionOfSpec({ kind: 'u', ...u }), exact: dims.length >= 2, u, wall: u.c };
  }
  if (has(/\bl[- ]?profil|ugaoni profil/)) return { type: 'linear', group: 'l', section: sectionOfSpec({ kind: 'l', a: dims[0] ?? 20, b: dims[1] ?? 20, c: wall }), exact: dims.length >= 2, wall };
  if (has(/\bh[- ]?profil/)) return { type: 'linear', group: 'h', section: sectionOfSpec({ kind: 'h', width: dims[0] ?? 60, up: 20, down: 10, t: 1.2 }), exact: false };
  if (has(/\bz[- ]?profil/)) return { type: 'linear', group: 'z', section: sectionOfSpec({ kind: 'shape', name: 'zmali' }), exact: false };
  if (has(/zakosen/)) return { type: 'linear', group: 'kose', section: sectionOfSpec({ kind: 'slant', width: dims[0] ?? 80, height: dims[1] ?? 20, wall: m.wallMm ?? dims[2] ?? 1, offset: 25.6 }), exact: false, wall: m.wallMm ?? dims[2] ?? 1 };
  if (has(/traka|flah|lajsn|maskic/)) return { type: 'linear', group: 'trake', section: solidSection(dims[0] ?? 30, dims[1] ?? 3), exact: dims.length >= 2 };
  const profileWord = has(/cev|kutij|letvic|lamel|dask|profil|stub|tarabic|rukohvat|precka|sipka/);
  if (profileWord || m.unit === 'm') {
    const a = dims[0] ?? 40; const b = dims[1] ?? 20;
    const c = Math.min(wall, Math.min(a, b) / 2 - 0.1);
    return { type: 'linear', group: has(/cev|kutij|stub/) ? 'kv' : 'trake', section: sectionOfSpec({ kind: 'tube', a, b, c }), exact: dims.length >= 2, wall: c };
  }
  if (m.category === 'okov') return piece('okov', 'bracket', Math.min(w, 60), Math.min(d, 60));
  return piece('ostalo', 'box', w, d);
}

/** Presek okrenut oko ose profila za 0 / 90 / 180 / 270°. */
export function rotatePt([u, v]: Pt, rot: number): Pt {
  switch (((rot % 360) + 360) % 360) {
    case 90: return [-v, u];
    case 180: return [-u, -v];
    case 270: return [v, -u];
    default: return [u, v];
  }
}

/** Tačka preseka okrenuta za proizvoljan ugao (stepeni, suprotno od kazaljke); pravi uglovi su tačni. */
export function rotateDeg(pt: Pt, deg: number): Pt {
  const q = ((deg % 360) + 360) % 360;
  if (Math.abs(q - Math.round(q / 90) * 90) < 1e-9) return rotatePt(pt, Math.round(q / 90) * 90);
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a); const s = Math.sin(a);
  return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c];
}

export interface SectionExtent { face: number; depth: number; u0: number; u1: number; v0: number; v1: number }

/**
 * Presek okrenut za ugao (okretanje + nagib): face je širina koja se vidi spreda (u0…u1, upravno na osu u ravni crteža),
 * depth je dubina profila (v0…v1, ka posmatraču).
 */
export function sectionFace(section: Section, deg: number): SectionExtent {
  let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
  for (const p of section.polys) for (const pt of p.outline) {
    const [u, v] = rotateDeg(pt, deg);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { face: r(u1 - u0), depth: r(v1 - v0), u0: r(u0), u1: r(u1), v0: r(v0), v1: r(v1) };
}

/** Položaji uzdužnih ivica profila u pogledu spreda (za tanke linije koje pokazuju zidove profila). */
export function sectionEdgeLines(section: Section, deg: number): number[] {
  if (section.round) return [];
  const { u0, u1 } = sectionFace(section, deg);
  const out = new Set<number>();
  for (const p of section.polys) for (const poly of [p.outline, ...p.holes]) for (const pt of poly) {
    const u = Math.round(rotateDeg(pt, deg)[0] * 10) / 10;
    if (u > u0 + 0.05 && u < u1 - 0.05) out.add(u);
  }
  return [...out].slice(0, 12);
}

/** Boja dela: RAL iz naziva materijala, inox po nazivu, inače boja modela (null). */
export function materialOwnColor(name: string): string | null {
  const ral = /ral\s*(\d{4})/i.exec(name);
  if (ral) { const c = RAL_COLORS.find((x) => x.key === `RAL ${ral[1]}`); if (c) return c.hex; }
  if (/inox|nerđaj|nerdjaj/i.test(name)) return RAL_COLORS.find((x) => x.key === 'INOX')!.hex;
  return null;
}
