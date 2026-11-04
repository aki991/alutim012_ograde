import { tubeLengthMm } from './tubes';
import { computeInfill, summarizeInfill } from '../geometry/infill';
import { CALC_RULES } from '../pricing/rules';
import { tarabicaCapHeight } from './tarabica';
import { FENCE_MODELS } from './catalog';
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
}

export const BOM_GROUPS: BomGroup[] = ['Profili ispune', 'Ramovi', 'Stubovi', 'Nosači i spojnice', 'Vijci', 'Šarke', 'Brave', 'Točkići', 'Automatika', 'Dodatni materijal'];

export type ModelSpecs = Partial<Record<FenceModelId, SpecPart[]>>;

/** Promenljive koje formule mogu da koriste (opis za prikaz u uređivaču). */
export const SPEC_VARIABLES: { name: string; label: string }[] = [
  { name: 'W', label: 'svetli otvor polja (mm)' },
  { name: 'H', label: 'visina polja (mm)' },
  { name: 'A', label: 'razmak osa stubova — modul (mm)' },
  { name: 'N', label: 'broj glavnih profila ispune (letvice/prečke/daske)' },
  { name: 'R', label: 'broj nosača/rukohvata (poprečni profili)' },
  { name: 'K', label: 'broj dodatnih traka (srebrne linije)' },
  { name: 'MAINLEN', label: 'dužina jednog glavnog profila (mm)' },
  { name: 'CAPH', label: 'visina čepa tarabice: kupola + okovratnik (mm); 0 za druge modele' },
  { name: 'RAILLEN', label: 'dužina jednog nosača/rukohvata (mm)' },
  { name: 'ACCLEN', label: 'dužina jedne dodatne trake (mm)' },
  { name: 'GLASS', label: 'površina stakla (m²)' },
  { name: 'PERIM', label: 'obim polja 2·W + 2·H (mm)' },
  { name: 'AREA', label: 'površina polja W·H (m²)' },
  { name: 'DOUBLE', label: '1 za dvokrilnu kapiju, inače 0' },
  { name: 'TUBELEN', label: 'dužina kvadratne cevi: svetli otvor − 2·(zid U profila + zazor) (mm), samo model uskih letvica' },
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
  /** širine dva krila dvokrilne kapije (mm): tarabice se računaju po krilu, bez prepusta uz sredinu */
  leafWidthsMm?: number[];
  /** stepenište: odnos kose i horizontalne dužine (horizontalni delovi prate nagib); bez vrednosti 1 */
  slopeFactor?: number;
}

export function specVars(c: SpecContext): Record<string, number> {
  // stepenište: delovi duž polja (rukohvat, prečke) su dugi koliko kosa dužina; površina stakla ostaje horizontalna × vertikalna
  const f = c.slopeFactor && c.slopeFactor > 1 ? c.slopeFactor : 1;
  const geoOf = (w: number, left: number, right?: number) => computeInfill(c.modelId, w * f, c.heightMm, left, c.params.barSizeMm, c.params.gapMm, c.params.barCount, c.params.liftMm, right);
  const leaves = FENCE_MODELS[c.modelId].style === 'tarabica' && c.leafWidthsMm?.length === 2
    ? [geoOf(c.leafWidthsMm[0], c.params.frameMm, 0), geoOf(c.leafWidthsMm[1], 0, c.params.frameMm)]
    : [geoOf(c.widthMm, c.params.frameMm)];
  const sums = leaves.map(summarizeInfill);
  const tone = (k: 'main' | 'rail' | 'accent') => ({ count: sums.reduce((n, x) => n + x[k].count, 0), lengthMm: sums.reduce((n, x) => n + x[k].lengthMm, 0) });
  const sum = { main: tone('main'), rail: tone('rail'), accent: tone('accent'), glassAreaM2: sums.reduce((n, x) => n + x.glassAreaM2, 0) };
  const avg = (t: { count: number; lengthMm: number }) => (t.count > 0 ? t.lengthMm / t.count : 0);
  return {
    W: c.widthMm * f, H: c.heightMm, A: c.axisMm * f,
    N: sum.main.count, R: sum.rail.count, K: sum.accent.count,
    MAINLEN: avg(sum.main), RAILLEN: avg(sum.rail), ACCLEN: avg(sum.accent),
    CAPH: FENCE_MODELS[c.modelId].style === 'tarabica' ? tarabicaCapHeight(c.params.barSizeMm) : 0,
    GLASS: sum.glassAreaM2 / f,
    PERIM: 2 * c.widthMm * f + 2 * c.heightMm, AREA: (c.widthMm * c.heightMm) / 1_000_000,
    DOUBLE: c.doubleGate ? 1 : 0,
    TUBELEN: tubeLengthMm(c.widthMm, c.params),
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

/** Računa sve uključene elemente specifikacije za jedno polje. Neispravna formula daje grešku i količinu 0. */
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
  const def = FENCE_MODELS[modelId];
  const parts: SpecPart[] = [];
  const framed = def.style !== 'rods' && def.style !== 'glass_rail';
  if (modelId === 'rail_black') return railBlackSpec();
  if (modelId === 'louver_light') return louverLightSpec();
  if (modelId === 'picket_wide') return tarabicaSpec();
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

/** Tarabica po polju: cevi 80 × 20 sa čepom, dve spojne cevi 30 × 30. Stubovi i njihove kape su deo stubova projekta. */
function tarabicaSpec(): SpecPart[] {
  return [
    part({ name: 'Tarabica — kvadratna cev 80 × 20', materialId: 'mat_ek_kv000007', group: 'Profili ispune', qty: 'N', lengthMm: 'MAINLEN-CAPH', note: 'dužina = visina polja − visina čepa (CAPH: kupola + okovratnik, 40 mm za tarabicu 80); katalog KTWM3865' }),
    part({ name: 'Čep tarabice pun 80 × 20 (K100018)', materialId: 'mat_ek_k100018', group: 'Nosači i spojnice', qty: 'N' }),
    part({ name: 'Spojna cev 30 × 30 (gore i dole)', materialId: 'mat_ek_ktwm3899', group: 'Profili ispune', qty: 'R', lengthMm: 'RAILLEN', note: 'dužina = svetli otvor; cevi se oslanjaju na stubove' }),
    { ...part({ name: 'Vijci (tarabica na spojnu cev)', materialId: 'mat_screw', group: 'Vijci', qty: '2*N', note: 'Spoj nije potvrđen (vijci sa zadnje strane ili varenje); uključiti ako se spaja vijcima' }), enabled: false },
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
 * Uske horizontalne letvice po polju: dve bočne U vođice 25 × 20 (dužine visine polja) i kvadratne cevi 20 × 20 (broj iz razmaka,
 * dužina = svetli otvor − 2·(zid U + zazor)). Stubovi su deo stubova projekta.
 */
function tubesSpec(): SpecPart[] {
  return [
    part({ name: 'U profil 25 × 20 (bočna vođica)', materialId: 'mat_u_25x20', group: 'Profili ispune', qty: '2', lengthMm: 'H', note: 'dužina = visina polja; otvoren ka ispuni, krajevi cevi ulaze u kanal' }),
    part({ name: 'Kvadratna cev 20 × 20 (letvica)', materialId: 'mat_kv_20x20', group: 'Profili ispune', qty: 'N', lengthMm: 'TUBELEN', note: 'dužina = svetli otvor − 2 × (zid U profila + zazor); broj prema razmaku' }),
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

export const specFor = (modelId: FenceModelId, specs?: ModelSpecs): SpecPart[] => specs?.[modelId] ?? defaultSpec(modelId);

/** Da li model ima izmenjenu specifikaciju (tada se zamenjuje i detaljna sastavnica modela 04 i 08). */
export const hasCustomSpec = (modelId: FenceModelId, specs?: ModelSpecs): boolean => Boolean(specs?.[modelId]);

export const materialName = (materials: Material[], id: string): string => materials.find((m) => m.id === id)?.name ?? id;
