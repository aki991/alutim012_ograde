import { computeInfill } from '../geometry/infill';
import { computeLayout } from '../geometry/layout';
import type { FenceSection, Project } from '../models/types';
import { itemLabel } from '../../utils/labels';
import { isCorner } from '../geometry/corner';
import { hasCustomSpec, type ModelSpecs } from '../models/spec';

/**
 * Ugaoni spoj (savijanje između dva stuba) ne prekida niz: rukohvat i prečke idu neprekinuto kroz spoj i savijaju se.
 * Sastavnica i krojna lista za model 04 („Srebrni stubovi — crne prečke").
 * Izvedba iz primera: stubovi Ø40 (PEGA 06), okrugli rukohvat Ø50 (PEGA 04), prečke Ø16 (PEGA 2275/1) u prolaznim
 * nosačima ispred stubova. Rukohvat i prečke se seku u najdužim mogućim komadima: susedna polja istog modela i iste
 * visine čine jedan niz, pa se za niz koristi jedan neprekinut komad (do nabavne dužine šipke).
 * PLANERSKE mere — profile, nosače i prepuste čepova treba potvrditi sa dobavljačem.
 */
export const RAIL04_MODEL = 'rail_black';

export const RAIL04 = {
  postDiaMm: 40,
  railDiaMm: 50,
  rodDiaMm: 16,
  /** prepust prečke i rukohvata preko ose krajnjeg stuba niza */
  overhangMm: 20,
  /** nabavna dužina šipki i širina reza testere (pretpostavka iz primera) */
  stockMm: 6000,
  kerfMm: 3,
  /** pokrivne lajsne: 2 kanala po stubu, dužine stuba */
  channelsPerPost: 2,
} as const;

export const isRail04 = (it: { kind: string; modelId?: string }): boolean => it.kind === 'fence' && it.modelId === RAIL04_MODEL;

export interface Rail04Panel {
  name: string;
  /** redni broj elementa u projektu (od 0) */
  index: number;
  /** razmak osa stubova (modul) */
  axisMm: number;
  heightMm: number;
  /** visine osa prečki od donjeg kraja stuba */
  rodHeightsMm: number[];
}

/** Niz susednih polja modela 04 iste visine i istog rasporeda prečki: rukohvat i prečke idu neprekinuto. */
export interface Rail04Run {
  panels: Rail04Panel[];
  /** razmak osa prvog i poslednjeg stuba niza */
  axisTotalMm: number;
  /** potrebna dužina rukohvata i prečki: razmak osa + prepust sa obe strane */
  lengthMm: number;
  /** stvarni komadi (jedan ako staje u šipku; inače više komada) */
  pieceLensMm: number[];
  /** komad skraćen na nabavnu dužinu jer je prepust preko nje (mm), 0 ako nije */
  trimmedMm: number;
  rodHeightsMm: number[];
  heightMm: number;
  postCount: number;
  /** ugaoni spojevi u nizu: ugao savijanja i mesto savijanja mereno duž cevi od početka komada (mm) */
  bends: { deg: number; atMm: number }[];
  /** broj elemenata (polja i spojeva) u nizu, prvi i poslednji indeks u projektu */
  firstIndex: number;
  lastIndex: number;
}

export interface Rail04Post { name: string; heightMm: number }

export function rail04Panels(project: Project): Rail04Panel[] {
  const layout = computeLayout(project);
  const out: Rail04Panel[] = [];
  for (const li of layout.items) {
    const it = li.item;
    if (!isRail04(it)) continue;
    const f = it as FenceSection;
    const geo = computeInfill(f.modelId, li.clearWidth, f.heightMm, f.params.frameMm, f.params.barSizeMm, f.params.gapMm, f.params.barCount);
    const rods = geo.bars.filter((b) => b.tone === 'main').map((b) => Math.round(f.heightMm - (b.y + b.h / 2))).sort((a, b) => a - b);
    out.push({ name: itemLabel(project.items, li.index), index: li.index, axisMm: li.axisEnd - li.axisStart, heightMm: f.heightMm, rodHeightsMm: rods });
  }
  return out;
}

/** Deli dužinu na najduže moguće komade; prepust do 2 × 20 mm preko šipke se skraćuje umesto da pravi dodatni komad. */
export function splitLength(lengthMm: number, stockMm: number = RAIL04.stockMm, overhangMm: number = RAIL04.overhangMm): { pieces: number[]; trimmedMm: number } {
  const L = Math.round(lengthMm);
  if (L <= stockMm) return { pieces: [L], trimmedMm: 0 };
  if (L - stockMm <= 2 * overhangMm) return { pieces: [stockMm], trimmedMm: L - stockMm };
  const pieces: number[] = [];
  let rest = L;
  while (rest > stockMm) { pieces.push(stockMm); rest -= stockMm; }
  if (rest > 0) pieces.push(rest);
  return { pieces, trimmedMm: 0 };
}

export function rail04Runs(project: Project): Rail04Run[] {
  const layout = computeLayout(project);
  const runs: Rail04Run[] = [];
  interface Cur { panels: Rail04Panel[]; first: number; last: number; length: number; bends: { deg: number; atMm: number }[] }
  let current: Cur | null = null;
  let pending: { gapMm: number; deg: number; index: number } | null = null;
  const flush = () => {
    if (!current) return;
    const panels = current.panels;
    const axisTotalMm = current.length;
    const lengthMm = Math.round(axisTotalMm + 2 * RAIL04.overhangMm);
    const { pieces, trimmedMm } = splitLength(lengthMm);
    runs.push({
      panels, axisTotalMm, lengthMm, pieceLensMm: pieces, trimmedMm, rodHeightsMm: panels[0].rodHeightsMm, heightMm: panels[0].heightMm,
      postCount: current.last - current.first + 2, bends: current.bends, firstIndex: current.first, lastIndex: current.last,
    });
    current = null;
  };
  for (const li of layout.items) {
    if (isCorner(li.item)) {
      // spoj nastavlja niz samo ako iza njega ide ograda sa istim rasporedom prečki
      if (current && current.last === li.index - 1) pending = { gapMm: li.axisEnd - li.axisStart, deg: (li.item as { bendDeg: number }).bendDeg, index: li.index };
      else { flush(); pending = null; }
      continue;
    }
    if (!isRail04(li.item)) { flush(); pending = null; continue; }
    const f = li.item as FenceSection;
    const geo = computeInfill(f.modelId, li.clearWidth, f.heightMm, f.params.frameMm, f.params.barSizeMm, f.params.gapMm, f.params.barCount);
    const rods = geo.bars.filter((b) => b.tone === 'main').map((b) => Math.round(f.heightMm - (b.y + b.h / 2))).sort((a, b) => a - b);
    const panel: Rail04Panel = { name: itemLabel(project.items, li.index), index: li.index, axisMm: li.axisEnd - li.axisStart, heightMm: f.heightMm, rodHeightsMm: rods };
    const adjacent = current && (current.last === li.index - 1 || (pending && current.last === pending.index - 1 && pending.index === li.index - 1));
    const same = Boolean(adjacent) && current!.panels[0].heightMm === panel.heightMm && current!.panels[0].rodHeightsMm.join() === rods.join();
    if (!same) { flush(); pending = null; }
    if (!current) current = { panels: [], first: li.index, last: li.index, length: 0, bends: [] };
    if (pending && same) {
      // savijanje je na sredini razmaka; mesto se meri od početka komada (prepust + dužina do spoja)
      current.bends.push({ deg: pending.deg, atMm: Math.round(RAIL04.overhangMm + current.length + pending.gapMm / 2) });
      current.length += pending.gapMm;
    }
    pending = null;
    current.panels.push(panel);
    current.length += panel.axisMm;
    current.last = li.index;
  }
  flush();
  return runs;
}

/** Stubovi koji nose bar jedno polje modela 04 (zajednički stub se računa jednom). */
export function rail04Posts(project: Project): Rail04Post[] {
  return project.posts
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => [project.items[i - 1], project.items[i]].some((it) => it && isRail04(it)))
    .map(({ p, i }) => ({ name: `Stub S${i + 1}`, heightMm: p.heightMm }));
}

export interface SheetBomRow { pos: number; part: string; code: string; qty: string; note: string }
export interface SheetCutRow { mark: string; part: string; profile: string; qty: number; lengthMm: number; totalMm: number; cut: string }
export interface BarPlanRow { profile: string; pieces: string; bars: number; cutsMm: number; leftoverMm: number }

/** Količine za obračun (koristi ih i spisak materijala sa cenama). */
export interface Rail04Quantities {
  stubLens: number[];
  railLens: number[];
  rodLens: number[];
  lajsnaLens: number[];
  /** nosači rukohvata (donji + gornji deo): po jedan na svakom stubu niza */
  railSupports: number;
  /** nosači prečki: po jedan na svakom stubu niza za svaku prečku */
  rodSupports: number;
  railEnds: number;
  rodEnds: number;
  /** broj savijanja cevi: po spoju rukohvat + svaka prečka */
  bends: number;
}

export interface Rail04Sheet {
  panels: Rail04Panel[];
  runs: Rail04Run[];
  posts: Rail04Post[];
  bom: SheetBomRow[];
  cuts: SheetCutRow[];
  bars: BarPlanRow[];
  quantities: Rail04Quantities;
  mainTotalMm: number;
  notes: string[];
}

/** Raspoređivanje komada na nabavne šipke (first-fit decreasing, svaki rez troši širinu reza). */
export function planBars(pieces: number[], stockMm = RAIL04.stockMm, kerfMm = RAIL04.kerfMm): { bars: number[][]; leftover: number[] } {
  const bars: number[][] = [];
  const free: number[] = [];
  for (const p of [...pieces].sort((a, b) => b - a)) {
    if (p >= stockMm) { bars.push([p]); free.push(Math.max(0, stockMm - p)); continue; } // cela šipka, bez reza
    const need = p + kerfMm;
    const k = free.findIndex((f) => f >= need);
    if (k >= 0) { bars[k].push(p); free[k] -= need; }
    else { bars.push([p]); free.push(stockMm - need); }
  }
  return { bars, leftover: free };
}

const group = (lengths: number[]): { len: number; qty: number }[] => {
  const m = new Map<number, number>();
  for (const l of lengths) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([len, qty]) => ({ len, qty }));
};

const fmtMm = (v: number) => v.toLocaleString('sr-RS');
/** „4 kom × 6.000 mm" ili „2 × 6.000 + 1 × 2.040 mm" */
const describePieces = (lens: number[]): string => {
  const g = group(lens);
  if (g.length === 1) return `${g[0].qty} kom × ${fmtMm(g[0].len)} mm`;
  return `${g.map((x) => `${x.qty} × ${fmtMm(x.len)}`).join(' + ')} mm`;
};

export function buildRail04Sheet(project: Project, specs?: ModelSpecs): Rail04Sheet | null {
  if (hasCustomSpec(RAIL04_MODEL, specs)) return null; // izmenjena specifikacija zamenjuje detaljnu sastavnicu
  const runs = rail04Runs(project);
  if (!runs.length) return null;
  const panels = runs.flatMap((r) => r.panels);
  const posts = rail04Posts(project);
  const nS = posts.length;

  const stubLens = posts.map((p) => p.heightMm);
  const railLens = runs.flatMap((r) => r.pieceLensMm);
  const rodLens = runs.flatMap((r) => r.rodHeightsMm.flatMap(() => r.pieceLensMm));
  const lajsnaLens = posts.flatMap((p) => Array(RAIL04.channelsPerPost).fill(p.heightMm) as number[]);
  const railSupports = runs.reduce((s, r) => s + r.postCount, 0);
  const rodSupports = runs.reduce((s, r) => s + r.postCount * r.rodHeightsMm.length, 0);
  const railEnds = 2 * runs.length;
  const rodEnds = runs.reduce((s, r) => s + 2 * r.rodHeightsMm.length, 0);
  const bendCount = runs.reduce((s2, run) => s2 + run.bends.length * (1 + run.rodHeightsMm.length), 0);
  const quantities: Rail04Quantities = { stubLens, railLens, rodLens, lajsnaLens, railSupports, rodSupports, railEnds, rodEnds, bends: bendCount };

  const bom: SheetBomRow[] = [
    { pos: 1, part: 'Stubni profil Ø40', code: 'PEGA 06', qty: describePieces(stubLens), note: 'Srebrna završna obrada; dužina = visina stuba' },
    { pos: 2, part: 'Gornji profil Ø50 (rukohvat)', code: 'PEGA 04', qty: describePieces(railLens), note: 'Crna završna obrada; neprekinut komad po nizu polja' },
    { pos: 3, part: 'Profil prečke Ø16', code: 'PEGA 2275/1', qty: describePieces(rodLens), note: 'Crna završna obrada; neprekinut komad po nizu polja' },
    { pos: 4, part: 'Donji deo nosača rukohvata', code: 'PEGA ECO 11', qty: `${railSupports} kom`, note: 'Po jedan na svakom stubu niza' },
    { pos: 5, part: 'Gornji deo nosača rukohvata', code: 'PEGA ECO 12', qty: `${railSupports} kom`, note: 'Sa pozicijom 4 čini jedan nosač' },
    { pos: 6, part: 'Nosač prečke Ø16', code: 'PEGA ECO 97', qty: `${rodSupports} kom`, note: 'Po jedan na svakom stubu, za svaku prečku' },
    { pos: 7, part: 'Pripadajuća podloška nosača', code: 'PEGA 97/8', qty: `do ${rodSupports} kom`, note: 'Uključiti ako je potrebna za izabrani spoj' },
    { pos: 8, part: 'Završetak rukohvata Ø50', code: 'PEGA ECO 46', qty: `${railEnds} kom`, note: 'Crni, samo na krajevima niza' },
    { pos: 9, part: 'Završetak prečke 2275/1', code: 'PEGA SKS 51/2', qty: `${rodEnds} kom`, note: 'Crni, samo na krajevima prečki' },
    { pos: 10, part: 'Donja ukrasna maska stuba', code: 'PEGA ECO 10', qty: `${nS} kom`, note: 'Srebrna; nije noseća stopa' },
    { pos: 11, part: 'Lajsna za kanale stubova', code: 'PEGA 09', qty: `do ${fmtM(lajsnaLens.reduce((s, v) => s + v, 0))}`, note: 'Rezerva; završne mere prilagoditi nosačima' },
    { pos: 12, part: 'Sidrenje stubova', code: 'Prema podlozi i sistemu', qty: `${nS} kompleta`, note: 'Tip i dimenzije nisu određeni' },
    { pos: 13, part: 'Vijci i stezni elementi', code: 'Prema izabranim nosačima', qty: `za ${railSupports} gornjih i ${rodSupports} poprečnih nosača`, note: 'Proveriti šta se isporučuje uz nosače' },
    { pos: 14, part: 'Montažni potrošni materijal', code: 'Prema postupku montaže', qty: 'prema potrošnji', note: 'Ne računati celo pakovanje kao potrošnju' },
    ...(bendCount > 0 ? [{ pos: 15, part: 'Savijanje cevi (rukohvat Ø50 i prečke Ø16)', code: 'Savijanje ili gotove cevi pod uglom', qty: `${bendCount} savijanja`, note: `Ugaoni spoj: razmak između dva stuba; po spoju 1 rukohvat + ${runs.find((x) => x.bends.length)?.rodHeightsMm.length ?? 0} prečke` }] : []),
  ];

  const cuts: SheetCutRow[] = [];
  type Piece = { len: number; cut: string };
  const straight = 'Oba kraja ravno, pod 90°';
  const bentCut = (bends: Rail04Run['bends']) => `${straight}; savijanje: ${bends.map((b) => `${Math.abs(b.deg)}° ${b.deg > 0 ? 'udesno' : 'ulevo'} na ${fmtMm(b.atMm)} mm od početka`).join(', ')}`;
  const emit = (prefix: string, part: string, profile: string, pieces: Piece[]) => {
    const g = new Map<string, { len: number; cut: string; qty: number }>();
    for (const p of pieces) { const k = `${p.len}|${p.cut}`; const cur = g.get(k); if (cur) cur.qty += 1; else g.set(k, { ...p, qty: 1 }); }
    [...g.values()].sort((a, b) => b.len - a.len).forEach((x, i2) => cuts.push({ mark: `${prefix}-${String(i2 + 1).padStart(2, '0')}`, part, profile, qty: x.qty, lengthMm: x.len, totalMm: x.qty * x.len, cut: x.cut }));
  };
  // savijanje pripada komadu u kome se nalazi; mesto se meri od početka tog komada
  const runPieces = (run: Rail04Run): Piece[] => {
    let off = 0;
    return run.pieceLensMm.map((len) => {
      const here = run.bends.filter((b) => b.atMm >= off && b.atMm < off + len).map((b) => ({ ...b, atMm: b.atMm - off }));
      off += len;
      return { len, cut: here.length ? bentCut(here) : straight };
    });
  };
  emit('S', 'Stub Ø40', 'PEGA 06', stubLens.map((len) => ({ len, cut: straight })));
  emit('R', 'Rukohvat Ø50', 'PEGA 04', runs.flatMap(runPieces));
  emit('P', 'Prečka Ø16', 'PEGA 2275/1', runs.flatMap((run) => run.rodHeightsMm.flatMap(() => runPieces(run))));
  emit('M', 'Pokrivna lajsna (rezerva)', 'PEGA 09', lajsnaLens.map((len) => ({ len, cut: 'Završno pripasivanje' })));

  const mainTotalMm = [...stubLens, ...railLens, ...rodLens].reduce((s, v) => s + v, 0);

  const bars: BarPlanRow[] = [];
  for (const [label, lens] of [['Stub Ø40 — PEGA 06', stubLens], ['Rukohvat Ø50 — PEGA 04', railLens], ['Prečke Ø16 — PEGA 2275/1', rodLens], ['Pokrivne lajsne — PEGA 09 (rezerva)', lajsnaLens]] as const) {
    const plan = planBars([...lens]);
    plan.bars.forEach((b, i) => bars.push({
      profile: plan.bars.length > 1 ? `${label} (šipka ${i + 1})` : label,
      pieces: group(b).map((g) => (g.qty > 1 ? `${g.qty} × ${g.len}` : String(g.len))).join(' + '),
      bars: 1,
      cutsMm: Math.max(0, RAIL04.stockMm - b.reduce((x, v) => x + v, 0) - plan.leftover[i]),
      leftoverMm: plan.leftover[i],
    }));
  }

  const notes = [
    'Planerske mere za opisanu montažu: prolazne prečke u nosačima ispred stubova. Susedna polja iste visine čine jedan niz: rukohvat i prečke se seku u najdužim mogućim komadima. Dužina niza = razmak osa prvog i poslednjeg stuba + 40 mm (po 20 mm prepusta).',
    'Dužina stuba je visina stuba u projektu; konačna visina rukohvata zavisi od izabranog gornjeg nosača. Prepuste završnih čepova treba izmeriti i oduzeti od dužina rukohvata i prečki ako je potreban strogi gabarit.',
    `Raspored na šipke: nabavna dužina ${RAIL04.stockMm} mm i širina reza ${RAIL04.kerfMm} mm su pretpostavke; ostaci su potencijalno upotrebljiv materijal.`,
    'Pozicije 4 i 5 zajedno daju jedan kompletan nosač rukohvata. Donja maska nije noseća stopa i ne zamenjuje sidrenje. Sadržaj pričvrsnog kompleta nosača proveriti.',
    'Prečnike rupa, navoje, dubine sidrenja i momente zatezanja preuzeti iz dokumentacije izabranih spojnih elemenata. Raspored prečki nije proveren kao zaštitna ograda protiv pada.',
  ];
  for (const r of runs) {
    if (r.trimmedMm > 0) notes.push(`Niz ${r.panels[0].name}–${r.panels[r.panels.length - 1].name}: potrebna dužina ${fmtMm(r.lengthMm)} mm prelazi šipku od ${fmtMm(RAIL04.stockMm)} mm za ${r.trimmedMm} mm; prepust na krajevima se skraćuje (ili se dogovara duža šipka).`);
    else if (r.pieceLensMm.length > 1) notes.push(`Niz ${r.panels[0].name}–${r.panels[r.panels.length - 1].name}: dužina ${fmtMm(r.lengthMm)} mm je veća od šipke od ${fmtMm(RAIL04.stockMm)} mm, pa se rukohvat i prečke spajaju (potrebne spojnice — proveriti kod dobavljača).`);
  }

  return { panels, runs, posts, bom, cuts, bars, quantities, mainTotalMm, notes };
}

function fmtM(mm: number): string {
  return `${(mm / 1000).toLocaleString('sr-RS', { maximumFractionDigits: 2 })} m`;
}
