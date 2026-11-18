import { hingeCountFor } from '../gates/hingeRule';
import { customLiftOf, customModelOf, customPatternCounts, customReinforceRows, customReinforceSplit, customSlatCount, customSpec } from './customRegistry';
import { tubeLengthMm, ramInsets } from './tubes';
import { computeInfill, summarizeInfill } from '../geometry/infill';
import { CALC_RULES } from '../pricing/rules';
import { FENCE_MODELS } from './catalog';
import { FALLBACK_MATERIAL_NAMES } from '../../data/materialNames';
import type { BomGroup } from '../pricing/calc';
import type { FenceModelId, FenceParams, Material } from './types';

/**
 * Specifikacija modela ograde: lista elemenata (delova) sa formulama za količinu i dužinu reza.
 * Iz nje se računaju krojna lista i cena. Formule se računaju po jednom polju (ograda ili ispuna kapije) i mogu da koriste
 * promenljive polja (W, H, N …). Izmenjena specifikacija se čuva u podešavanjima i zamenjuje podrazumevanu.
 */
export interface SpecPart {
  id: string;
  name: string;
  materialId: string;
  group: BomGroup;
  /** formula za količinu po polju (komada; ako nema dužine, u jedinici materijala) */
  qty: string;
  /** formula za dužinu reza u mm; ako postoji, element ulazi u krojnu listu, a materijal se računa u metrima */
  lengthMm?: string;
  enabled: boolean;
  note?: string;
  /** deo rama (rez 45°): širina profila u ravni spoja (mm): od nje zavisi koliko se štedi kad dva komada dele kosi rez */
  miterMm?: number;
  /** deo rama sa jednim ugaonim krajem: koji su krajevi pod 45° (početak, kraj); bez vrednosti su oba */
  miterEnds?: [boolean, boolean];
  /** uloga dela na crtežu (npr. „Ram — gornja i donja prečka“): naziv dela u krojnoj listi i radnom nalogu; bez vrednosti naziv je materijal */
  role?: string;
}

export const BOM_GROUPS: BomGroup[] = ['Profili ispune', 'Ramovi', 'Stubovi', 'Nosači i spojnice', 'Vijci', 'Šarke', 'Brave', 'Točkići', 'Automatika', 'Dodatni materijal'];

export type ModelSpecs = Partial<Record<FenceModelId, SpecPart[]>>;

/** Promenljive koje formule mogu da koriste (opis za prikaz u uređivaču). */
export const SPEC_VARIABLES: { name: string; label: string }[] = [
  { name: 'HINGES', label: 'broj šarki po krilu: 3 kad je visina krila preko 1500 mm ili širina preko 1200 mm, inače 2' },
  { name: 'FIRSTLEAF', label: '1 samo za prvo krilo dvokrilne kapije (0 za drugo); za delove kojih ima jedan po kapiji, npr. brava' },
  { name: 'W', label: 'svetli otvor polja (mm)' },
  { name: 'H', label: 'visina polja (mm)' },
  { name: 'A', label: 'razmak osa stubova — modul (mm)' },
  { name: 'N', label: 'broj glavnih profila ispune (letvice/prečke/daske)' },
  { name: 'R', label: 'broj nosača/rukohvata (poprečni profili)' },
  { name: 'K', label: 'broj dodatnih traka (srebrne linije)' },
  { name: 'MAINLEN', label: 'dužina jednog glavnog profila (mm)' },
  { name: 'RAILLEN', label: 'dužina jednog nosača/rukohvata (mm)' },
  { name: 'ACCLEN', label: 'dužina jedne dodatne trake (mm)' },
  { name: 'GLASS', label: 'površina stakla (m²)' },
  { name: 'PERIM', label: 'obim polja 2·W + 2·H (mm)' },
  { name: 'AREA', label: 'površina polja W·H (m²)' },
  { name: 'DOUBLE', label: '1 za dvokrilnu kapiju, inače 0' },
  { name: 'SLATS', label: 'broj uspravnih letvica nacrtanog modela, preračunat za širinu polja (kod dvokrilne po krilu)' },
  { name: 'HBAR0', label: 'broj vodoravnih prečki prve vrste nacrtanog modela, preračunat za visinu polja (kod dvokrilne za oba krila)' },
  { name: 'HBAR1', label: 'broj vodoravnih prečki druge vrste (npr. uske uz široke), preračunat za visinu polja' },
  { name: 'HBAR2', label: 'broj vodoravnih prečki treće vrste, preračunat za visinu polja' },
  { name: 'HBAR3', label: 'broj vodoravnih prečki četvrte vrste, preračunat za visinu polja' },
  { name: 'TUBELEN', label: 'dužina kvadratne cevi: svetli otvor − 2·(zid U profila + zazor) (mm), samo model uskih letvica' },
  { name: 'RAMU', label: '1 ako polje ima ram od U profila, inače 0' },
  { name: 'RAMC', label: '1 ako polje ima ram od kvadratne cevi, inače 0' },
  { name: 'RAMT', label: 'koliko ram sužava ispunu gore i dole (mm)' },
  { name: 'RAMS', label: 'koliko ram sužava ispunu levo i desno (mm)' },
  { name: 'FRAME', label: 'debljina rama (mm)' },
  { name: 'BAR', label: 'visina/širina profila ispune (mm)' },
  { name: 'GAP', label: 'razmak profila (mm)' },
];

export interface SpecContext {
  modelId: FenceModelId;
  /** svetli otvor, visina i modul (osa–osa) polja u mm */
  widthMm: number;
  heightMm: number;
  axisMm: number;
  params: FenceParams;
  doubleGate?: boolean;
  /** dvokrilna, računanje po krilu: redni broj krila (0 = prvo); bez vrednosti važi prvo krilo */
  leafIndex?: number;
  /** širine dva krila dvokrilne kapije (mm): nacrtan model se računa po krilu */
  leafWidthsMm?: number[];
  /** stepenište: odnos kose i horizontalne dužine (horizontalni delovi prate nagib); bez vrednosti 1 */
  slopeFactor?: number;
}

/** Geometrija ispune polja (ram sužava ispunu: manje cevi po visini, kraće po širini). */
function leafGeometries(c: SpecContext): ReturnType<typeof computeInfill>[] {
  const f = c.slopeFactor && c.slopeFactor > 1 ? c.slopeFactor : 1;
  const ins = ramInsets(c.modelId, c.params);
  return [computeInfill(c.modelId, Math.max(0, c.widthMm - 2 * ins.side) * f, Math.max(0, c.heightMm - 2 * ins.top), c.params.frameMm, c.params.barSizeMm, c.params.gapMm, c.params.barCount)];
}

function hbarVars(c: SpecContext): Record<string, number> {
  // isto kao na crtežu: ispuna počinje iznad razmaka od poda, a odstojanja i razmak prečki mogu biti zadati ručno
  const counts = customPatternCounts(c.modelId, c.heightMm - (c.params.liftMm ?? customLiftOf(c.modelId)), c.params.slats);
  const leaves = c.leafWidthsMm?.length || 1;
  return { HBAR0: (counts[0] ?? 0) * leaves, HBAR1: (counts[1] ?? 0) * leaves, HBAR2: (counts[2] ?? 0) * leaves, HBAR3: (counts[3] ?? 0) * leaves };
}

export function specVars(c: SpecContext): Record<string, number> {
  // stepenište: delovi duž polja (rukohvat, prečke) su dugi koliko kosa dužina; površina stakla ostaje horizontalna × vertikalna
  const f = c.slopeFactor && c.slopeFactor > 1 ? c.slopeFactor : 1;
  const leaves = leafGeometries(c);
  const sums = leaves.map(summarizeInfill);
  const tone = (k: 'main' | 'rail' | 'accent') => ({ count: sums.reduce((n, x) => n + x[k].count, 0), lengthMm: sums.reduce((n, x) => n + x[k].lengthMm, 0) });
  const sum = { main: tone('main'), rail: tone('rail'), accent: tone('accent'), glassAreaM2: sums.reduce((n, x) => n + x.glassAreaM2, 0) };
  const avg = (t: { count: number; lengthMm: number }) => (t.count > 0 ? t.lengthMm / t.count : 0);
  return {
    W: c.widthMm * f, H: c.heightMm, A: c.axisMm * f,
    N: sum.main.count, R: sum.rail.count, K: sum.accent.count,
    MAINLEN: avg(sum.main), RAILLEN: avg(sum.rail), ACCLEN: avg(sum.accent),
    GLASS: sum.glassAreaM2 / f,
    PERIM: 2 * c.widthMm * f + 2 * c.heightMm, AREA: (c.widthMm * c.heightMm) / 1_000_000,
    DOUBLE: c.doubleGate ? 1 : 0,
    FIRSTLEAF: c.leafIndex ? 0 : 1,
    HINGES: hingeCountFor(c.widthMm, c.heightMm),
    SLATS: (c.leafWidthsMm?.length ? c.leafWidthsMm : [c.widthMm]).reduce((n, w) => n + customSlatCount(c.modelId, w, c.heightMm, c.params.slats), 0),
    ...hbarVars(c),
    TUBELEN: tubeLengthMm(Math.max(0, c.widthMm - 2 * ramInsets(c.modelId, c.params).side), c.params),
    RAMU: ramInsets(c.modelId, c.params).kind === 'u' ? 1 : 0, RAMC: ramInsets(c.modelId, c.params).kind === 'tube' ? 1 : 0,
    RAMT: ramInsets(c.modelId, c.params).top, RAMS: ramInsets(c.modelId, c.params).side,
    FRAME: c.params.frameMm, BAR: c.params.barSizeMm, GAP: c.params.gapMm,
  };
}

/* ---------- računanje formula (bez eval: sopstveni parser) ---------- */

class Parser {
  private i = 0;
  constructor(private s: string, private vars: Record<string, number>) {}
  parse(): number {
    const v = this.expr();
    this.ws();
    if (this.i < this.s.length) throw new Error(`Neočekivan znak „${this.s[this.i]}"`);
    return v;
  }
  private ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  private peek() { this.ws(); return this.s[this.i]; }
  private expr(): number {
    let v = this.term();
    for (;;) {
      const c = this.peek();
      if (c === '+') { this.i++; v += this.term(); } else if (c === '-') { this.i++; v -= this.term(); } else return v;
    }
  }
  private term(): number {
    let v = this.factor();
    for (;;) {
      const c = this.peek();
      if (c === '*') { this.i++; v *= this.factor(); } else if (c === '/') { this.i++; const d = this.factor(); v /= d; } else return v;
    }
  }
  private factor(): number {
    if (this.peek() === '-') { this.i++; return -this.factor(); }
    if (this.peek() === '+') { this.i++; return this.factor(); }
    return this.primary();
  }
  private primary(): number {
    const c = this.peek();
    if (c === '(') {
      this.i++;
      const v = this.expr();
      if (this.peek() !== ')') throw new Error('Nedostaje zatvorena zagrada');
      this.i++;
      return v;
    }
    const num = /^\d+(\.\d+)?/.exec(this.s.slice(this.i));
    if (num) { this.i += num[0].length; return parseFloat(num[0]); }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(this.s.slice(this.i));
    if (!id) throw new Error(c ? `Neočekivan znak „${c}"` : 'Formula je nepotpuna');
    this.i += id[0].length;
    const name = id[0].toUpperCase();
    if (this.peek() === '(') {
      this.i++;
      const args: number[] = [];
      if (this.peek() !== ')') {
        args.push(this.expr());
        while (this.peek() === ',' || this.peek() === ';') { this.i++; args.push(this.expr()); }
      }
      if (this.peek() !== ')') throw new Error('Nedostaje zatvorena zagrada');
      this.i++;
      const fn: Record<string, (...a: number[]) => number> = { CEIL: Math.ceil, FLOOR: Math.floor, ROUND: Math.round, MIN: Math.min, MAX: Math.max, ABS: Math.abs };
      if (!fn[name]) throw new Error(`Nepoznata funkcija ${id[0]}`);
      return fn[name](...args);
    }
    if (!(name in this.vars)) throw new Error(`Nepoznata promenljiva ${id[0]}`);
    return this.vars[name];
  }
}

/** Računa formulu; baca grešku sa opisom ako formula nije ispravna ili nije konačan broj. */
export function evalFormula(expr: string, vars: Record<string, number>): number {
  const v = new Parser(expr, vars).parse();
  if (!Number.isFinite(v)) throw new Error('Rezultat nije broj (deljenje nulom?)');
  return v;
}

export function checkFormula(expr: string | undefined, vars: Record<string, number>): string | null {
  if (expr === undefined || expr.trim() === '') return null;
  try { evalFormula(expr, vars); return null; } catch (e) { return (e as Error).message; }
}

export interface EvaluatedPart {
  part: SpecPart;
  qty: number;
  lengthMm: number | null;
  /** količina u jedinici materijala (m za profile sa dužinom reza, m² za staklo, kom…) */
  materialQty: number;
  error: string | null;
}

/**
 * Specifikacija jednog elementa. Kod dvokrilne kapije svako krilo je zasebno polje sa svojim ramom i ispunom: računa se za svako
 * krilo posebno, sa širinom tog krila (dužine prečki, broj letvica i prečki po krilu), pa se stavke oba krila sabiraju. Tako i model
 * iz kataloga dobija ram i letvice po krilu (ranije su vodoravni delovi išli preko cele kapije, kao da je jedno krilo).
 * Neispravna formula daje grešku i količinu 0.
 */
export function evaluateItemSpec(parts: SpecPart[], c: SpecContext): EvaluatedPart[] {
  // ojačanje platna cevima (uspravne i vodoravne): redovi se računaju iz crteža za stvarnu širinu i visinu
  const withReinforce = (width: number): SpecPart[] => {
    const rows = customReinforceRows(c.modelId, width, c.heightMm - (c.params.liftMm ?? customLiftOf(c.modelId)), c.params.slats);
    return rows.length ? [...parts, ...rows.map((r, i): SpecPart => ({ id: `rf_${r.key}_${i}`, name: r.name, materialId: r.materialId, group: 'Profili ispune', qty: String(r.qty), lengthMm: String(r.lengthMm), enabled: true, role: r.role, note: 'ojačanje platna: dužina sa crteža' }))] : parts;
  };
  // prečke koje uspravne cevi seku: svaka prečka postaje n + 1 komada dužine (L − n·širina cevi) / (n + 1)
  const split = (evs: EvaluatedPart[], width: number): EvaluatedPart[] => {
    const s = customReinforceSplit(c.modelId, width, c.heightMm - (c.params.liftMm ?? customLiftOf(c.modelId)), c.params.slats);
    if (!s) return evs;
    return evs.map((ev) => {
      const p = ev.part;
      const horizontal = !!p.lengthMm && /\bW\b/.test(p.lengthMm) && !/\bH\b/.test(p.lengthMm) && !p.miterMm && p.group === 'Profili ispune' && !p.id.startsWith('rf_');
      if (!horizontal || ev.lengthMm === null || ev.lengthMm <= width * 0.5 || ev.error) return ev;
      const len = Math.max(0, (ev.lengthMm - s.n * s.tubeW) / (s.n + 1));
      const qty = ev.qty * (s.n + 1);
      return { ...ev, qty, lengthMm: len, materialQty: (qty * len) / 1000, part: { ...p, note: `${p.note ? `${p.note}; ` : ''}seče se na ${s.n + 1} komada (uspravne cevi ojačanja)` } };
    });
  };
  if (c.leafWidthsMm && c.leafWidthsMm.length > 1) {
    return c.leafWidthsMm.flatMap((w, i) => split(evaluateSpec(withReinforce(w), specVars({ ...c, widthMm: w, axisMm: w, leafWidthsMm: undefined, doubleGate: false, leafIndex: i })), w));
  }
  return split(evaluateSpec(withReinforce(c.widthMm), specVars(c)), c.widthMm);
}

export function evaluateSpec(parts: SpecPart[], vars: Record<string, number>): EvaluatedPart[] {
  return parts.filter((p) => p.enabled).map((part) => {
    try {
      const qty = Math.max(0, evalFormula(part.qty, vars));
      const hasLen = part.lengthMm !== undefined && part.lengthMm.trim() !== '';
      const lengthMm = hasLen ? Math.max(0, evalFormula(part.lengthMm!, vars)) : null;
      return { part, qty, lengthMm, materialQty: lengthMm !== null ? (qty * lengthMm) / 1000 : qty, error: null };
    } catch (e) {
      return { part, qty: 0, lengthMm: null, materialQty: 0, error: (e as Error).message };
    }
  });
}

/* ---------- podrazumevane specifikacije ---------- */

let seq = 0;
const part = (p: Omit<SpecPart, 'id' | 'enabled'>): SpecPart => ({ id: `sp_${++seq}`, enabled: true, ...p });

/** Podrazumevana specifikacija: isti delovi koje je aplikacija do sada računala za polje tog modela. */
export function defaultSpec(modelId: FenceModelId): SpecPart[] {
  const custom = customModelOf(modelId);
  if (custom) return customSpec(custom);
  const def = FENCE_MODELS[modelId];
  const parts: SpecPart[] = [];
  const framed = def.style !== 'rods' && def.style !== 'glass_rail';
  if (modelId === 'rail_black') return railBlackSpec();
  if (modelId === 'louver_light') return louverLightSpec();
  if (modelId === 'h_narrow') return tubesSpec();
  if (modelId === 'rail_inox') return rl10Spec();
  if (framed) {
    parts.push(part({ name: 'Ram — vertikalni', materialId: 'mat_alu_frame', group: 'Ramovi', qty: '2', lengthMm: 'H' }));
    parts.push(part({ name: 'Ram — horizontalni', materialId: 'mat_alu_frame', group: 'Ramovi', qty: '2', lengthMm: 'W' }));
    parts.push(part({ name: 'Ram — središnji vertikalni (dvokrilna kapija)', materialId: 'mat_alu_frame', group: 'Ramovi', qty: '2*DOUBLE', lengthMm: 'H' }));
  }
  if (def.style === 'glass_rail') parts.push(part({ name: def.parts.main, materialId: def.materialId, group: 'Profili ispune', qty: 'GLASS' }));
  else parts.push(part({ name: def.parts.main, materialId: def.materialId, group: 'Profili ispune', qty: 'N', lengthMm: 'MAINLEN' }));
  if (def.parts.rail || ['combo', 'picket', 'framed_vertical', 'rods', 'glass_rail'].includes(def.style)) {
    parts.push(part({ name: def.parts.rail ?? 'Nosač', materialId: def.railMaterialId ?? 'mat_alu_frame', group: 'Profili ispune', qty: 'R', lengthMm: 'RAILLEN' }));
  }
  if (def.parts.accent || def.accentMaterialId) {
    parts.push(part({ name: def.parts.accent ?? 'Traka', materialId: def.accentMaterialId ?? 'mat_inox_traka', group: 'Profili ispune', qty: 'K', lengthMm: 'ACCLEN' }));
  }
  if (def.style === 'glass_rail') parts.push(part({ name: 'Nosači stakla', materialId: 'mat_glass_clamp', group: 'Nosači i spojnice', qty: String(CALC_RULES.glassClampsPerPanel) }));
  else parts.push(part({ name: 'Vijci (po profilu)', materialId: 'mat_screw', group: 'Vijci', qty: `(N+R)*${CALC_RULES.screwsPerBar}` }));
  parts.push(part({ name: 'Nosači / spojnice profila', materialId: 'mat_bracket', group: 'Nosači i spojnice', qty: String(CALC_RULES.bracketsPerSection) }));
  return parts;
}

/** Model 04 po polju (prečke i rukohvat). Stubovi nisu deo polja: obračunavaju se kao stubovi projekta. */
function railBlackSpec(): SpecPart[] {
  return [
    part({ name: 'Rukohvat Ø50 (PEGA 04)', materialId: 'mat_pega_04', group: 'Profili ispune', qty: '1', lengthMm: 'A+40', note: 'dužina = razmak osa + 2 × 20 mm prepusta' }),
    part({ name: 'Prečka Ø16 (PEGA 2275/1)', materialId: 'mat_pega_2275_1', group: 'Profili ispune', qty: 'N', lengthMm: 'A+40' }),
    part({ name: 'Donji deo nosača rukohvata (PEGA ECO 11)', materialId: 'mat_pega_eco_11', group: 'Nosači i spojnice', qty: '2' }),
    part({ name: 'Gornji deo nosača rukohvata (PEGA ECO 12)', materialId: 'mat_pega_eco_12', group: 'Nosači i spojnice', qty: '2' }),
    part({ name: 'Nosač prečke Ø16 (PEGA ECO 97)', materialId: 'mat_pega_eco_97', group: 'Nosači i spojnice', qty: '2*N' }),
    part({ name: 'Podloška nosača (PEGA 97/8)', materialId: 'mat_pega_97_8', group: 'Nosači i spojnice', qty: '2*N' }),
    part({ name: 'Završetak rukohvata (PEGA ECO 46)', materialId: 'mat_pega_eco_46', group: 'Nosači i spojnice', qty: '2' }),
    part({ name: 'Završetak prečke (PEGA SKS 51/2)', materialId: 'mat_pega_sks_51_2', group: 'Nosači i spojnice', qty: '2*N' }),
    part({ name: 'Vijci i stezni elementi', materialId: 'mat_screw', group: 'Vijci', qty: '2+2*N' }),
  ];
}

/**
 * RL10 (BTS ROUND) po polju: rukohvat P-1033 Ø50 i prečke P-1146 Ø16, dužine osa–osa (na krajevima niza dodaje se prepust do
 * završetka). Stubovi P-1054 sa lajsnom, vezom AK-5039N, prstenom AK-5062, stopom AK-5036X, sidrima i nosačima prečki AK-5011Y,
 * kao i završeci na krajnjim stubovima, obračunavaju se po stubu.
 */
function rl10Spec(): SpecPart[] {
  return [
    part({ name: 'Rukohvat — cev Ø50 × 2 (P-1033)', materialId: 'mat_bts_p1033', group: 'Profili ispune', qty: '1', lengthMm: 'A', note: 'dužina osa–osa stubova; na krajevima niza + prepust do završetka AK-5009' }),
    part({ name: 'Prečka — cev Ø16 (P-1146)', materialId: 'mat_bts_p1146', group: 'Profili ispune', qty: 'N', lengthMm: 'A', note: 'dužina osa–osa stubova; na krajevima niza + prepust do završetka AK-5012A' }),
  ];
}

/**
 * Uske horizontalne letvice po polju: dve bočne U vođice 20 × 20 (dužine visine polja) i kvadratne cevi 30 × 20 (broj iz razmaka,
 * dužina = svetli otvor − 2·(zid U + zazor)). Stubovi su deo stubova projekta.
 */
function tubesSpec(): SpecPart[] {
  return [
    part({ name: 'U profil (bočna vođica)', materialId: 'mat_u_20x20', group: 'Profili ispune', qty: '2*(1-RAMU)', lengthMm: 'H-2*RAMT', note: 'dužina = visina polja (unutar rama od cevi kraća za ram); otvoren ka ispuni, krajevi cevi ulaze u kanal' }),
    part({ name: 'Ram — U profil, uspravni', materialId: 'mat_u_20x20', group: 'Ramovi', qty: '2*RAMU', lengthMm: 'H', note: 'rez 45° na oba kraja; dužina je spoljna mera rama' }),
    part({ name: 'Ram — U profil, vodoravni', materialId: 'mat_u_20x20', group: 'Ramovi', qty: '2*RAMU', lengthMm: 'W', note: 'rez 45° na oba kraja; dužina je spoljna mera rama' }),
    part({ name: 'Ram — kvadratna cev, uspravni', materialId: RAM_TUBE_MATERIAL, group: 'Ramovi', qty: '2*RAMC', lengthMm: 'H', note: 'rez 45° na oba kraja; dužina je spoljna mera rama' }),
    part({ name: 'Ram — kvadratna cev, vodoravni', materialId: RAM_TUBE_MATERIAL, group: 'Ramovi', qty: '2*RAMC', lengthMm: 'W', note: 'rez 45° na oba kraja; dužina je spoljna mera rama' }),
    part({ name: 'Kvadratna cev (letvica)', materialId: 'mat_kv_30x20', group: 'Profili ispune', qty: 'N', lengthMm: 'TUBELEN', note: 'dužina = svetli otvor − 2 × (zid U profila + zazor); broj prema razmaku' }),
    part({ name: 'Nosači / spojnice (U profil na stub)', materialId: 'mat_bracket', group: 'Nosači i spojnice', qty: String(CALC_RULES.bracketsPerSection) }),
    { ...part({ name: 'Vijci / zakivci (cev u U profil)', materialId: 'mat_screw', group: 'Vijci', qty: '2*N', note: 'Spoj cevi i U profila nije potvrđen (vijci, zakivci ili uvlačenje u kanal); uključiti ako se spaja vijcima' }), enabled: false },
  ];
}

/** Model 08 po polju (U vođice i horizontalne letvice); L = W − 2·s − c sa s = 2, c = 2. */
function louverLightSpec(): SpecPart[] {
  return [
    part({ name: 'Bočna vođica U 60 × 28', materialId: 'mat_u_60x28', group: 'Profili ispune', qty: '2', lengthMm: 'H', note: 'podatak radnika; cena nije u cenovniku' }),
    part({ name: 'Horizontalna letvica 80 × 20 (KV000007)', materialId: 'mat_ek_kv000007', group: 'Profili ispune', qty: 'N', lengthMm: 'W-2*2-2', note: 'L = W − 2·zid − zazor' }),
  ];
}

/** Mesto u specifikaciji za kvadratnu cev rama (stvarni materijal se bira u projektu, „Delovi ograde“). */
export const RAM_TUBE_MATERIAL = 'mat_ram_cev';

/**
 * Ključ u `modelSpecs` za materijal koji je korisnik dodao u sastavnicu nacrtanog (ili dorađenog) modela. Crtež modela daje svoje
 * delove, a dodati materijal (vijci, nosači, kape …) se čuva odvojeno, pa ostaje kad se crtež promeni.
 */
export const extraSpecKey = (modelId: string): string => `${modelId}#dodato`;

/** Sastavnica modela: izmenjena ili podrazumevana specifikacija; kod nacrtanog modela uz crtež idu i dodati materijali. */
export const specFor = (modelId: FenceModelId, specs?: ModelSpecs): SpecPart[] => {
  const base = specs?.[modelId] ?? defaultSpec(modelId);
  // šarke upisane ranije sa stalnom količinom 2 računaju se po pravilu (3 za visoko ili široko krilo)
  const extra = customModelOf(modelId) ? (specs as Record<string, SpecPart[]> | undefined)?.[extraSpecKey(modelId)]?.map((p) => ((p.id === 'pair_hinge' || p.id === 'single_hinge') && p.qty.trim() === '2' ? { ...p, qty: 'HINGES' } : p)) : undefined;
  return extra?.length ? [...base, ...extra] : base;
};

/** Da li model ima izmenjenu specifikaciju (tada se zamenjuje i detaljna sastavnica modela 04 i 08). */
export const hasCustomSpec = (modelId: FenceModelId, specs?: ModelSpecs): boolean => Boolean(specs?.[modelId]);

/** Naziv materijala iz cenovnika; ako ga tamo nema, čitljiv naziv ugrađenog materijala, pa tek onda sam ID. */
export const materialName = (materials: Material[], id: string): string => materials.find((m) => m.id === id)?.name ?? FALLBACK_MATERIAL_NAMES[id] ?? id;

/** Obrnuto od `materialName`: ID materijala za naziv profila iz krojne liste (cenovnik, pa ugrađeni nazivi). */
export const materialIdForName = (materials: Material[], name: string): string =>
  materials.find((m) => m.name === name)?.id ?? Object.keys(FALLBACK_MATERIAL_NAMES).find((k) => FALLBACK_MATERIAL_NAMES[k] === name) ?? name;
