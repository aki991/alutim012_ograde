import { RAL_COLORS } from './catalog';
import { profileGeometry, profileSpecFor, specDimFields, specWall, withDims, type DimField, type ProfileSpec, type Pt } from './profileDrawings';

export type { DimField } from './profileDrawings';
import type { Material } from './types';
import { drawnBounds, drawnPolys, drawnValid } from './drawnSection';

/**
 * Oblik materijala za crtanje modela: svaki materijal iz cenovnika dobija poprečni presek (profili), ploču (staklo, paneli)
 * ili sklop jednostavnih tela (kape, stope, čepovi, okov). Isti opis koriste 2D crtež i 3D prikaz.
 * Oblik se određuje po šifri (tačni crteži iz cenovnika), a inače po nazivu i merama u nazivu.
 */

export type MaterialGroupId =
  | 'kv' | 'c' | 'u' | 'maske' | 'l' | 'h' | 'z' | 'kose' | 'okrugle' | 'trake'
  | 'kape' | 'rozetne' | 'stope' | 'cepovi' | 'okov' | 'automatika' | 'ploce'
  | TerraceGroupId | 'ostalo';

/** Grupe materijala za ograde za terase (crtanje ograda za terase nudi samo njih). */
export type TerraceGroupId = 't_stubovi' | 't_rukohvati' | 't_ispuna' | 't_staklo' | 't_veze' | 't_kolena' | 't_drzaci' | 't_montaza' | 't_zavrseci' | 't_ostalo';

export const MATERIAL_GROUPS: { id: MaterialGroupId; label: string }[] = [
  { id: 'kv', label: 'Kvadratne i pravougaone cevi' },
  { id: 'c', label: 'C profili (šine kliznih kapija)' },
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
  { id: 't_stubovi', label: 'Stubovi terase i maskice' },
  { id: 't_rukohvati', label: 'Rukohvati' },
  { id: 't_ispuna', label: 'Prečke i profili ispune' },
  { id: 't_staklo', label: 'Staklo i kanali za staklo' },
  { id: 't_veze', label: 'Veze stuba i rukohvata' },
  { id: 't_kolena', label: 'Kolena, zglobovi i spojnice' },
  { id: 't_drzaci', label: 'Držači prečki i stezaljke stakla' },
  { id: 't_montaza', label: 'Flanše, maske i montaža' },
  { id: 't_zavrseci', label: 'Završeci i kape (terase)' },
  { id: 't_ostalo', label: 'Ostali okov za terase' },
  { id: 'ostalo', label: 'Ostalo' },
];

/** Materijal za ograde za terase: označen u cenovniku, ili BTS materijal koji je došao uz aplikaciju (ID mat_bts_… / mat_ter_…). */
export const isTerraceMaterial = (m: { id?: string; terrace?: boolean }): boolean => m.terrace ?? /^mat_(bts|ter)_/.test(m.id ?? '');

/** Grupa materijala za terase po vrsti oblika i nazivu (stub, rukohvat, prečka, staklo, veza, koleno, držač, flanša, završetak). */
function terraceGroup(name: string, shape: MatShape): TerraceGroupId {
  const n = norm(name);
  const has = (re: RegExp): boolean => re.test(n);
  if (shape.type === 'sheet') return 't_staklo';
  if (shape.type === 'linear') {
    if (has(/za staklo|gumen/)) return 't_staklo';
    if (has(/rukohvat/)) return 't_rukohvati';
    if (has(/stub/)) return 't_stubovi';
    return 't_ispuna';
  }
  if (has(/stezaljk|granicnik|prsten za|drzac|nosac prec|ispun/)) return 't_drzaci';
  if (has(/klin/)) return 't_staklo';
  if (has(/kapijic|juliet/)) return 't_ostalo';
  if (has(/zid|plafon|flans|mask|stop[aeu]|obujmic|anker|sidr|vijak|spigot/)) return 't_montaza';
  if (has(/vrh stuba|zavrset|\bkap[aeu]\b|kugl|\bcep/)) return 't_zavrseci';
  if (has(/veza/)) return 't_veze';
  if (has(/kolen|zglob|ugao|ugaon|spojnic|skretnic/)) return 't_kolena';
  return 't_ostalo';
}

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

/** Svi prečnici iz naziva redom: „Veza stub Ø40 – rukohvat Ø50“ → [40, 50]. */
export function diasOfName(name: string): number[] {
  return [...name.matchAll(new RegExp(`[øØ⌀]\\s*${N}`, 'g'))].map((m) => num(m[1]));
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

/** C profil po nazivu („C profil 60x60x2“): isti univerzalan presek za sve mere; null kad naziv nije C profil */
export function cProfileSpec(m: ShapeInput): ProfileSpec | null {
  if (!/\bc[- ]?profil/.test(norm(m.name))) return null;
  const dims = dimsFromName(m.name);
  const a = dims[0] ?? 60; const b = dims[1] ?? a;
  return withDims({ kind: 'c', a, b, c: Math.min(m.wallMm ?? dims[2] ?? 2, Math.min(a, b) / 2 - 0.05) }, m.dims);
}

/** Ključ za pretragu: bez razlike velikih i malih slova, kvačica, „×“ = „x“ = „X“, zarez = tačka. */
export const searchKey = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').replace(/[×✕*]/g, 'x').replace(/,/g, '.').replace(/\s+/g, ' ').trim();

/** Da li tekst odgovara pretrazi: svaka reč iz upita mora da se nađe (npr. „60x20“ nalazi „Kvadratna cev 60×20×1“). */
export function matchesSearch(text: string, query: string): boolean {
  const q = searchKey(query);
  if (!q) return true;
  const hay = searchKey(text);
  return q.split(' ').every((w) => hay.includes(w));
}

const circle = (r: number, n = 40): Pt[] => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as Pt);
const roundSection = (d: number, wall: number): Section => ({ polys: [{ outline: circle(d / 2), holes: wall > 0 && wall < d / 2 ? [circle(d / 2 - wall)] : [] }], w: d, h: d, round: true });
const solidSection = (w: number, h: number): Section => ({ polys: [{ outline: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], holes: [] }], w, h });

/* ---------- komadni delovi (kape, stope, okov) ---------- */
const box = (w: number, h: number, d: number, x: number, y: number, z = 0): Solid => ({ prim: 'box', size: [w, h, d], pos: [x, y, z] });
const cyl = (r: number, len: number, axis: 'x' | 'y' | 'z', x: number, y: number, z = 0): Solid => ({ prim: 'cyl', r, len, axis, pos: [x, y, z] });

type PieceKind = 'cap_flat' | 'cap_pyramid' | 'rosette' | 'foot' | 'side_foot' | 'plug' | 'hinge' | 'lock' | 'wheel' | 'motor' | 'bracket' | 'ring' | 'screw' | 'box'
  | 'flange_round' | 'holder' | 'end_cap' | 'connector';

/**
 * Mere okova ograde za terasu (mm), „Mere ograde“: zavise od materijala koji radionica koristi, pa se podešavaju po modelu.
 * Podrazumevane vrednosti su procena prema katalogu BTS.
 */
export interface HwDims {
  /** visina veze stub–rukohvat: od vrha stuba (ili kape) do donje ivice rukohvata */
  connectorH: number;
  /** prečnik vrata veze (uži deo između stuba i ploče pod rukohvatom) */
  connectorNeckD: number;
  /** dužina ploče veze duž rukohvata */
  connectorPlateLen: number;
  /** debljina ploče veze pod rukohvatom */
  connectorPlateT: number;
  /** visina kape na vrhu stuba */
  capH: number;
  /** debljina ploče flanše: za toliko je stub podignut od poda */
  plateH: number;
  /** prepust ploče flanše oko stuba (poluprečnik ploče = poluprečnik stuba + prepust) */
  plateOver: number;
  /** visina čaure flanše iznad ploče */
  sleeveH: number;
  /** rastojanje ose prečke od prednje ivice stuba (prsten naleže na stub); bez vrednosti: poluprečnik prečke + 7 */
  rodOffset?: number;
  /** dužina kapice na kraju cevi */
  endCapLen: number;
  /** zavrtnji po komadu okova (idu u spisak materijala) */
  screwsHolder: number;
  screwsConnector: number;
  screwsFlange: number;
}

export const DEFAULT_HW_DIMS: HwDims = {
  connectorH: 30, connectorNeckD: 24, connectorPlateLen: 44, connectorPlateT: 4, capH: 14, plateH: 8, plateOver: 32, sleeveH: 50, endCapLen: 8,
  screwsHolder: 1, screwsConnector: 3, screwsFlange: 3,
};

/** Mere okova modela: podrazumevane, sa izmenama iz „Mere ograde“ (neispravne vrednosti se preskaču). */
export function hwDimsOf(over?: Partial<HwDims>): HwDims {
  const out: HwDims = { ...DEFAULT_HW_DIMS };
  for (const [k, v] of Object.entries(over ?? {})) if (typeof v === 'number' && Number.isFinite(v) && v >= 0) (out as unknown as Record<string, number>)[k] = v;
  return out;
}

/** Poluprečnik prstena za prečku Ø d: prsten naleže na stub, a osa prečke je za toliko ispred prednje ivice stuba. */
export const holderRadius = (rodDia: number, dims: HwDims = DEFAULT_HW_DIMS): number => Math.max(rodDia / 2 + 2, dims.rodOffset ?? rodDia / 2 + 7);

/**
 * Tela komadnog dela; w × d je mera profila na koji deo ide (npr. kapa 80 × 80). Okov ograda za terase: flanša (w = prečnik stuba),
 * prsten prečke (w = prečnik prečke, d = prečnik stuba), kapica (w = prečnik cevi) i veza (w = prečnik stuba, d = prečnik rukohvata).
 * Početak dela je tačka naleganja: flanša i veza — sredina donje ivice, prsten — osa prečke, kapica — kraj cevi (telo ide u +x).
 */
export function pieceSolids(kind: PieceKind, w: number, d: number, dims: HwDims = DEFAULT_HW_DIMS): Solid[] {
  switch (kind) {
    case 'flange_round': return [cyl(w / 2 + dims.plateOver, dims.plateH, 'y', 0, dims.plateH / 2), cyl(w / 2 + 5, dims.sleeveH, 'y', 0, dims.plateH + dims.sleeveH / 2)];
    case 'holder': { const R = holderRadius(w, dims); return [cyl(R, 28, 'x', 0, 0, 0), cyl(3.5, 8, 'z', 0, 0, R + 2)]; }
    case 'end_cap': return [cyl(w / 2 + 1.5, dims.endCapLen, 'x', dims.endCapLen / 2, 0, 0)];
    case 'connector': {
      // kao na fotografiji: uži vrat sa prstenom na vrhu stuba i ravna ploča pod rukohvatom
      const t = Math.min(dims.connectorPlateT, dims.connectorH);
      const neckH = Math.max(1, dims.connectorH - t);
      const shoulder = Math.min(5, neckH);
      return [
        cyl(w / 2 - 0.5, shoulder, 'y', 0, shoulder / 2),
        cyl(Math.max(2, dims.connectorNeckD / 2), neckH, 'y', 0, neckH / 2),
        box(dims.connectorPlateLen, t, Math.max(10, d * 0.8), 0, dims.connectorH - t / 2),
      ];
    }
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
    case 'ring': return [cyl(w / 2 + 6, dims.capH, 'y', 0, dims.capH / 2)];
    case 'screw': return [cyl(3, 28, 'z', 0, 0, 0), cyl(6.5, 4, 'z', 0, 0, 16)];
    default: return [box(w, w, d, 0, w / 2)];
  }
}

/** Najniža tačka tela po dubini (z): zadnja strana komadnog dela. */
export function solidsZMin(solids: Solid[]): number {
  let z = Infinity;
  for (const s of solids) {
    if (s.prim === 'box') z = Math.min(z, s.pos[2] - s.size[2] / 2);
    else if (s.prim === 'pyr') z = Math.min(z, s.pos[2] - s.base[1] / 2);
    else z = Math.min(z, s.pos[2] - (s.axis === 'z' ? s.len / 2 : s.r));
  }
  return Number.isFinite(z) ? z : 0;
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

const piece = (group: MaterialGroupId, kind: PieceKind, w: number, d: number, dims?: HwDims): MatShape => ({ type: 'piece', group, solids: pieceSolids(kind, w, d, dims) });

/** Mere kolica samonoseće kapije (mm): ploča sa otvorima za sidrenje, nosač i telo sa valjcima koji idu u C-profil. */
export interface CarriageParams { plateW: number; plateD: number; plateH: number; stemW: number; stemH: number; wheelD: number; wheelGap: number }

export const CARRIAGE_FIELDS: { key: keyof CarriageParams; label: string; def: number }[] = [
  { key: 'plateW', label: 'Dužina ploče', def: 210 }, { key: 'plateD', label: 'Širina ploče', def: 100 }, { key: 'plateH', label: 'Debljina ploče', def: 30 },
  { key: 'stemW', label: 'Širina nosača', def: 86 }, { key: 'stemH', label: 'Visina nosača', def: 90 },
  { key: 'wheelD', label: 'Prečnik valjka', def: 52 }, { key: 'wheelGap', label: 'Razmak valjaka (osa–osa)', def: 68 },
];

/** Kolica: ploča sa četiri vijka, nosač i telo sa četiri valjka (valjci su u C-profilu i sa strane se ne vide). */
export function carriageSolids(p: CarriageParams): Solid[] {
  const bodyH = p.wheelD + 16;
  const by = p.plateH + p.stemH + bodyH / 2;
  const out: Solid[] = [box(p.plateW, p.plateH, p.plateD, 0, p.plateH / 2), box(p.stemW * 0.5, p.stemH, p.plateD * 0.35, 0, p.plateH + p.stemH / 2), box(p.wheelGap + p.wheelD * 0.8, bodyH, p.plateD * 0.5, 0, by)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push(cyl(p.wheelD / 2, 14, 'z', (sx * p.wheelGap) / 2, by, sz * p.plateD * 0.3));
    out.push(cyl(7, 4, 'y', sx * (p.plateW / 2 - 18), p.plateH + 2, sz * (p.plateD / 2 - 18)));
  }
  return out;
}

const cache = new Map<string, Resolved>();

/** Oblik materijala (uvek postoji: nepoznat materijal dobija opšti oblik prema jedinici mere). */
type ShapeInput = Pick<Material, 'sku' | 'name' | 'unit' | 'category'> & { id?: string; terrace?: boolean; wallMm?: number; dims?: Record<string, number>; drawn?: Material['drawn'] };

/** Ključ oblika materijala: isti ključ = isti presek (za keš oblika i 3D tela). */
export const materialKey = (m: ShapeInput): string => `${m.sku}|${m.name}|${m.unit}|${m.category}|${m.wallMm ?? ''}|${m.dims ? JSON.stringify(m.dims) : ''}|${m.drawn ? JSON.stringify(m.drawn) : ''}|${isTerraceMaterial(m) ? 't' : ''}`;

/**
 * Oblik materijala sa merama okova modela („Mere ograde“): isti kao materialShape, a okov ograde za terasu (flanša, prsten, veza, kapica)
 * se crta prema merama modela. Ostali materijali su isti kao u materialShape.
 */
export function materialShapeWith(m: ShapeInput, dims: HwDims): MatShape {
  return resolved(m, dims).shape;
}

function resolved(m: ShapeInput, dims?: HwDims): Resolved {
  const key = dims ? `${materialKey(m)}|${JSON.stringify(dims)}` : materialKey(m);
  let s = cache.get(key);
  if (!s) {
    s = resolveShape(m, dims);
    // materijal za terase: isti oblik, a grupa je jedna od grupa za terase (stubovi, rukohvati, prečke, staklo, okov)
    if (isTerraceMaterial(m)) s = { ...s, shape: { ...s.shape, group: terraceGroup(m.name, s.shape) } };
    cache.set(key, s);
  }
  return s;
}

export function materialShape(m: ShapeInput): MatShape {
  return resolved(m).shape;
}

/** Mere preseka materijala koje se mogu ručno menjati (A, B, debljina zida, otvor …); prazno za oblike bez mera. */
export function materialDimFields(m: ShapeInput): DimField[] {
  return resolved(m).fields;
}

/** Oblik materijala i mere preseka koje se mogu ručno menjati. */
interface Resolved { shape: MatShape; fields: DimField[] }
const plain = (shape: MatShape): Resolved => ({ shape, fields: [] });
const fromSpec = (spec: ProfileSpec, group: MaterialGroupId, exact: boolean): Resolved => ({
  shape: { type: 'linear', group, section: sectionOfSpec(spec), exact, u: spec.kind === 'u' ? { a: spec.a, b: spec.b, c: spec.c } : undefined, wall: specWall(spec) ?? undefined },
  fields: specDimFields(spec),
});

const DRAWN_GROUP: Record<NonNullable<Material['drawn']>['kind'], MaterialGroupId> = { u: 'u', c: 'c', l: 'l', z: 'z', kv: 'kv', traka: 'trake', ostalo: 'trake' };

/** Presek iz ručno nacrtane linije zida, centriran u (0, 0); debljina zida materijala (wallMm) ima prednost nad nacrtanom. */
export function sectionOfDrawn(d: NonNullable<Material['drawn']>, wallMm?: number): Section {
  const polys = drawnPolys({ ...d, wall: wallMm && wallMm > 0 ? wallMm : d.wall });
  const b = drawnBounds(polys);
  const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2;
  const mv = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x - cx, y - cy] as Pt);
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return { polys: polys.map((p) => ({ outline: mv(p.outline), holes: p.holes.map(mv) })), w: r(b.x1 - b.x0), h: r(b.y1 - b.y0) };
}

function resolveShape(m: ShapeInput, hwd?: HwDims): Resolved {
  // ručno nacrtan presek ima prednost nad presekom iz šifre i naziva
  if (drawnValid(m.drawn)) {
    const d = m.drawn;
    const wall = m.wallMm && m.wallMm > 0 ? m.wallMm : d.wall;
    const section = sectionOfDrawn(d, m.wallMm);
    return {
      shape: { type: 'linear', group: DRAWN_GROUP[d.kind] ?? 'trake', section, exact: true, wall, u: d.kind === 'u' ? { a: section.w, b: section.h, c: wall } : undefined },
      fields: [{ key: 'c', label: d.kind === 'traka' ? 'Debljina' : 'Debljina zida', value: wall, wall: true }],
    };
  }
  const ov = m.dims ?? {};
  const spec = profileSpecFor(m);
  if (spec) {
    const group: MaterialGroupId = spec.kind === 'tube' ? 'kv' : spec.kind === 'c' ? 'c' : spec.kind === 'u' ? 'u' : spec.kind === 'l' ? 'l' : spec.kind === 'h' ? 'h' : spec.kind === 'slant' ? 'kose'
      : spec.name === 'zmali' || spec.name === 'zveliki' ? 'z' : 'maske';
    return fromSpec(spec, group, true);
  }
  const n = norm(m.name);
  const dims = dimsFromName(m.name);
  const rd = roundFromName(m.name);
  const w = dims[0] ?? rd?.d ?? 60;
  const d = dims[1] ?? rd?.d ?? w;
  const has = (re: RegExp): boolean => re.test(n);
  const posOv = (k: string): number | undefined => { const v = ov[k]; return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined; };

  // kolica samonoseće kapije: sve mere se mogu menjati (mere iz naziva su dužina i širina ploče)
  if (has(/\bkolic/)) {
    const cp = {} as CarriageParams;
    for (const f of CARRIAGE_FIELDS) cp[f.key] = posOv(f.key) ?? (f.key === 'plateW' ? dims[0] : f.key === 'plateD' ? dims[1] : undefined) ?? f.def;
    return { shape: { type: 'piece', group: 'okov', solids: carriageSolids(cp) }, fields: CARRIAGE_FIELDS.map((f) => ({ key: f.key, label: f.label, value: cp[f.key] })) };
  }

  // komadni delovi (naziv često sadrži i meru profila na koji idu, zato se proveravaju pre profila)
  // okov ograda za terase sa prečnikom (Ø) u nazivu: pravi oblici flanše, prstena prečke, veze stub–rukohvat i kapice na kraju cevi
  const dias = diasOfName(m.name);
  if (dias.length) {
    if (has(/flans|\bstop[aeu]\b|prirubnic/)) return plain(piece('stope', 'flange_round', dias[0], dias[0], hwd));
    if (has(/prsten za prec|nosac prec|drzac prec/)) return plain(piece('okov', 'holder', dias[0], dias[1] ?? 40, hwd));
    if (has(/veza stub/) && has(/rukohvat/) && dias.length >= 2) return plain(piece('okov', 'connector', dias[0], dias[1], hwd));
    if (has(/zavrsetak (prec|rukohvat|cevi)|kapica prec/)) return plain(piece('okov', 'end_cap', dias[0], dias[0], hwd));
  }
  // okov ograda za terase: flanše, bočne obujmice, spigoti i stezaljke stakla (pre provere „staklo“, da ne postanu ploča)
  if (has(/flans/)) return plain(piece('rozetne', 'rosette', w, d));
  if (has(/obujmic/)) return plain(piece('stope', 'side_foot', w, d));
  if (has(/spigot/)) return plain(piece('stope', 'foot', Math.min(w, 60), Math.min(d, 60)));
  if (has(/stezaljk|granicnik|spider|kugl|topuz/)) return plain(piece('okov', 'bracket', Math.min(w, 60), Math.min(d, 60)));
  if (has(/\bkap[aeu]\b/)) return plain(piece('kape', has(/pismo|piramid|siljat/) ? 'cap_pyramid' : 'cap_flat', w, d));
  if (has(/rozetn/)) return plain(piece('rozetne', 'rosette', w, d));
  if (has(/\bstop[aeu]\b/)) return plain(piece('stope', has(/bocn/) ? 'side_foot' : 'foot', w, d));
  if (has(/\bcep\b|\bcepovi\b|\bcepa\b/)) return plain(piece('cepovi', 'plug', w, d));
  if (has(/sark/)) return plain(piece('okov', 'hinge', w, d));
  if (has(/brav|kvak/)) return plain(piece('okov', 'lock', w, d));
  if (has(/tocki/)) return plain(piece('okov', 'wheel', w, d));
  if (has(/motor|automatik|pogon/) || m.category === 'automatika') return plain(piece('automatika', 'motor', w, d));
  if (has(/vijak|vijci|sraf|zakiv|sidro|anker|tipl/)) return plain(piece('okov', 'screw', w, d));
  if (has(/prsten|maska stuba/)) return plain(piece('okov', 'ring', rd?.d ?? 40, rd?.d ?? 40, hwd));
  if (has(/nosac|spojnic|veza|zglob|kolen|zavrsetak|podlosk|drzac|ugaonik|sidrenje|savijanje/)) return plain(piece('okov', 'bracket', Math.min(w, 60), Math.min(d, 60)));

  // ploče
  if (m.unit === 'm2' || m.category === 'staklo' || m.category === 'panel' || has(/stakl|\bpanel\b|\blim\b|ploca/)) {
    if (!has(/panel-profil|profil/)) {
      const t = new RegExp(`${N}\\s*mm`).exec(m.name);
      const thick = typeof ov.t === 'number' && ov.t > 0 ? ov.t : t ? num(t[1]) : has(/stakl/) ? 8 : 3;
      return { shape: { type: 'sheet', group: 'ploce', thick, glass: has(/stakl/) || m.category === 'staklo' }, fields: [{ key: 't', label: 'Debljina', value: thick }] };
    }
  }

  // profili po nazivu (mere iz naziva, pa ručno izmenjene mere materijala)
  const pos = (k: string): number | undefined => { const v = ov[k]; return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined; };
  if (rd) {
    const dia = pos('d') ?? rd.d;
    const wl = Math.min(m.wallMm ?? rd.wall, dia / 2 - 0.05);
    return { shape: { type: 'linear', group: 'okrugle', section: roundSection(dia, wl), exact: true, wall: wl }, fields: [{ key: 'd', label: 'Prečnik', value: dia }, { key: 'c', label: 'Debljina zida', value: wl, wall: true }] };
  }
  const wall = m.wallMm ?? dims[2] ?? 1.5;
  const cSpec = cProfileSpec(m);
  if (cSpec) return fromSpec(cSpec, 'c', dims.length >= 2);
  if (has(/\bu[- ]?profil|^u \d/)) {
    const a0 = dims[0] ?? 20; const b0 = dims[1] ?? 20;
    return fromSpec(withDims({ kind: 'u', a: a0, b: b0, c: Math.min(wall, Math.min(a0, b0) / 2 - 0.05) }, ov), 'u', dims.length >= 2);
  }
  if (has(/\bl[- ]?profil|ugaoni profil/)) return fromSpec(withDims({ kind: 'l', a: dims[0] ?? 20, b: dims[1] ?? 20, c: wall }, ov), 'l', dims.length >= 2);
  if (has(/\bh[- ]?profil/)) return fromSpec(withDims({ kind: 'h', width: dims[0] ?? 60, up: 20, down: 10, t: m.wallMm ?? 1.2 }, ov), 'h', false);
  if (has(/\bz[- ]?profil/)) return fromSpec({ kind: 'shape', name: 'zmali' }, 'z', false);
  if (has(/zakosen/)) return fromSpec(withDims({ kind: 'slant', width: dims[0] ?? 80, height: dims[1] ?? 20, wall: m.wallMm ?? dims[2] ?? 1, offset: 25.6 }, ov), 'kose', false);
  if (has(/traka|flah|lajsn|maskic/)) {
    const a = pos('a') ?? dims[0] ?? 30; const b = pos('b') ?? dims[1] ?? 3;
    return { shape: { type: 'linear', group: 'trake', section: solidSection(a, b), exact: dims.length >= 2 }, fields: [{ key: 'a', label: 'Širina', value: a }, { key: 'b', label: 'Debljina', value: b }] };
  }
  const profileWord = has(/cev|kutij|letvic|lamel|dask|profil|stub|tarabic|rukohvat|precka|sipka/);
  if (profileWord || m.unit === 'm') {
    const a0 = dims[0] ?? 40; const b0 = dims[1] ?? 20;
    const r = fromSpec(withDims({ kind: 'tube', a: a0, b: b0, c: Math.min(wall, Math.min(a0, b0) / 2 - 0.1) }, ov), has(/cev|kutij|stub/) ? 'kv' : 'trake', dims.length >= 2);
    return r;
  }
  if (m.category === 'okov') return plain(piece('okov', 'bracket', Math.min(w, 60), Math.min(d, 60)));
  return plain(piece('ostalo', 'box', w, d));
}

/**
 * Presek je pravougaonik (puna traka ili cev sa pravougaonim otvorom), pa se okreće samo „čeonom stranom“: koja stranica preseka
 * je okrenuta ka posmatraču (npr. 60 ili 40 kod cevi 60×40). Profili sa otvorom ili krakom (U, L, C, H …) nisu takvi: kod njih je bitno
 * i na koju stranu gleda otvor, pa se okreću uglom.
 */
export function isSymmetricRect(section: Section): boolean {
  if (section.round || section.polys.length !== 1) return false;
  const { outline, holes } = section.polys[0];
  const rect = (pts: Pt[]): boolean => {
    if (pts.length !== 4) return false;
    const xs = [...new Set(pts.map((p) => Math.round(p[0] * 1000)))]; const ys = [...new Set(pts.map((p) => Math.round(p[1] * 1000)))];
    return xs.length === 2 && ys.length === 2 && xs[0] + xs[1] === 0 && ys[0] + ys[1] === 0;
  };
  return rect(outline) && (holes.length === 0 || (holes.length === 1 && rect(holes[0])));
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
  if (/inox|nerđaj|nerdjaj/i.test(name)) return '#B7BEC6';
  return null;
}

/**
 * Redosled materijala u spiskovima: po grupi (kvadratne cevi, U profili, … kao u crtanju modela), pa po merama od najmanje
 * do najveće (npr. 20×20, 30×20, 40×40, 80×20 … ; okrugle cevi po prečniku), pa po nazivu.
 */
export function compareMaterials(a: ShapeInput, b: ShapeInput): number {
  const order = (m: ShapeInput) => { const i = MATERIAL_GROUPS.findIndex((g) => g.id === materialShape(m).group); return i < 0 ? MATERIAL_GROUPS.length : i; };
  const dims = (m: ShapeInput): number[] => { const d = dimsFromName(m.name); if (d.length) return d; const r = roundFromName(m.name); return r ? [r.d, r.wall] : []; };
  const g = order(a) - order(b);
  if (g) return g;
  const da = dims(a); const db = dims(b);
  if (da.length && !db.length) return -1;
  if (!da.length && db.length) return 1;
  for (let i = 0; i < Math.max(da.length, db.length); i++) {
    const x = da[i] ?? 0; const y = db[i] ?? 0;
    if (x !== y) return x - y;
  }
  return a.name.localeCompare(b.name, 'sr', { numeric: true });
}

/**
 * Izmena mera A × B × C u nazivu: ako naziv sadrži stare mere (npr. „C profil 60×60×2“), upisuju se nove („C profil 60×60×1,5“).
 * Naziv bez tih mera se ne menja.
 */
export function syncNameDims(name: string, before: DimField[], after: DimField[]): string {
  const keys = ['a', 'b', 'c'];
  const olds = keys.map((k) => before.find((f) => f.key === k)?.value);
  const news = keys.map((k) => after.find((f) => f.key === k)?.value);
  if (olds[0] === undefined || olds[1] === undefined || news[0] === undefined || news[1] === undefined) return name;
  const pat = (v: number) => String(v).replace(/\./g, '[.,]');
  const x = '\\s*[x×X]\\s*';
  const re = new RegExp('(?<![\\d.,])' + pat(olds[0]) + x + pat(olds[1]) + '(?:' + x + (olds[2] !== undefined ? pat(olds[2]) : '\\d+(?:[.,]\\d+)?') + ')?(?![\\d])');
  const m = re.exec(name);
  if (!m) return name;
  const f = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
  const hasThird = /[x×X][^x×X]*[x×X]/i.test(m[0]);
  const repl = f(news[0]) + '×' + f(news[1]) + (hasThird && news[2] !== undefined ? '×' + f(news[2]) : '');
  return name.replace(re, repl);
}

