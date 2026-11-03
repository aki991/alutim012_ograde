import { computeInfill } from '../geometry/infill';
import { computeLayout } from '../geometry/layout';
import type { FenceSection, LouverSpec, Project } from '../models/types';
import { itemLabel } from '../../utils/labels';
import { hasCustomSpec, type ModelSpecs } from '../models/spec';
import { planBars, RAIL04 } from './railSpec';

/**
 * Radna sastavnica i krojna lista za model 08 („Svetlosiva — horizontalne žaluzine").
 * Panel: dve bočne U vođice + N horizontalnih letvica 80 × 20 koje ulaze u vođice. Podaci radnika i cenovnika su
 * NEPOTVRĐENI: profil, zid, zazor, nagib i spoj su zasebna polja (`Project.louverSpec`), a rezultat je „radno — čeka potvrdu".
 */
export const LOUVER08_MODEL = 'louver_light';

export const isLouver08 = (it: { kind: string; modelId?: string }): boolean => it.kind === 'fence' && it.modelId === LOUVER08_MODEL;

/** Profili modela 08 (mm): letvica 80 × 20, U vođica 60 × 28; nagib letvice je radna pretpostavka (nije potvrđen). */
export const LOUVER08_PROFILE = {
  slatWidthMm: 80,
  slatThicknessMm: 20,
  tiltDeg: 35,
  uWebMm: 60,
  uFlangeMm: 28,
  uWallMm: 2,
} as const;

export const DEFAULT_LOUVER_SPEC: LouverSpec = {
  guideProfile: 'u60x28',
  fillProfile: 'kv7',
  wallMm: 2,
  clearanceMm: 2,
  guideExtraMm: 0,
  guideCaps: false,
  fillCaps: false,
  priceBasis: 'per_m',
  support: 'Prema projektu ugradnje',
};

export const GUIDE_PROFILES: Record<LouverSpec['guideProfile'], { label: string; materialId: string; code: string }> = {
  u60x28: { label: 'U 60 × 28 (podatak radnika; šifra, zid i cena nisu potvrđeni)', materialId: 'mat_u_60x28', code: 'U 60 × 28' },
  u60x20x2: { label: 'U 60 × 20 × 2 (KU000002, cenovnik) — zamena, nije isto što i U 60 × 28', materialId: 'mat_ek_ku000002', code: 'KU000002' },
};

export const FILL_PROFILES: Record<LouverSpec['fillProfile'], { label: string; materialId: string; code: string }> = {
  kv7: { label: 'Pravougaona cev 80 × 20 × 1 mm (KV000007, sirovo)', materialId: 'mat_ek_kv000007', code: 'KV000007' },
  kv16: { label: 'Pravougaona cev 80 × 20 × 1,4 mm (KV000016, sirovo)', materialId: 'mat_ek_kv000016', code: 'KV000016' },
  kz3: { label: 'Zakošena letvica 80 × 20 × 1 mm (KZ000003, sirovo)', materialId: 'mat_ek_kz000003', code: 'KZ000003' },
  kz4: { label: 'Zakošena letvica 80 × 20 × 1 mm (KZ000004, boja 7016)', materialId: 'mat_ek_kz000004', code: 'KZ000004' },
};

export const louverSpecOf = (project: Pick<Project, 'louverSpec'>): LouverSpec => ({ ...DEFAULT_LOUVER_SPEC, ...project.louverSpec });

export interface Louver08Panel {
  name: string;
  /** redni broj elementa u projektu (od 0) */
  index: number;
  /** spoljna širina i visina panela (svetli otvor između stubova × visina) */
  widthMm: number;
  heightMm: number;
  /** broj horizontalnih letvica (iz visine letvice i razmaka) */
  count: number;
  /** rezna dužina letvice: L = W − 2·zid − zazor */
  fillLenMm: number;
  /** rezna dužina bočne vođice: H_U = H + korekcija završetaka */
  guideLenMm: number;
}

export interface LouverRow { pos: number; part: string; code: string; qty: string; note: string }
export interface LouverCutRow { mark: string; part: string; profile: string; qty: number; lengthMm: number; totalMm: number }
export interface LouverBarRow { profile: string; pieces: string; leftoverMm: number }

export interface Louver08Quantities {
  guideLens: number[];
  fillLens: number[];
  /** površina za završnu obradu (m²) */
  areaM2: number;
  /** nabavne šipke (kom) po profilu */
  guideBars: number;
  fillBars: number;
}

export interface Louver08Sheet {
  spec: LouverSpec;
  panels: Louver08Panel[];
  bom: LouverRow[];
  cuts: LouverCutRow[];
  bars: LouverBarRow[];
  quantities: Louver08Quantities;
  notes: string[];
  /** radno stanje: do potvrde profila i spoja */
  status: string;
}

export function louver08Panels(project: Project): Louver08Panel[] {
  const layout = computeLayout(project);
  const spec = louverSpecOf(project);
  const out: Louver08Panel[] = [];
  for (const li of layout.items) {
    if (!isLouver08(li.item)) continue;
    const f = li.item as FenceSection;
    const geo = computeInfill(f.modelId, li.clearWidth, f.heightMm, f.params.frameMm, f.params.barSizeMm, f.params.gapMm, f.params.barCount);
    const count = geo.bars.filter((b) => b.tone === 'main').length;
    out.push({
      name: itemLabel(project.items, li.index),
      index: li.index,
      widthMm: Math.round(li.clearWidth),
      heightMm: f.heightMm,
      count,
      fillLenMm: Math.max(0, Math.round(li.clearWidth - 2 * spec.wallMm - spec.clearanceMm)),
      guideLenMm: Math.max(0, f.heightMm + spec.guideExtraMm),
    });
  }
  return out;
}

const group = (lens: number[]): { len: number; qty: number }[] => {
  const m = new Map<number, number>();
  for (const l of lens) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([len, qty]) => ({ len, qty }));
};

export function buildLouver08Sheet(project: Project, specs?: ModelSpecs): Louver08Sheet | null {
  if (hasCustomSpec(LOUVER08_MODEL, specs)) return null; // izmenjena specifikacija zamenjuje radnu sastavnicu
  const panels = louver08Panels(project);
  if (!panels.length) return null;
  const spec = louverSpecOf(project);
  const nP = panels.length;
  const guideLens = panels.flatMap((p) => [p.guideLenMm, p.guideLenMm]);
  const fillLens = panels.flatMap((p) => Array<number>(p.count).fill(p.fillLenMm));
  const nFill = fillLens.length;
  const areaM2 = panels.reduce((s, p) => s + (p.widthMm * p.heightMm) / 1_000_000, 0);
  const guide = GUIDE_PROFILES[spec.guideProfile];
  const fill = FILL_PROFILES[spec.fillProfile];

  const bom: LouverRow[] = [
    { pos: 1, part: 'Bočna vođica U 60 × 28', code: guide.code, qty: `${2 * nP} kom`, note: 'Podatak radnika; presek, zid i šifra za potvrdu' },
    { pos: 2, part: 'Horizontalna ispuna 80 × 20', code: fill.code, qty: `${nFill} kom`, note: 'Kutijasti profil po poruci radnika; debljina zida i tačna šifra nisu potvrđeni' },
    { pos: 3, part: 'Spoj / prihvat kraja letvice u vođici', code: 'Nije određeno', qty: `${2 * nFill} mesta spoja`, note: 'Nije isto što i 2N vijaka; vrsta i sadržaj spoja nisu poznati' },
    { pos: 4, part: 'Pričvršćenje panela na stvarne oslonce', code: spec.support || 'Prema projektu ugradnje', qty: 'prema projektu', note: 'Ne određivati ankere i njihov broj iz fotografije' },
    { pos: 5, part: 'Završetak vrha U vođice', code: 'Nije određeno', qty: spec.guideCaps ? `${2 * nP} kom` : `moguće ${2 * nP} kom`, note: spec.guideCaps ? 'Uključeno u obračun' : 'Uslovno: samo ako sistem ima kompatibilan završetak (nije u obračunu)' },
    { pos: 6, part: 'Završeci krajeva horizontalnih profila', code: 'Nije određeno', qty: spec.fillCaps ? `${2 * nFill} kom` : `moguće do ${2 * nFill} kom`, note: spec.fillCaps ? 'Uključeno u obračun' : 'Samo ako ih sistem zahteva; krajevi su verovatno sakriveni u U vođicama' },
    { pos: 7, part: 'Završna površinska obrada', code: 'Prema potvrđenoj specifikaciji', qty: `${areaM2.toLocaleString('sr-RS', { maximumFractionDigits: 2 })} m²`, note: 'Boja, priprema i redosled obrade za potvrdu; sirov aluminijum nije svetlosivi panel' },
    { pos: 8, part: 'Montažni potrošni materijal', code: 'Prema postupku', qty: 'prema potrošnji', note: 'Ne računati celo pakovanje kao potrošnju jednog panela' },
  ];

  const cuts: LouverCutRow[] = [];
  group(guideLens).forEach((g, i) => cuts.push({ mark: `U-${String(i + 1).padStart(2, '0')}`, part: 'Bočna vođica U 60 × 28', profile: guide.code, qty: g.qty, lengthMm: g.len, totalMm: g.qty * g.len }));
  group(fillLens).forEach((g, i) => cuts.push({ mark: `L-${String(i + 1).padStart(2, '0')}`, part: 'Horizontalna letvica 80 × 20', profile: fill.code, qty: g.qty, lengthMm: g.len, totalMm: g.qty * g.len }));

  const bars: LouverBarRow[] = [];
  let guideBars = 0;
  let fillBars = 0;
  for (const [label, lens, which] of [[`Vođica — ${guide.code}`, guideLens, 'g'], [`Letvice — ${fill.code}`, fillLens, 'f']] as const) {
    const plan = planBars([...lens]);
    plan.bars.forEach((b, i) => bars.push({ profile: plan.bars.length > 1 ? `${label} (šipka ${i + 1})` : label, pieces: group(b).map((g) => (g.qty > 1 ? `${g.qty} × ${g.len}` : String(g.len))).join(' + '), leftoverMm: plan.leftover[i] }));
    if (which === 'g') guideBars = plan.bars.length; else fillBars = plan.bars.length;
  }

  const notes = [
    'RADNO — čeka potvrdu profila i spoja. Rezne mere nisu za slanje na sečenje dok se ne potvrde presek U vođice, debljina zida, zazor i položaj prvog i poslednjeg elementa.',
    `L = W − 2·s − c = svetli otvor − 2 × ${spec.wallMm} − ${spec.clearanceMm} mm; H_U = H + ${spec.guideExtraMm} mm. Zid s i zazor c su pretpostavke koje se menjaju u poljima iznad.`,
    'Broj letvica N dolazi iz visine letvice (vertikalne projekcije) i razmaka u svojstvima elementa; H = gornji pojas + h_v + (N − 1) × p + donji pojas. Ne računati N samo kao H / 80.',
    'U 60 × 28 nije u cenovniku Ekoluka Key (KU000002 je U 60 × 20 × 2 i nije zamena). Cena U 60 × 28 se unosi ručno u listi materijala. Obična cev (KV) i zakošena letvica (KZ) su alternativni izbori ispune, ne sabiraju se.',
    'Cenovničke vrednosti su prepisane i ne znamo da li su po metru ili po šipki od 6 m: izabrana osnovica cene utiče samo na nabavnu količinu u obračunu.',
    'Stubovi, stope i sidrenje nisu deo ovog uzorka; obračunavaju se kao zaseban sklop prema projektu ugradnje.',
    `Raspored na šipke: nabavna dužina ${RAIL04.stockMm} mm i rez ${RAIL04.kerfMm} mm su pretpostavke; ostaci su potencijalno upotrebljiv materijal.`,
  ];

  return { spec, panels, bom, cuts, bars, quantities: { guideLens, fillLens, areaM2, guideBars, fillBars }, notes, status: 'radno — čeka potvrdu profila i spoja' };
}
