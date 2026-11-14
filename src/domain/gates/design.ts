import type { Gate } from '../models/types';

/**
 * Mere kapije koje radnik zadaje ručno (modul „Mere kapije“). Svaka promenljiva kota ima svoj ključ, poreklo (ručno, šablon,
 * katalog, proračun, projekat) i status (radna, izmerena, potvrđena). Prazna vrednost (null) znači „nije poznato“ — nula je
 * važeći unos. Proračun (dvokrilna, jednokrilna, samonoseća, klizna po šini) koristi iste definicije kao specifikacija:
 *   dvokrilna   W = gL + WL + gC + WR + gR
 *   jednokrilna W = gH + Wk + gZ
 *   samonoseća  L = W + a + b + T,  Smin = W + a + e,  Pmin = b + T + S + R,  d = S − W − a
 *   po šini     L = W + a + b,      Smin = W + a + e,  Pmin = b + S + R,      šina = S + razmak točkova + 2 × rezerva
 * Svaka jednačina ima kotu koju računa aplikacija (radnik je bira); ako su sve kote zadate i ne slažu se, prikazuje se odstupanje.
 */

export type GateSystem = 'swing_double' | 'swing_single' | 'cantilever' | 'rail';
export type SlideSystem = 'cantilever' | 'rail';
export type DimOrigin = 'rucno' | 'sablon' | 'katalog' | 'proracun' | 'projekat' | 'kota';
export type DimStatus = 'radna' | 'izmerena' | 'potvrdjena';

export const ORIGIN_LABELS: Record<DimOrigin, string> = {
  rucno: 'ručni unos', sablon: 'šablon', katalog: 'katalog', proracun: 'proračun', projekat: 'projekat', kota: 'dodatna kota',
};
export const STATUS_LABELS: Record<DimStatus, string> = { radna: 'radna', izmerena: 'izmerena', potvrdjena: 'potvrđena' };

export interface DimValue {
  v: number | null;
  origin: DimOrigin;
  status?: DimStatus;
}

export type DimGroup = 'otvor' | 'teren' | 'zazori' | 'krila' | 'okovi' | 'klizanje' | 'kolica' | 'ram';

export interface DimDef {
  key: string;
  label: string;
  /** deo na koji se kota odnosi */
  part: string;
  /** referentne ivice, površine ili ose */
  ref: string;
  group: DimGroup;
  systems: GateSystem[];
  unit?: 'mm' | '°' | '%' | 'kom';
  /** najmanja dozvoljena vrednost (geometrija); nula je dozvoljena ako nije drugačije zadato */
  min?: number;
}

const SW: GateSystem[] = ['swing_double', 'swing_single'];
const SL: GateSystem[] = ['cantilever', 'rail'];
const ALL: GateSystem[] = ['swing_double', 'swing_single', 'cantilever', 'rail'];

export const DIM_DEFS: DimDef[] = [
  { key: 'W', label: 'Svetli otvor (usvojen)', part: 'Otvor', ref: 'između dogovorenih montažnih lica stubova', group: 'otvor', systems: ALL, min: 1 },
  { key: 'wTop', label: 'Terenska širina gore', part: 'Otvor', ref: 'između lica stubova, pri vrhu', group: 'teren', systems: ALL, min: 1 },
  { key: 'wMid', label: 'Terenska širina u sredini', part: 'Otvor', ref: 'između lica stubova, na pola visine', group: 'teren', systems: ALL, min: 1 },
  { key: 'wBot', label: 'Terenska širina dole', part: 'Otvor', ref: 'između lica stubova, pri podlozi', group: 'teren', systems: ALL, min: 1 },
  { key: 'ground', label: 'Kota gotove podloge', part: 'Teren', ref: 'u odnosu na dogovorenu nulu (npr. prag)', group: 'teren', systems: ALL, min: -10000 },
  { key: 'slope', label: 'Pad podloge', part: 'Teren', ref: 'duž putanje krila ili trase', group: 'teren', systems: ALL, unit: '%', min: -100 },
  { key: 'H', label: 'Visina krila', part: 'Krilo', ref: 'spoljna mera rama, donja do gornje ivice', group: 'krila', systems: ALL, min: 1 },
  { key: 'gB', label: 'Donji zazor', part: 'Krilo', ref: 'gotova kota podloge do najniže ivice krila ili okova', group: 'zazori', systems: ALL },
  // dvokrilna
  { key: 'gL', label: 'Levi bočni zazor', part: 'Levo krilo / levi stub', ref: 'montažno lice levog stuba do leve ivice zatvorenog rama', group: 'zazori', systems: ['swing_double'] },
  { key: 'WL', label: 'Širina levog krila', part: 'Levo krilo', ref: 'spoljna mera rama', group: 'krila', systems: ['swing_double'], min: 1 },
  { key: 'gC', label: 'Srednji zazor', part: 'Spoj krila', ref: 'između suprotnih ivica zatvorenih ramova', group: 'zazori', systems: ['swing_double'] },
  { key: 'WR', label: 'Širina desnog krila', part: 'Desno krilo', ref: 'spoljna mera rama', group: 'krila', systems: ['swing_double'], min: 1 },
  { key: 'gR', label: 'Desni bočni zazor', part: 'Desno krilo / desni stub', ref: 'desna ivica zatvorenog rama do montažnog lica desnog stuba', group: 'zazori', systems: ['swing_double'] },
  // jednokrilna
  { key: 'gH', label: 'Zazor na strani šarki', part: 'Krilo / stub šarki', ref: 'lice stuba šarki do ivice zatvorenog rama', group: 'zazori', systems: ['swing_single'] },
  { key: 'Wk', label: 'Širina krila', part: 'Krilo', ref: 'spoljna mera rama', group: 'krila', systems: ['swing_single'], min: 1 },
  { key: 'gZ', label: 'Zazor na strani zatvaranja', part: 'Krilo / stub brave', ref: 'ivica zatvorenog rama do lica stuba brave', group: 'zazori', systems: ['swing_single'] },
  // krilne: okovi
  { key: 'hingeAxis', label: 'Osa šarke od lica stuba', part: 'Šarka', ref: 'montažno lice stuba do ose okretanja', group: 'okovi', systems: SW },
  { key: 'hingeSpacing', label: 'Razmak osa šarki', part: 'Šarke', ref: 'centar gornje do centra donje šarke', group: 'okovi', systems: SW },
  { key: 'hingeTop', label: 'Gornja šarka od vrha krila', part: 'Šarke', ref: 'gornja ivica rama do ose gornje šarke', group: 'okovi', systems: SW },
  { key: 'hingeCount', label: 'Broj šarki po krilu', part: 'Šarke', ref: '', group: 'okovi', systems: SW, unit: 'kom' },
  { key: 'lockH', label: 'Visina brave', part: 'Brava', ref: 'donja ivica krila do ose brave', group: 'okovi', systems: ALL },
  { key: 'angle', label: 'Ugao otvaranja', part: 'Krilo', ref: 'od zatvorenog položaja', group: 'okovi', systems: SW, unit: '°' },
  // klizne
  { key: 'a', label: 'Prepust na prijemnoj strani (a)', part: 'Krilo', ref: 'leva ivica otvora (x = 0) do prednje ivice krila', group: 'klizanje', systems: SL },
  { key: 'b', label: 'Prepust do repa (b)', part: 'Krilo', ref: 'desna ivica otvora (x = W) do početka repa', group: 'klizanje', systems: SL },
  { key: 'T', label: 'Dužina repa (T)', part: 'Rep', ref: 'početak repa do kraja nosećeg profila', group: 'klizanje', systems: ['cantilever'] },
  { key: 'L', label: 'Pokretni gabarit (L)', part: 'Pokretni sklop', ref: 'prednja ivica krila do kraja repa / zadnje ivice', group: 'klizanje', systems: SL, min: 1 },
  { key: 'e', label: 'Odstojanje u otvorenom (e)', part: 'Krilo', ref: 'desna ivica otvora do prednje ivice krila, otvoreno', group: 'klizanje', systems: SL },
  { key: 'S', label: 'Hod (S)', part: 'Pokretni sklop', ref: 'pomeraj krila od zatvorenog do otvorenog', group: 'klizanje', systems: SL },
  { key: 'R', label: 'Rezerva do prepreke (R)', part: 'Teren', ref: 'najisturenija tačka u otvorenom do prepreke', group: 'klizanje', systems: SL },
  { key: 'P', label: 'Raspoloživ bočni prostor (P)', part: 'Teren', ref: 'desna ivica otvora do prepreke na strani otvaranja', group: 'teren', systems: SL },
  { key: 't1', label: 'Kolica 1 — osa', part: 'Kolica', ref: 'od desne ivice otvora (x = W)', group: 'kolica', systems: ['cantilever'] },
  { key: 't2', label: 'Kolica 2 — osa', part: 'Kolica', ref: 'od desne ivice otvora (x = W)', group: 'kolica', systems: ['cantilever'] },
  { key: 'tD', label: 'Međuosni razmak kolica', part: 'Kolica', ref: 'osa kolica 1 do ose kolica 2', group: 'kolica', systems: ['cantilever'] },
  { key: 'guideX', label: 'Gornja vođica — osa', part: 'Vođica', ref: 'od desne ivice otvora (x = W)', group: 'kolica', systems: ['cantilever'] },
  { key: 'w1', label: 'Točak 1 — osa', part: 'Točkovi', ref: 'od prednje ivice krila', group: 'kolica', systems: ['rail'] },
  { key: 'w2', label: 'Točak 2 — osa', part: 'Točkovi', ref: 'od prednje ivice krila', group: 'kolica', systems: ['rail'] },
  { key: 'wD', label: 'Razmak točkova', part: 'Točkovi', ref: 'osa točka 1 do ose točka 2', group: 'kolica', systems: ['rail'] },
  { key: 'railEnd', label: 'Rezerva šine na kraju', part: 'Šina', ref: 'osa krajnjeg točka u krajnjem položaju do kraja šine', group: 'kolica', systems: ['rail'] },
];

export const DIM_BY_KEY: Record<string, DimDef> = Object.fromEntries(DIM_DEFS.map((d) => [d.key, d]));

export const GROUP_LABELS: Record<DimGroup, string> = {
  otvor: 'Otvor', teren: 'Teren i merenje', zazori: 'Zazori', krila: 'Krila', okovi: 'Šarke, brava i krilo', klizanje: 'Klizanje i gabarit', kolica: 'Kolica, vođice, točkovi', ram: 'Ram',
};

/* ---------- okovi i profili ---------- */

export type HwRole = 'hinge_left' | 'hinge_right' | 'hinge' | 'lock' | 'catch' | 'drop_bolt' | 'ground_stop' | 'trolley' | 'carrier_kit' | 'guide' | 'end_roller' | 'receiver' | 'stopper' | 'wheel' | 'rail' | 'motor' | 'other';

export const HW_ROLE_LABELS: Record<HwRole, string> = {
  hinge_left: 'Leva šarka', hinge_right: 'Desna šarka', hinge: 'Šarka', lock: 'Brava i prihvatnik', catch: 'Prihvatnik', drop_bolt: 'Zasun', ground_stop: 'Graničnik u tlu',
  trolley: 'Kolica', carrier_kit: 'Samonoseći komplet', guide: 'Gornja vođica', end_roller: 'Krajnji valjak / čep', receiver: 'Prihvatnik', stopper: 'Graničnik',
  wheel: 'Točak', rail: 'Podna šina', motor: 'Pogon (motor)', other: 'Ostalo',
};

/** da li deo putuje sa krilom (pokretna masa) */
export const HW_MOVING: Record<HwRole, boolean> = {
  hinge_left: true, hinge_right: true, hinge: true, lock: true, catch: false, drop_bolt: true, ground_stop: false, trolley: false, carrier_kit: false, guide: false,
  end_roller: true, receiver: false, stopper: false, wheel: true, rail: false, motor: false, other: false,
};

export type HwStatus = 'primer' | 'katalog' | 'radionica' | 'radna';
export const HW_STATUS_LABELS: Record<HwStatus, string> = { primer: 'primer iz istraživanja — proveriti', katalog: 'preuzeto iz kataloga', radionica: 'radionica potvrdila za sistem', radna: 'radna pretpostavka' };

export interface GateHardware {
  id: string;
  role: HwRole;
  name: string;
  code?: string;
  supplier?: string;
  /** verzija ili broj dokumenta / crteža */
  doc?: string;
  source?: string;
  status: HwStatus;
  /** dokumentovane granice zazora uz koji deo radi (šarka: kota B; brava: srednji zazor; graničnik: donji zazor) */
  minGapMm?: number;
  maxGapMm?: number;
  /** radna ili potvrđena nominala zazora (predlog) */
  nominalGapMm?: number;
  /** hod podešavanja (posebno od dozvoljenog zazora) */
  adjust?: string;
  maxLeafWidthMm?: number;
  maxLeafKg?: number;
  maxOpeningMm?: number;
  kg?: number;
  qty: number;
  /** veza sa cenovnikom (cena po jedinici) */
  materialId?: string;
  note?: string;
}

export type ProfileRole = 'frame' | 'carrier' | 'tail' | 'brace' | 'other';
export const PROFILE_ROLE_LABELS: Record<ProfileRole, string> = { frame: 'Ram krila', carrier: 'Noseći (klizni) profil', tail: 'Kosnik repa', brace: 'Ukrućenje', other: 'Ostalo' };

export interface GateProfile {
  id: string;
  role: ProfileRole;
  name: string;
  code?: string;
  /** vidljiva širina u pogledu (mm) */
  faceMm?: number;
  depthMm?: number;
  wallMm?: number;
  kgPerM?: number;
  materialId?: string;
  /** ram: stubovi rama celom visinom (horizontale između) ili rez 45° */
  joint?: 'butt' | 'miter';
  /** samo „Ostalo“ / ukrućenje: ručno zadata dužina i broj komada */
  lengthMm?: number;
  qty?: number;
}

export interface ExtraDim {
  id: string;
  name: string;
  valueMm: number | null;
  part: string;
  ref: string;
  /** kota koju ova dodatna kota zadaje u proračunu (veza je vidljiva uz obe kote) */
  link?: string;
  inExport: boolean;
}

export type ConfirmKind = 'mere' | 'nosivost' | 'bezbednost' | 'kompatibilnost';
export const CONFIRM_LABELS: Record<ConfirmKind, string> = {
  mere: 'Unete mere potvrđene za ovaj posao', nosivost: 'Nosivost i temelj', bezbednost: 'Bezbednost (pogon, procena rizika)', kompatibilnost: 'Kompatibilnost okova i profila',
};

export interface Confirmation { kind: ConfirmKind; hash: string; at: string; by: string; note?: string }

export interface GateDesign {
  /** samo klizne: samonoseća ili po podnoj šini */
  slide?: SlideSystem;
  /** strana gledanja crteža */
  viewFrom?: 'dvoriste' | 'ulica';
  dims: Record<string, DimValue>;
  /** kota koju računa svaka jednačina; null = sve kote zadaje radnik (odstupanje se prikazuje) */
  solve: Record<string, string | null>;
  hardware: GateHardware[];
  profiles: GateProfile[];
  extra: ExtraDim[];
  /** ručno zadate rezne mere (ključ reda krojne liste → mm) */
  cuts: Record<string, number>;
  confirmations: Confirmation[];
  /** krilo sa preklopom / u drugoj ravni (traži poseban detalj) */
  overlap?: boolean;
  /** aktivno krilo (dvokrilna) */
  activeLeaf?: 'left' | 'right';
  /** provera luka / trase */
  path?: { status: 'nije' | 'ok' | 'problem'; note?: string };
  drive?: { model?: string; doc?: string; risk?: 'nije' | 'u_toku' | 'uradjena' };
  /** konfiguracioni dokument dobavljača (naziv / broj) */
  configDoc?: string;
  template?: { id: string; name: string; version: number };
  notes?: string;
}

export function systemOf(g: Pick<Gate, 'gateType'> & { design?: GateDesign }): GateSystem {
  if (g.gateType === 'double') return 'swing_double';
  if (g.gateType === 'sliding') return g.design?.slide === 'rail' ? 'rail' : 'cantilever';
  return 'swing_single';
}

export const SYSTEM_LABELS: Record<GateSystem, string> = { swing_double: 'Dvokrilna', swing_single: 'Jednokrilna / pešačka', cantilever: 'Samonoseća klizna', rail: 'Klizna po podnoj šini' };

export const dimsFor = (sys: GateSystem): DimDef[] => DIM_DEFS.filter((d) => d.systems.includes(sys));

/* ---------- jednačine ---------- */

export interface Equation {
  id: string;
  label: string;
  systems: GateSystem[];
  /** Σ c·x = 0 */
  terms: { key: string; c: number }[];
  /** kote koje aplikacija može da računa */
  solvable: string[];
  defaultSolve: string | null;
}

export const EQUATIONS: Equation[] = [
  { id: 'double', label: 'W = gL + WL + gC + WR + gR', systems: ['swing_double'], terms: [{ key: 'W', c: 1 }, { key: 'gL', c: -1 }, { key: 'WL', c: -1 }, { key: 'gC', c: -1 }, { key: 'WR', c: -1 }, { key: 'gR', c: -1 }], solvable: ['equal', 'WL', 'WR', 'gC', 'gL', 'gR'], defaultSolve: 'equal' },
  { id: 'single', label: 'W = gH + Wk + gZ', systems: ['swing_single'], terms: [{ key: 'W', c: 1 }, { key: 'gH', c: -1 }, { key: 'Wk', c: -1 }, { key: 'gZ', c: -1 }], solvable: ['Wk', 'gH', 'gZ'], defaultSolve: 'Wk' },
  { id: 'cantL', label: 'L = W + a + b + T', systems: ['cantilever'], terms: [{ key: 'L', c: 1 }, { key: 'W', c: -1 }, { key: 'a', c: -1 }, { key: 'b', c: -1 }, { key: 'T', c: -1 }], solvable: ['L', 'T', 'a', 'b'], defaultSolve: 'L' },
  { id: 'trolley', label: 'razmak kolica = kolica 2 − kolica 1', systems: ['cantilever'], terms: [{ key: 'tD', c: 1 }, { key: 't2', c: -1 }, { key: 't1', c: 1 }], solvable: ['tD', 't2', 't1'], defaultSolve: 'tD' },
  { id: 'railL', label: 'L = W + a + b', systems: ['rail'], terms: [{ key: 'L', c: 1 }, { key: 'W', c: -1 }, { key: 'a', c: -1 }, { key: 'b', c: -1 }], solvable: ['L', 'a', 'b'], defaultSolve: 'L' },
  { id: 'wheels', label: 'razmak točkova = točak 2 − točak 1', systems: ['rail'], terms: [{ key: 'wD', c: 1 }, { key: 'w2', c: -1 }, { key: 'w1', c: 1 }], solvable: ['wD', 'w2', 'w1'], defaultSolve: 'wD' },
];

export const equationsFor = (sys: GateSystem): Equation[] => EQUATIONS.filter((e) => e.systems.includes(sys));

export function emptyDesign(sys: GateSystem): GateDesign {
  return {
    slide: sys === 'rail' ? 'rail' : sys === 'cantilever' ? 'cantilever' : undefined,
    viewFrom: 'dvoriste',
    dims: {},
    solve: Object.fromEntries(EQUATIONS.map((e) => [e.id, e.defaultSolve])),
    hardware: [], profiles: [], extra: [], cuts: {}, confirmations: [],
  };
}

/* ---------- proračun ---------- */

export type IssueLevel = 'error' | 'warn' | 'info';
export interface Issue { level: IssueLevel; msg: string; key?: string; eq?: string }

export interface ResolvedDim { v: number | null; origin: DimOrigin; status?: DimStatus; /** naziv dodatne kote koja zadaje vrednost */ via?: string; /** ručna vrednost koja se trenutno ne koristi (kota se računa) */ shadow?: number | null }

export interface EquationState { id: string; label: string; solve: string | null; residual: number | null; missing: string[] }

export interface GateResult {
  system: GateSystem;
  values: Record<string, ResolvedDim>;
  equations: EquationState[];
  issues: Issue[];
  /** izvedene mere (samo za prikaz) */
  derived: { Smin?: number | null; Pmin?: number | null; d?: number | null; shortfall?: number | null; railLen?: number | null; leafFrameW?: number | null; spread?: number | null };
  /** krila: širina i početak (x od leve ivice otvora, zatvoreno) */
  leaves: { label: string; x: number | null; w: number | null; hinge?: 'left' | 'right' }[];
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
export const fmt = (v: number | null | undefined, unit = 'mm'): string => (v === null || v === undefined ? '—' : `${String(r1(v)).replace('.', ',')}${unit ? ` ${unit}` : ''}`);

/** položaji šarki od vrha krila (mm): razmak je od prve do poslednje šarke, ostale su ravnomerno između; nikad van krila */
export function hingePositions(H: number, count: number | null, spacing: number | null, top: number | null): number[] {
  const n = Math.max(1, Math.round(count ?? 2));
  const t = top ?? 150;
  const span = spacing ?? Math.max(H - 2 * t, 0);
  const pos = n === 1 ? [t] : Array.from({ length: n }, (_, j) => t + (span * j) / (n - 1));
  return pos.map((q) => Math.min(Math.max(q, 0), H));
}

export function resolveGate(g: Gate & { design?: GateDesign }, clearWidthMm: number): GateResult {
  const sys = systemOf(g);
  const d = g.design ?? emptyDesign(sys);
  const values: Record<string, ResolvedDim> = {};
  const issues: Issue[] = [];
  const keys = dimsFor(sys).map((x) => x.key);
  for (const k of keys) {
    const dv = d.dims[k];
    values[k] = dv && num(dv.v) ? { v: dv.v, origin: dv.origin, status: dv.status } : { v: null, origin: dv?.origin ?? 'rucno', status: dv?.status };
  }
  // dodatne kote vezane za parametar zadaju njegovu vrednost
  for (const x of d.extra) if (x.link && keys.includes(x.link) && num(x.valueMm)) values[x.link] = { v: x.valueMm, origin: 'kota', status: values[x.link]?.status, via: x.name };
  // svetli otvor i visina dolaze iz projekta
  values.W = { v: clearWidthMm, origin: 'projekat', status: d.dims.W?.status };
  if (values.H.v === null) values.H = { v: g.heightMm, origin: 'projekat', status: values.H.status };

  const v = (k: string): number | null => values[k]?.v ?? null;
  const equations: EquationState[] = [];
  for (const eq of equationsFor(sys)) {
    const solve = eq.id in d.solve ? d.solve[eq.id] : eq.defaultSolve;
    if (solve === 'equal') {
      // dvokrilna, jednaka krila: WL = WR = (W − gL − gC − gR) / 2
      const rest = ['gL', 'gC', 'gR'];
      const missing = ['W', ...rest].filter((k) => v(k) === null);
      for (const k of ['WL', 'WR']) values[k] = { v: null, origin: 'proracun', status: values[k].status, shadow: values[k].v };
      if (!missing.length) {
        const w = (v('W')! - rest.reduce((s, k) => s + v(k)!, 0)) / 2;
        values.WL.v = w; values.WR.v = w;
      }
      equations.push({ id: eq.id, label: eq.label, solve, residual: null, missing });
      continue;
    }
    if (solve && eq.terms.some((t) => t.key === solve)) {
      const t0 = eq.terms.find((t) => t.key === solve)!;
      const others = eq.terms.filter((t) => t.key !== solve);
      const missing = others.filter((t) => v(t.key) === null).map((t) => t.key);
      const shadow = values[solve].origin === 'kota' ? null : values[solve].v;
      values[solve] = { v: null, origin: 'proracun', status: values[solve].status, shadow };
      if (!missing.length) values[solve].v = -others.reduce((s, t) => s + t.c * v(t.key)!, 0) / t0.c;
      equations.push({ id: eq.id, label: eq.label, solve, residual: null, missing });
      continue;
    }
    const missing = eq.terms.filter((t) => v(t.key) === null).map((t) => t.key);
    // ručni režim: ako nedostaje samo jedna kota jednačine, ona se sama izračuna (npr. svetli otvor − zazor − širina krila = drugi zazor)
    if (missing.length === 1) {
      const mk = missing[0]; const tm = eq.terms.find((t) => t.key === mk)!;
      values[mk] = { v: -eq.terms.filter((t) => t.key !== mk).reduce((s, t) => s + t.c * v(t.key)!, 0) / tm.c, origin: 'proracun', status: values[mk].status };
      equations.push({ id: eq.id, label: eq.label, solve: null, residual: 0, missing: [] });
      continue;
    }
    const residual = missing.length ? null : eq.terms.reduce((s, t) => s + t.c * v(t.key)!, 0);
    equations.push({ id: eq.id, label: eq.label, solve: null, residual, missing });
    if (residual !== null && Math.abs(residual) > 0.05) {
      const first = eq.terms[0];
      const sumOthers = eq.terms.slice(1).reduce((s, t) => s - t.c * v(t.key)!, 0);
      issues.push({ level: 'error', eq: eq.id, msg: `Kote se ne slažu (${eq.label}): ${DIM_BY_KEY[first.key].label} je ${fmt(v(first.key))}, a zbir ostalih ${fmt(sumOthers)} — razlika ${fmt(Math.abs(residual))}. Izaberite kotu koju aplikacija koriguje.` });
    }
  }

  // šarke moraju da stanu u krilo: gornja šarka od vrha + razmak do donje ne sme preći visinu krila
  if (sys === 'swing_single' || sys === 'swing_double') {
    const Hh = v('H'); const sp = v('hingeSpacing'); const hT = v('hingeTop') ?? 150;
    if (Hh !== null && sp !== null && Math.round(v('hingeCount') ?? 2) >= 2 && hT + sp > Hh + 1e-9) {
      issues.push({ level: 'error', key: 'hingeSpacing', msg: `Šarke izlaze van krila: gornja šarka je ${fmt(hT)} od vrha, a razmak od prve do poslednje ${fmt(sp)} — donja šarka bi bila ${fmt(hT + sp - Hh)} ispod dna krila (visina krila ${fmt(Hh)}).` });
    }
  }

  const derived: GateResult['derived'] = {};
  const leaves: GateResult['leaves'] = [];
  const W = v('W');
  if (sys === 'swing_double') {
    const gL = v('gL'); const WL = v('WL'); const gC = v('gC');
    leaves.push({ label: 'Levo krilo', x: gL, w: WL, hinge: 'left' });
    leaves.push({ label: 'Desno krilo', x: gL !== null && WL !== null && gC !== null ? gL + WL + gC : W !== null && v('gR') !== null && v('WR') !== null ? W - v('gR')! - v('WR')! : null, w: v('WR'), hinge: 'right' });
  } else if (sys === 'swing_single') {
    const hingeLeft = g.opening === 'left';
    const gH = v('gH'); const Wk = v('Wk'); const gZ = v('gZ');
    leaves.push({ label: 'Krilo', x: hingeLeft ? gH : W !== null && gH !== null && Wk !== null ? W - gH - Wk : gZ, w: Wk, hinge: hingeLeft ? 'left' : 'right' });
  } else {
    const a = v('a'); const e = v('e'); const S = v('S'); const R = v('R'); const b = v('b');
    const T = sys === 'cantilever' ? v('T') : 0;
    derived.Smin = W !== null && a !== null && e !== null ? W + a + e : null;
    if (S === null && derived.Smin !== null) values.S = { v: derived.Smin, origin: 'proracun', status: values.S.status };
    const s = v('S');
    derived.d = s !== null && W !== null && a !== null ? s - W - a : null;
    derived.Pmin = b !== null && T !== null && s !== null && R !== null ? b + T + s + R : null;
    const P = v('P');
    derived.shortfall = derived.Pmin !== null && P !== null ? Math.max(0, derived.Pmin - P) : null;
    derived.leafFrameW = W !== null && a !== null && b !== null ? W + a + b : null;
    leaves.push({ label: 'Krilo', x: a !== null ? -a : null, w: derived.leafFrameW });
    if (sys === 'rail') {
      const wD = v('wD'); const re = v('railEnd');
      derived.railLen = s !== null && wD !== null && re !== null ? s + wD + 2 * re : null;
    }
  }
  const fw = ['wTop', 'wMid', 'wBot'].map(v).filter(num);
  if (fw.length >= 2) derived.spread = Math.max(...fw) - Math.min(...fw);

  checkGate(g, d, sys, values, derived, issues);
  return { system: sys, values, equations, issues, derived, leaves };
}

function checkGate(g: Gate, d: GateDesign, sys: GateSystem, values: Record<string, ResolvedDim>, der: GateResult['derived'], issues: Issue[]) {
  const v = (k: string): number | null => values[k]?.v ?? null;
  // geometrija: negativne vrednosti (računate ili unete) nisu moguće tamo gde mera ne može biti negativna
  for (const def of dimsFor(sys)) {
    const x = v(def.key);
    if (x === null) continue;
    const min = def.min ?? 0;
    if (x < min - 1e-9) issues.push({ level: 'error', key: def.key, msg: values[def.key].origin === 'proracun' ? `${def.label}: izračunato ${fmt(x, def.unit ?? 'mm')} — nije moguće. Proverite ostale kote ili izaberite drugu kotu za proračun.` : `${def.label}: ${fmt(x, def.unit ?? 'mm')} nije moguća vrednost (najmanje ${min}).` });
  }
  // terenske širine
  const W = v('W');
  const fw = (['wTop', 'wMid', 'wBot'] as const).map((k) => [k, v(k)] as const).filter(([, x]) => num(x)) as [string, number][];
  if (fw.length >= 2 && der.spread !== null && der.spread !== undefined && der.spread > 10) issues.push({ level: 'warn', key: 'wMid', msg: `Terenske širine se razlikuju za ${fmt(der.spread)} (gore/sredina/dole): proverite vertikalnost stubova pre izrade.` });
  if (fw.length && W !== null) {
    const min = Math.min(...fw.map(([, x]) => x));
    if (W > min + 0.5) issues.push({ level: 'warn', key: 'W', msg: `Usvojeni svetli otvor ${fmt(W)} je veći od najmanje izmerene širine ${fmt(min)}.` });
  } else if (!fw.length) issues.push({ level: 'info', key: 'wMid', msg: 'Terenske širine (gore, sredina, dole) nisu unete.' });

  // šarke: kota B uz svaku stranu
  const hw = d.hardware;
  const hingeFor = (side: 'left' | 'right') => hw.find((h) => h.role === (side === 'left' ? 'hinge_left' : 'hinge_right')) ?? hw.find((h) => h.role === 'hinge');
  const gapCheck = (h: GateHardware | undefined, key: string, what: string) => {
    if (!h) return;
    const x = v(key);
    const lbl = DIM_BY_KEY[key].label;
    if (x === null) { issues.push({ level: 'warn', key, msg: `Nedostaje ${lbl.toLowerCase()} za ${what} „${h.name}“.` }); return; }
    if (num(h.minGapMm) && x < h.minGapMm - 1e-9) issues.push({ level: 'warn', key, msg: `${lbl} ${fmt(x)} je manji od minimuma ${fmt(h.minGapMm)} za ${what} „${h.name}${h.code ? ` (${h.code})` : ''}“. Mera ostaje sačuvana kao ručni unos.` });
    if (num(h.maxGapMm) && x > h.maxGapMm + 1e-9) issues.push({ level: 'warn', key, msg: `${lbl} ${fmt(x)} je veći od dokumentovanog maksimuma ${fmt(h.maxGapMm)} za ${what} „${h.name}“.` });
  };
  if (sys === 'swing_double') {
    gapCheck(hingeFor('left'), 'gL', 'levu šarku');
    gapCheck(hingeFor('right'), 'gR', 'desnu šarku');
    const lock = hw.find((h) => h.role === 'lock');
    if (lock) {
      if (v('gC') === null) issues.push({ level: 'warn', key: 'gC', msg: 'Nedostaje srednji zazor za izabranu bravu i prihvatnik.' });
      else gapCheck(lock, 'gC', 'bravu i prihvatnik');
    }
    if (d.overlap) issues.push({ level: 'warn', msg: 'Krilo sa preklopom ili u drugoj ravni: proračun pokriva krila u istoj ravni — potreban je poseban kotirani detalj.' });
    if (!d.activeLeaf) issues.push({ level: 'info', msg: 'Aktivno krilo nije izabrano.' });
  }
  if (sys === 'swing_single') {
    gapCheck(hingeFor(g.opening), 'gH', 'šarku');
    const lock = hw.find((h) => h.role === 'lock');
    if (lock) gapCheck(lock, 'gZ', 'bravu i prihvatnik');
  }
  const stop = hw.find((h) => h.role === 'ground_stop');
  if (stop) gapCheck(stop, 'gB', 'graničnik');
  // širina krila uz okov
  for (const h of hw) {
    if (!num(h.maxLeafWidthMm)) continue;
    const widths = sys === 'swing_double' ? [v('WL'), v('WR')] : sys === 'swing_single' ? [v('Wk')] : [];
    for (const w of widths) if (w !== null && w > h.maxLeafWidthMm) issues.push({ level: 'warn', msg: `Krilo ${fmt(w)} je šire od ${fmt(h.maxLeafWidthMm)} koje navodi dokument za „${h.name}“.` });
    if (SL_SYS(sys) && W !== null && num(h.maxOpeningMm) && W > h.maxOpeningMm) issues.push({ level: 'warn', msg: `Otvor ${fmt(W)} je veći od ${fmt(h.maxOpeningMm)} za komplet „${h.name}“.` });
  }
  if (SL_SYS(sys)) {
    if (der.shortfall !== null && der.shortfall !== undefined && der.shortfall > 0.05) issues.push({ level: 'error', key: 'P', msg: `Nedostaje ${fmt(der.shortfall)} prostora na strani otvaranja (potrebno ${fmt(der.Pmin)}, raspoloživo ${fmt(v('P'))}).` });
    else if (der.shortfall === 0) issues.push({ level: 'info', key: 'P', msg: `Bočni prostor je dovoljan (potrebno ${fmt(der.Pmin)}, raspoloživo ${fmt(v('P'))}).` });
    else if (v('P') === null) issues.push({ level: 'warn', key: 'P', msg: 'Raspoloživ bočni prostor na strani otvaranja nije unet.' });
    const S = v('S');
    if (S !== null && der.Smin !== null && der.Smin !== undefined && S < der.Smin - 0.05) issues.push({ level: 'error', key: 'S', msg: `Hod ${fmt(S)} ne oslobađa ceo otvor: potrebno najmanje ${fmt(der.Smin)} (W + a + e).` });
    if (sys === 'cantilever') {
      const b = v('b'); const T = v('T'); const a = v('a');
      for (const k of ['t1', 't2'] as const) {
        const t = v(k);
        if (t === null || b === null || T === null) continue;
        if (t > b + T + 1e-9) issues.push({ level: 'error', key: k, msg: `${DIM_BY_KEY[k].label} (${fmt(t)}) je iza kraja nosećeg profila u zatvorenom položaju (b + T = ${fmt(b + T)}).` });
        if (S !== null && W !== null && a !== null && t < S - a - W - 1e-9) issues.push({ level: 'error', key: k, msg: `${DIM_BY_KEY[k].label} (${fmt(t)}) ostaje bez nosećeg profila u otvorenom položaju (prednja ivica je na ${fmt(S - a - W)} od desne ivice otvora).` });
      }
      if (v('t1') !== null && v('t2') !== null && v('t2')! <= v('t1')!) issues.push({ level: 'warn', key: 't2', msg: 'Kolica 2 treba da budu dalje od otvora od kolica 1.' });
      if (W !== null && T !== null && T > 0 && W > 0 && (T / W < 0.3 || T / W > 0.45)) issues.push({ level: 'info', key: 'T', msg: `Rep je ${Math.round((T / W) * 100)}% otvora; jedan katalog navodi tipično 30–40% — proverite sa konfiguracionim listom dobavljača.` });
    }
  }
}

const SL_SYS = (s: GateSystem) => s === 'cantilever' || s === 'rail';

/* ---------- izmene ---------- */

export function setDim(d: GateDesign, key: string, value: number | null, origin: DimOrigin = 'rucno'): GateDesign {
  const prev = d.dims[key];
  const dims = { ...d.dims, [key]: { v: value, origin, status: prev?.status ?? 'radna' } };
  // radnik preuzima kotu koju aplikacija računa: jednačina prelazi u „sve zadato“, a odstupanje se prikazuje dok ne izabere
  const solve = { ...d.solve };
  for (const eq of EQUATIONS) {
    const s = eq.id in solve ? solve[eq.id] : eq.defaultSolve;
    if (s === key || (s === 'equal' && (key === 'WL' || key === 'WR'))) {
      if (s === 'equal' && key === 'WL') solve[eq.id] = 'WR';
      else if (s === 'equal' && key === 'WR') solve[eq.id] = 'WL';
      else solve[eq.id] = null;
    }
  }
  return { ...d, dims, solve };
}

export function setDimStatus(d: GateDesign, key: string, status: DimStatus): GateDesign {
  const prev = d.dims[key] ?? { v: null, origin: 'rucno' as DimOrigin };
  return { ...d, dims: { ...d.dims, [key]: { ...prev, status } } };
}

export function setSolve(d: GateDesign, eqId: string, key: string | null): GateDesign {
  return { ...d, solve: { ...d.solve, [eqId]: key } };
}

/** preslikavanje leve i desne strane (dvokrilna i jednokrilna): zazori i širine menjaju strane */
export function mirrorDesign(d: GateDesign): GateDesign {
  const swap: [string, string][] = [['gL', 'gR'], ['WL', 'WR'], ['gH', 'gZ']];
  const dims = { ...d.dims };
  for (const [a, b] of swap) { const x = dims[a]; const y = dims[b]; if (y) dims[a] = y; else delete dims[a]; if (x) dims[b] = x; else delete dims[b]; }
  const solve = { ...d.solve };
  const sw = (k: string | null) => (k === null ? null : swap.reduce<string>((acc, [a, b]) => (acc === a ? b : acc === b ? a : acc), k));
  for (const id of Object.keys(solve)) solve[id] = sw(solve[id]);
  const hardware = d.hardware.map((h) => (h.role === 'hinge_left' ? { ...h, role: 'hinge_right' as HwRole } : h.role === 'hinge_right' ? { ...h, role: 'hinge_left' as HwRole } : h));
  const activeLeaf = d.activeLeaf === 'left' ? 'right' : d.activeLeaf === 'right' ? 'left' : undefined;
  return { ...d, dims, solve, hardware, activeLeaf };
}

/** otisak konfiguracije: potvrda važi samo dok se konfiguracija ne promeni */
export function configHash(g: Gate & { design?: GateDesign }, clearWidthMm: number): string {
  const d = g.design;
  const payload = JSON.stringify({
    t: g.gateType, i: g.infillModelId, h: g.heightMm, w: Math.round(clearWidthMm * 10), o: g.opening, a: g.automation,
    dims: d ? Object.fromEntries(Object.entries(d.dims).filter(([, x]) => x.v !== null).map(([k, x]) => [k, x.v]).sort()) : {},
    s: d?.solve, hw: d?.hardware.map((h) => [h.role, h.name, h.code, h.minGapMm, h.maxGapMm, h.qty]), p: d?.profiles.map((p) => [p.role, p.name, p.faceMm, p.kgPerM, p.joint, p.lengthMm, p.qty]),
    x: d?.extra.map((x) => [x.name, x.valueMm, x.link]), c: d?.cuts, sl: d?.slide, ov: d?.overlap,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function confirmationState(g: Gate & { design?: GateDesign }, clearWidthMm: number, kind: ConfirmKind): 'valid' | 'stale' | 'none' {
  const c = [...(g.design?.confirmations ?? [])].reverse().find((x) => x.kind === kind);
  if (!c) return 'none';
  return c.hash === configHash(g, clearWidthMm) ? 'valid' : 'stale';
}

/** radne vrednosti iz računskih primera specifikacije (označene kao radna pretpostavka) */
export const EXAMPLE_DIMS: Record<GateSystem, Record<string, number>> = {
  swing_double: { gL: 25, gC: 10, gR: 25 },
  swing_single: { gH: 25, gZ: 10 },
  cantilever: { a: 50, b: 50, T: 1400, e: 0, R: 100 },
  rail: { a: 50, b: 50, e: 0, R: 100, railEnd: 100 },
};

export function applyExample(d: GateDesign, sys: GateSystem): GateDesign {
  const dims = { ...d.dims };
  for (const [k, x] of Object.entries(EXAMPLE_DIMS[sys])) if (!dims[k] || dims[k].v === null) dims[k] = { v: x, origin: 'katalog', status: 'radna' };
  return { ...d, dims };
}

/* ---------- okovi koji uz kapiju moraju da postoje ---------- */

export interface RequiredHw { role: HwRole; qty: number }

/** okovi koje kapija ovog sistema mora da ima; radnik ih sam upisuje, a dok ne upiše, u sastavnici piše „nepoznata oznaka“ */
export function requiredHardware(g: Pick<Gate, 'automation'>, sys: GateSystem): RequiredHw[] {
  const base: RequiredHw[] = sys === 'swing_double'
    ? [{ role: 'hinge_left', qty: 2 }, { role: 'hinge_right', qty: 2 }, { role: 'lock', qty: 1 }, { role: 'drop_bolt', qty: 1 }, { role: 'ground_stop', qty: 1 }]
    : sys === 'swing_single'
      ? [{ role: 'hinge', qty: 2 }, { role: 'lock', qty: 1 }, { role: 'ground_stop', qty: 1 }]
      : sys === 'cantilever'
        ? [{ role: 'trolley', qty: 2 }, { role: 'guide', qty: 1 }, { role: 'receiver', qty: 1 }, { role: 'stopper', qty: 1 }, { role: 'lock', qty: 1 }]
        : [{ role: 'wheel', qty: 2 }, { role: 'rail', qty: 1 }, { role: 'guide', qty: 1 }, { role: 'receiver', qty: 1 }, { role: 'stopper', qty: 1 }, { role: 'lock', qty: 1 }];
  return g.automation ? [...base, { role: 'motor', qty: 1 }] : base;
}

/** okovi koje radnik još nije upisao (nema ni jednog sa tom ulogom i nazivom) */
export function missingHardware(g: Pick<Gate, 'automation'> & { design?: GateDesign }, sys: GateSystem): RequiredHw[] {
  const have = new Set((g.design?.hardware ?? []).filter((h) => h.name.trim()).map((h) => h.role));
  return requiredHardware(g, sys).filter((r) => !have.has(r.role));
}

export const unknownHwLabel = (role: HwRole): string => `${HW_ROLE_LABELS[role]} — nepoznata oznaka`;
