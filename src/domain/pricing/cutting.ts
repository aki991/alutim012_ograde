import { endOffsets, endsLabel, MITER_SHAPE, VIEWS, viewEnds, type PieceView } from './cutEnds';
import { buildRl10Sheet } from './rl10Spec';
import { computeLayout, outerWidthMm } from '../geometry/layout';
import type { AppSettings, Material, Project } from '../models/types';
import { materialName, type ModelSpecs } from '../models/spec';
import { isSymmetricRect, materialShape } from '../models/materialShape';
import { itemLabel, itemNumber } from '../../utils/labels';
import { buildCutList, describeItem } from './production';
import { FILL_PROFILES, GUIDE_PROFILES, buildLouver08Sheet, louver08Panels } from './louverSpec';
import { buildRail04Sheet, isRail04, rail04Posts, rail04Runs } from './railSpec';
import { postMaterialLine } from '../models/postTemplates';
import { isTarabicaPost, tarabicaPostLines } from '../models/tarabica';

/** Krojna lista: raspored komada profila na nabavne šipke (širina reza testere uračunata), sa ostatkom po šipki. */

export const DEFAULT_STOCK_MM = 6000;
export const DEFAULT_KERF_MM = 3;

export interface CutOptions {
  stockMm: number;
  kerfMm: number;
  /** štednja materijala: komadi sa istim kosim uglom dele rez (jedan rez za dva komada), pa se manje baca */
  saveMaterial?: boolean;
  /** koji deo projekta se štampa: ceo (podrazumevano), samo kapije ili samo ograda (bez kapija) */
  scope?: PrintScope;
}

/** Deo projekta za krojnu listu i radni nalog: ceo projekat, samo kapije ili ograda bez kapija. */
export type PrintScope = 'all' | 'gates' | 'fence';
export const PRINT_SCOPE_LABELS: Record<PrintScope, string> = { all: 'Ceo projekat', gates: 'Samo kapije', fence: 'Ograda bez kapija' };

/** da li element pripada delu projekta koji se štampa */
export const inPrintScope = (item: Project['items'][number] | undefined, scope: PrintScope = 'all'): boolean =>
  !!item && (scope === 'all' || (scope === 'gates' ? item.kind === 'gate' : item.kind !== 'gate'));

/**
 * Projekat sveden na deo koji se štampa: elementi van tog dela postaju prazni otvori iste širine, pa raspored (ose, svetli otvori, stubovi uz
 * elemente koji ostaju) ostaje isti, a stubovi koji stoje samo uz izbačene elemente se ne prikazuju. Redni brojevi elemenata se ne menjaju.
 */
export function scopedProject(project: Project, scope: PrintScope = 'all'): Project {
  if (scope === 'all') return project;
  return { ...project, items: project.items.map((it) => (it.kind === 'opening' || inPrintScope(it, scope) ? it : { kind: 'opening' as const, id: it.id, widthMm: it.widthMm, heightMm: it.heightMm })) };
}

export const cutOptions = (settings: Pick<AppSettings, 'cutting'>): CutOptions => ({
  stockMm: settings.cutting?.stockMm ?? DEFAULT_STOCK_MM,
  kerfMm: settings.cutting?.kerfMm ?? DEFAULT_KERF_MM,
  saveMaterial: Boolean(settings.cutting?.saveMaterial),
});

export interface CutPiece {
  lengthMm: number;
  /** ključ pozicije (elementa) kojoj komad pripada, npr. „2" ili „1–3" ili „S4" */
  pos: string;
  part: string;
  /** naziv dela bez oznake uglova (za radni nalog: isti naziv kao na sklopnom crtežu) */
  name?: string;
  /** komad rama: oba kraja se seku pod 45° */
  miter?: boolean;
  /** uglovi sečenja oba kraja (komadi koji se seku pod uglom, npr. ojačanja repa) */
  ends?: [number[], number[]];
  endShape?: [[number, number][], [number, number][]];
  /** širina profila u ravni reza (mm): iz nje je pomak kosog kraja, pa i ušteda pri deljenju reza */
  w?: number;
  /** štednja materijala: položaj komada u šipki (okrenut tako da se kosi rez poklopi sa susednim) */
  view?: PieceView;
  /** štednja materijala: za koliko (mm) komad zalazi u prethodni (deli kosi rez); 0 / bez vrednosti = ne deli */
  share?: number;
}

/** Pozicija = element projekta (ili niz elemenata / stub) sa opisom za legendu. */
export interface CutPosition {
  key: string;
  label: string;
  detail: string;
}

export interface CutBar {
  pieces: CutPiece[];
  /** ostatak šipke posle svih rezova (mm) */
  leftoverMm: number;
  /** dužina ove šipke (mm) kad nije cela nabavna šipka: ostatak materijala koji se koristi prvi */
  stockMm?: number;
  /** šipka je ostatak iz magacina / koji je uneo poslovođa (ne nabavlja se) */
  offcut?: boolean;
}

export interface ProfileCutPlan {
  profile: string;
  bars: CutBar[];
  /** komadi duži od šipke: ne mogu se iseći iz jedne šipke */
  oversize: CutPiece[];
  pieceCount: number;
  pieceTotalMm: number;
  leftoverMm: number;
  /** broj novih (nabavnih) šipki i broj iskorišćenih ostataka */
  newBars: number;
  offcutBars: number;
  /** ostaci koji su bili na raspolaganju, a nisu upotrebljeni (mm) */
  unusedOffcuts: number[];
  /** udeo komada u dužini svih šipki (%) */
  efficiencyPct: number;
  /** zbirni spisak: dužina, komada, pozicije */
  summary: { lengthMm: number; qty: number; positions: string[]; miter?: boolean; ends?: [number[], number[]]; endShape?: [[number, number][], [number, number][]] }[];
}

export interface CuttingList {
  stockMm: number;
  kerfMm: number;
  profiles: ProfileCutPlan[];
  positions: CutPosition[];
  /** bars = nove šipke za nabavku; offcutBars = iskorišćeni ostaci */
  totals: { profiles: number; bars: number; offcutBars: number; pieces: number; pieceTotalMm: number; leftoverMm: number; efficiencyPct: number; /** štednja materijala: broj deljenih rezova i ušteđeni materijal (mm) */ sharedCuts: number; savedMm: number };
  notes: string[];
}

/**
 * Raspoređivanje na šipke: najduži komadi prvi, svaki komad ide u šipku sa najmanjim ostatkom u koji staje (rez troši širinu testere).
 * Ostaci materijala (`offcuts`, dužine u mm) se koriste PRVI: komad ide u ostatak kad god u neki staje, a nova šipka se otvara
 * tek kad ne staje ni u jedan ostatak ni u već otvorenu šipku. Neupotrebljeni ostaci se vraćaju u `unusedOffcuts`.
 */
export function packBars(pieces: CutPiece[], stockMm: number, kerfMm: number, offcuts: number[] = [], share = false): { bars: CutBar[]; oversize: CutPiece[]; unusedOffcuts: number[] } {
  interface Open { pieces: CutPiece[]; free: number; len: number; offcut: boolean }
  const bars: Open[] = [...offcuts].filter((l) => l > 0).sort((a, b) => a - b).map((len) => ({ pieces: [], free: len, len, offcut: true }));
  const oversize: CutPiece[] = [];
  const sorted = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm);
  const baseOf = (p: CutPiece): [number, number] => endOffsets(p.endShape ?? (p.miter ? MITER_SHAPE : undefined), p.w);
  const endsOf = (p: CutPiece): [number, number] => viewEnds(baseOf(p), p.view ?? VIEWS[0]);
  interface Cand { at: 'end' | 'start'; view: PieceView; overlap: number; cost: number }
  // gde i kako komad staje u šipku: na kraj ili na početak, u onom položaju u kome se kosi rez poklapa sa susednim komadom (štednja materijala)
  const candidates = (b: Open, p: CutPiece): Cand[] => {
    const plain: Cand = { at: 'end', view: VIEWS[0], overlap: 0, cost: p.lengthMm + kerfMm };
    if (!share || b.pieces.length === 0 || (!p.endShape && !p.miter)) return [plain];
    const out: Cand[] = [plain];
    const last = b.pieces[b.pieces.length - 1]; const first = b.pieces[0];
    const lastR = endsOf(last)[1]; const firstL = endsOf(first)[0];
    for (const v of VIEWS) {
      const [oL, oR] = viewEnds(baseOf(p), v);
      if (Math.abs(oL) > 0.6 && Math.abs(oL + lastR) < 0.6) out.push({ at: 'end', view: v, overlap: Math.abs(oL), cost: p.lengthMm + kerfMm - Math.abs(oL) });
      if (Math.abs(oR) > 0.6 && Math.abs(oR + firstL) < 0.6) out.push({ at: 'start', view: v, overlap: Math.abs(oR), cost: p.lengthMm + kerfMm - Math.abs(oR) });
    }
    return out;
  };
  // komad staje ako ima mesta za njega i rez; u praznu šipku staje i kad je tačno njene dužine (bez reza)
  const fitsCost = (b: Open, p: CutPiece, c: Cand) => b.free >= c.cost || (b.pieces.length === 0 && b.free >= p.lengthMm);
  const bestCand = (b: Open, p: CutPiece): Cand | null => candidates(b, p).filter((c) => fitsCost(b, p, c)).sort((x, y) => x.cost - y.cost)[0] ?? null;
  const place = (b: Open, p: CutPiece, c: Cand) => {
    const q: CutPiece = c.overlap > 0 ? { ...p, view: c.view } : p;
    if (c.at === 'start') { if (b.pieces.length) b.pieces[0] = { ...b.pieces[0], share: c.overlap }; b.pieces.unshift({ ...q, share: undefined }); }
    else b.pieces.push(c.overlap > 0 ? { ...q, share: c.overlap } : q);
    b.free = Math.max(0, b.free - c.cost);
  };
  const bestOf = (list: Open[], p: CutPiece): { b: Open; c: Cand } | null => {
    let best: { b: Open; c: Cand; left: number } | null = null;
    for (const b of list) { const c = bestCand(b, p); if (!c) continue; const left = b.free - c.cost; if (!best || left < best.left - 1e-9 || (Math.abs(left - best.left) < 1e-9 && c.overlap > best.c.overlap)) best = { b, c, left }; }
    return best ? { b: best.b, c: best.c } : null;
  };
  for (const p of sorted) {
    const off = bestOf(bars.filter((b) => b.offcut), p);
    if (off) { place(off.b, p, off.c); continue; }
    if (p.lengthMm > stockMm) { oversize.push(p); continue; }
    const open = bestOf(bars.filter((b) => !b.offcut), p);
    if (open) { place(open.b, p, open.c); continue; }
    const nb: Open = { pieces: [], free: stockMm, len: stockMm, offcut: false };
    place(nb, p, { at: 'end', view: VIEWS[0], overlap: 0, cost: p.lengthMm + kerfMm });
    bars.push(nb);
  }
  const used = bars.filter((b) => b.pieces.length > 0);
  return {
    // prvo ostaci (od najdužeg), pa nove šipke redom kako su otvarane
    bars: [...used.filter((b) => b.offcut).sort((a, b) => b.len - a.len), ...used.filter((b) => !b.offcut)]
      .map((b) => ({ pieces: b.pieces, leftoverMm: Math.max(0, b.free), ...(b.offcut ? { stockMm: b.len, offcut: true } : {}) })),
    oversize,
    unusedOffcuts: bars.filter((b) => b.offcut && b.pieces.length === 0).map((b) => b.len).sort((a, b) => b - a),
  };
}

/**
 * Da li komadi ovog profila mogu da dele kosi rez: komad se okreće (zaokreće se za 180°) da bi se rezovi poklopili, pa presek mora da bude
 * simetričan (pravougaona ili okrugla cev). Profil koji nije u cenovniku (npr. „nije definisano“) se računa kao cev.
 */
function canShareCuts(profile: string, materials: Material[]): boolean {
  const m = materials.find((x) => materialName(materials, x.id) === profile);
  if (!m) return true;
  const sh = materialShape(m);
  return sh.type === 'linear' && (sh.section.round || isSymmetricRect(sh.section));
}

/** Dužina šipke: ostatak ima svoju dužinu, ostale su cele nabavne šipke. */
export const barLength = (b: CutBar, stockMm: number): number => b.stockMm ?? stockMm;

export interface BarGroup {
  bar: CutBar;
  /** koliko je šipki sa istim rasporedom (uzastopno) */
  count: number;
  /** redni brojevi prve i poslednje šipke u grupi (od 1) */
  from: number;
  to: number;
}

/** Uzastopne šipke sa potpuno istim rasporedom komada (dužina i pozicija) čine jednu grupu: „Šipke 1–10 × 10". */
export function groupBars(bars: CutBar[]): BarGroup[] {
  const key = (b: CutBar) => `${b.offcut ? `o${b.stockMm}` : 'n'}#${b.pieces.map((p) => `${p.lengthMm}@${p.pos}${p.share ? `~${p.share}${p.view ? `${+p.view.swap}${+p.view.flip}` : ''}` : ''}`).join('|')}`;
  const out: BarGroup[] = [];
  bars.forEach((bar, i) => {
    const last = out[out.length - 1];
    if (last && key(last.bar) === key(bar)) { last.count += 1; last.to = i + 1; }
    else out.push({ bar, count: 1, from: i + 1, to: i + 1 });
  });
  return out;
}

interface RawGroup { profile: string; pieces: CutPiece[] }

const posKey = (items: Project['items'], a: number, b: number): string => (a === b ? String(itemNumber(items, a)) : `${itemNumber(items, a)}–${itemNumber(items, b)}`);

/** Svi šipkasti komadi projekta, grupisani po profilu, sa pozicijama (elementima) kojima pripadaju. */
function collectPieces(project: Project, specs: ModelSpecs | undefined, materials: Material[], scope: PrintScope = 'all'): { groups: RawGroup[]; positions: CutPosition[] } {
  const groups = new Map<string, CutPiece[]>();
  const positions = new Map<string, CutPosition>();
  const add = (profile: string, piece: CutPiece) => {
    const list = groups.get(profile) ?? [];
    list.push(piece);
    groups.set(profile, list);
  };
  const elementPos = (index: number) => {
    const key = String(itemNumber(project.items, index));
    if (!positions.has(key)) {
      const it = project.items[index];
      positions.set(key, { key, label: itemLabel(project.items, index), detail: `${describeItem(project, index)} · ${Math.round(outerWidthMm(project, index))} × ${Math.round(it.heightMm)} mm` });
    }
    return key;
  };

  // opšti modeli: delovi iz specifikacije modela (rezne dužine); staklo i delovi bez dužine ne ulaze
  for (const c of buildCutList(project, specs, materials)) {
    if (c.glass || !inPrintScope(project.items[c.index], scope)) continue;
    const pos = elementPos(c.index);
    for (let i = 0; i < c.qty; i++) add(c.profile, { lengthMm: c.lengthMm, pos, name: c.part, part: c.miter ? `${c.part} (45°)` : c.ends ? `${c.part} (${endsLabel(c.ends)})` : c.part, ...(c.miter ? { miter: true } : {}), ...(c.ends ? { ends: c.ends, ...(c.endShape ? { endShape: c.endShape } : {}) } : {}), ...(c.faceMm ? { w: c.faceMm } : {}) });
  }

  // stubovi uz tarabicu: cev stuba (80 × 80 ili 100 × 100) se seče iz šipke po visini stuba
  // stubovi: samo oni uz elemente dela koji se štampa (kod „samo kapije“ stubovi uz kapije)
  const laid = computeLayout(scopedProject(project, scope));
  project.posts.forEach((p, i) => {
    if (laid.posts[i]?.hidden || !isTarabicaPost(project.items, p, i)) return;
    const post = { ...p, heightMm: laid.posts[i]?.lengthMm ?? p.heightMm };
    const tube = tarabicaPostLines(post)[0];
    const key = `S${i + 1}`;
    positions.set(key, { key, label: `Stub ${key}`, detail: `${tube.label} · visina ${Math.round(post.heightMm)} mm` });
    add(materialName(materials, tube.materialId), { lengthMm: Math.round(post.heightMm), pos: key, part: 'Stub' });
  });

  // stubovi od profila izabranog šablonom stuba: cev stuba se seče iz šipke po dužini stuba
  project.posts.forEach((p, i) => {
    if (laid.posts[i]?.hidden || isTarabicaPost(project.items, p, i) || [project.items[i - 1], project.items[i]].some((x) => x && isRail04(x))) return;
    const len = Math.round(laid.posts[i]?.lengthMm ?? p.heightMm);
    const own = postMaterialLine(project, i, materials, len);
    if (!own?.linear) return;
    const key = `S${i + 1}`;
    positions.set(key, { key, label: `Stub ${key}`, detail: `${materialName(materials, own.materialId)} · visina ${len} mm` });
    add(materialName(materials, own.materialId), { lengthMm: len, pos: key, part: 'Stub' });
  });

  // model 06 (RL10): stubovi i lajsne po visini stuba, rukohvat i prečke po nizovima polja istog nagiba
  // modeli 06, 04 i 08 su ograde: ne ulaze u krojnu listu samo kapija
  const rl10 = scope === 'gates' ? null : buildRl10Sheet(project, specs);
  if (rl10) {
    for (const p of rl10.posts) {
      const key = p.name.replace('Stub ', '');
      positions.set(key, { key, label: p.name, detail: `Stub P-1054 Ø40 · dužina ${p.tubeMm} mm` });
      add(materialName(materials, 'mat_bts_p1054'), { lengthMm: p.tubeMm, pos: key, part: 'Stub' });
      add(materialName(materials, 'mat_bts_pal2647'), { lengthMm: p.tubeMm, pos: key, part: 'Lajsna' });
    }
    for (const run of rl10.runs) {
      const key = posKey(project.items, run.firstIndex, run.lastIndex);
      if (!positions.has(key)) {
        const first = run.names[0];
        const last = run.names[run.names.length - 1];
        positions.set(key, { key, label: run.firstIndex === run.lastIndex ? first : `${first} – ${last}`, detail: `Niz polja · rukohvat ${Math.round(run.railLenMm)} mm${run.slopeDeg ? ` · nagib ${run.slopeDeg}°` : ''}` });
      }
      for (const len of run.railPieces) add(materialName(materials, 'mat_bts_p1033'), { lengthMm: len, pos: key, part: 'Rukohvat' });
      for (const len of run.rodPieces) for (let r = 0; r < run.rodHeightsMm.length; r++) add(materialName(materials, 'mat_bts_p1146'), { lengthMm: len, pos: key, part: 'Prečka' });
    }
    // uglovi uz stepenište: pravo parče rukohvata između kugli i kratki ravni delovi prečki uz kuglu
    for (const c of rl10.corners.filter((x) => x.slopeBall)) {
      const key = `U${c.postName}`;
      positions.set(key, { key, label: `Ugao na stubu ${c.postName}`, detail: `Pravo parče rukohvata ${c.railPieceMm} mm između kugli AK-5020K, skretanje ${Math.abs(c.turnDeg)}°` });
      add(materialName(materials, 'mat_bts_p1033'), { lengthMm: c.railPieceMm, pos: key, part: 'Rukohvat — parče' });
      for (let r = 0; r < c.rods; r++) add(materialName(materials, 'mat_bts_p1146'), { lengthMm: c.rodPieceMm, pos: key, part: 'Prečka — parče' });
    }
  }

  // model 04: stubovi, rukohvat i prečke (nizovi polja se seku u najdužim komadima)
  const rail = scope === 'gates' ? null : buildRail04Sheet(project, specs);
  if (rail) {
    for (const p of rail04Posts(project)) {
      const key = p.name.replace('Stub ', '');
      if (!positions.has(key)) positions.set(key, { key, label: `Stub ${key}`, detail: `Stubni profil Ø40 · visina ${Math.round(p.heightMm)} mm` });
      add('Stub Ø40 — PEGA 06', { lengthMm: Math.round(p.heightMm), pos: key, part: 'Stub' });
    }
    for (const run of rail04Runs(project)) {
      const key = posKey(project.items, run.firstIndex, run.lastIndex);
      if (!positions.has(key)) {
        const first = itemLabel(project.items, run.firstIndex);
        const last = itemLabel(project.items, run.lastIndex);
        positions.set(key, { key, label: run.firstIndex === run.lastIndex ? first : `${first} – ${last}`, detail: `Niz polja · dužina niza ${Math.round(run.lengthMm)} mm (osa–osa + prepusti)` });
      }
      for (const len of run.pieceLensMm) {
        add('Rukohvat Ø50 — PEGA 04', { lengthMm: len, pos: key, part: 'Rukohvat' });
        for (let r = 0; r < run.rodHeightsMm.length; r++) add('Prečke Ø16 — PEGA 2275/1', { lengthMm: len, pos: key, part: 'Prečka' });
      }
    }
  }

  // model 08: bočne vođice i horizontalne letvice po panelu
  const louver = scope === 'gates' ? null : buildLouver08Sheet(project, specs);
  if (louver) {
    const guide = GUIDE_PROFILES[louver.spec.guideProfile];
    const fill = FILL_PROFILES[louver.spec.fillProfile];
    for (const panel of louver08Panels(project)) {
      const key = elementPos(panel.index);
      for (let i = 0; i < 2; i++) add(`Bočna vođica — ${guide.code}`, { lengthMm: panel.guideLenMm, pos: key, part: 'Vođica' });
      for (let i = 0; i < panel.count; i++) add(`Horizontalna letvica — ${fill.code}`, { lengthMm: panel.fillLenMm, pos: key, part: 'Letvica' });
    }
  }

  // redosled pozicija: elementi po rednom broju, pa nizovi, pa stubovi
  const orderOf = (k: string) => (/^\d+$/.test(k) ? Number(k) : /^\d+–/.test(k) ? Number(k.split('–')[0]) + 0.5 : 1e6 + Number(k.replace(/\D/g, '')));
  const posList = [...positions.values()].sort((a, b) => orderOf(a.key) - orderOf(b.key));
  return { groups: [...groups.entries()].map(([profile, pieces]) => ({ profile, pieces })), positions: posList };
}

export function buildCuttingList(project: Project, specs: ModelSpecs | undefined, materials: Material[], opts: CutOptions = { stockMm: DEFAULT_STOCK_MM, kerfMm: DEFAULT_KERF_MM }): CuttingList {
  const { groups, positions } = collectPieces(project, specs, materials, opts.scope);
  // ostaci koje je poslovođa zadao za ovaj projekat, po profilu (nazivu materijala kao u krojnoj listi)
  const offcutsOf = new Map<string, number[]>();
  for (const o of project.offcuts ?? []) {
    const name = materialName(materials, o.materialId);
    const list = offcutsOf.get(name) ?? [];
    for (let i = 0; i < Math.max(0, Math.round(o.qty)); i++) list.push(o.lengthMm);
    offcutsOf.set(name, list);
  }
  const profiles: ProfileCutPlan[] = groups
    .filter((g) => g.pieces.length > 0)
    .map((g) => {
      const offs = offcutsOf.get(g.profile) ?? [];
      let packed = packBars(g.pieces, opts.stockMm, opts.kerfMm, offs);
      // štednja materijala: komadi sa istim kosim uglom dele rez; uzima se samo ako je bolje (manje šipki ili manje utrošenog materijala)
      if (opts.saveMaterial && canShareCuts(g.profile, materials) && g.pieces.some((p) => p.endShape || (p.miter && p.w))) {
        const alt = packBars(g.pieces, opts.stockMm, opts.kerfMm, offs, true);
        const newBars = (r: typeof packed) => r.bars.filter((b) => !b.offcut).length;
        const usedMm = (r: typeof packed) => r.bars.reduce((sum, b) => sum + (b.offcut ? 0 : opts.stockMm - b.leftoverMm), 0);
        const shares = alt.bars.some((b) => b.pieces.some((p) => (p.share ?? 0) > 0));
        if (shares && (newBars(alt) < newBars(packed) || (newBars(alt) === newBars(packed) && usedMm(alt) <= usedMm(packed) + 1e-9))) packed = alt;
      }
      const { bars, oversize, unusedOffcuts } = packed;
      const totalBarMm = bars.reduce((s, b) => s + barLength(b, opts.stockMm), 0);
      const placed = bars.flatMap((b) => b.pieces);
      const pieceTotalMm = placed.reduce((s, p) => s + p.lengthMm - (p.share ?? 0), 0);
      const leftoverMm = bars.reduce((s, b) => s + b.leftoverMm, 0);
      const byLen = new Map<string, { lengthMm: number; miter: boolean; ends?: [number[], number[]]; endShape?: [[number, number][], [number, number][]]; qty: number; positions: Set<string> }>();
      for (const p of g.pieces) {
        const k = `${p.lengthMm}|${p.miter ? 1 : 0}|${p.ends ? JSON.stringify(p.ends) : ''}`;
        const cur = byLen.get(k) ?? { lengthMm: p.lengthMm, miter: !!p.miter, ends: p.ends, endShape: p.endShape, qty: 0, positions: new Set<string>() };
        cur.qty += 1; cur.positions.add(p.pos);
        byLen.set(k, cur);
      }
      return {
        profile: g.profile,
        bars,
        oversize,
        pieceCount: g.pieces.length,
        pieceTotalMm,
        leftoverMm,
        newBars: bars.filter((b) => !b.offcut).length,
        offcutBars: bars.filter((b) => b.offcut).length,
        unusedOffcuts,
        efficiencyPct: totalBarMm ? (pieceTotalMm / totalBarMm) * 100 : 0,
        summary: [...byLen.values()].sort((a, b) => b.lengthMm - a.lengthMm).map((v) => ({ lengthMm: v.lengthMm, qty: v.qty, positions: [...v.positions], ...(v.miter ? { miter: true } : {}), ...(v.ends ? { ends: v.ends, ...(v.endShape ? { endShape: v.endShape } : {}) } : {}) })),
      };
    })
    .sort((a, b) => a.profile.localeCompare(b.profile, 'sr'));
  const bars = profiles.reduce((s, p) => s + p.newBars, 0);
  const offcutBars = profiles.reduce((s, p) => s + p.offcutBars, 0);
  const allBarMm = profiles.reduce((s, p) => s + p.bars.reduce((x, b) => x + barLength(b, opts.stockMm), 0), 0);
  const pieceTotalMm = profiles.reduce((s, p) => s + p.pieceTotalMm, 0);
  const sharedPieces = profiles.flatMap((p) => p.bars.flatMap((b) => b.pieces)).filter((p) => (p.share ?? 0) > 0);
  const sharedCuts = sharedPieces.length;
  const savedMm = Math.round(sharedPieces.reduce((sum, p) => sum + (p.share ?? 0), 0));
  const notes: string[] = [`Nabavna dužina šipke ${opts.stockMm} mm, širina reza testere ${opts.kerfMm} mm. Svi rezovi su ravni (90°), osim ako je drugačije označeno.`];
  const louver = opts.scope === 'gates' ? null : buildLouver08Sheet(project, specs);
  if (louver) notes.push(louver.notes[0]);
  const rail = opts.scope === 'gates' ? null : buildRail04Sheet(project, specs);
  if (rail) notes.push(rail.notes[0]);
  if (profiles.some((p) => p.summary.some((s) => s.miter))) notes.push('Delovi rama (prikazani kao trapez) se seku pod uglom od 45° na oba kraja (gerung); navedena dužina je spoljna, duža mera komada.');
  if (profiles.some((p) => p.summary.some((s) => s.ends))) notes.push('Komadi sa uglovima (npr. ojačanja repa) se seku pod navedenim uglovima na početku / kraju ose komada (90° = ravan rez, „V“ = zasek sa dva reza); navedena dužina je duža strana komada.');
  if (opts.saveMaterial) notes.push(sharedCuts ? `Štednja materijala: ${sharedCuts} ${sharedCuts === 1 ? 'kosi rez deli' : 'kosa reza dele'} dva komada (jedan rez za dva komada), ušteđeno oko ${savedMm} mm profila. Komadi na istoj šipki su okrenuti tako da im se kosi rezovi poklope; dužine su i dalje po dužoj strani.` : 'Štednja materijala je uključena, ali nema komada čiji se kosi rezovi mogu spojiti u jedan rez.');
  if (project.offcuts?.length) {
    const fm = (n: number) => String(Math.round(n));
    const usedTxt = profiles.filter((p) => p.offcutBars > 0).map((p) => `${p.profile}: ${p.bars.filter((b) => b.offcut).map((b) => fm(b.stockMm ?? 0)).join(', ')} mm`);
    notes.push(usedTxt.length ? `Prvo su iskorišćeni ostaci materijala (${offcutBars} kom): ${usedTxt.join('; ')}.` : 'Zadati ostaci materijala nisu mogli da se iskoriste (nijedan komad ne staje u njih ili su od drugog profila).');
    const unused = profiles.filter((p) => p.unusedOffcuts.length).map((p) => `${p.profile}: ${p.unusedOffcuts.map(fm).join(', ')} mm`);
    const known = new Set(profiles.map((p) => p.profile));
    const foreign = [...offcutsOf.keys()].filter((k) => !known.has(k));
    if (unused.length) notes.push(`Neupotrebljeni ostaci: ${unused.join('; ')}.`);
    if (foreign.length) notes.push(`Ostaci profila koji se ne koriste u ovom projektu: ${foreign.join(', ')}.`);
  }
  for (const p of profiles) {
    if (p.oversize.length) notes.push(`${p.profile}: ${p.oversize.length} kom duži od šipke (${Math.max(...p.oversize.map((o) => o.lengthMm))} mm) — ne mogu se iseći iz jedne šipke; potrebna duža šipka ili spajanje.`);
  }
  return {
    stockMm: opts.stockMm,
    kerfMm: opts.kerfMm,
    profiles,
    positions,
    totals: {
      profiles: profiles.length,
      bars,
      offcutBars,
      pieces: profiles.reduce((s, p) => s + p.pieceCount, 0),
      pieceTotalMm,
      leftoverMm: profiles.reduce((s, p) => s + p.leftoverMm, 0),
      efficiencyPct: allBarMm ? (pieceTotalMm / allBarMm) * 100 : 0,
      sharedCuts,
      savedMm,
    },
    notes,
  };
}
