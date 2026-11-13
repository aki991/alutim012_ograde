import { buildRl10Sheet } from './rl10Spec';
import { computeLayout, outerWidthMm } from '../geometry/layout';
import type { AppSettings, Material, Project } from '../models/types';
import { materialName, type ModelSpecs } from '../models/spec';
import { itemLabel, itemNumber } from '../../utils/labels';
import { buildCutList, describeItem } from './production';
import { FILL_PROFILES, GUIDE_PROFILES, buildLouver08Sheet, louver08Panels } from './louverSpec';
import { buildRail04Sheet, rail04Posts, rail04Runs } from './railSpec';
import { isTarabicaPost, tarabicaPostLines } from '../models/tarabica';

/** Krojna lista: raspored komada profila na nabavne šipke (širina reza testere uračunata), sa ostatkom po šipki. */

export const DEFAULT_STOCK_MM = 6000;
export const DEFAULT_KERF_MM = 3;

export interface CutOptions { stockMm: number; kerfMm: number }

export const cutOptions = (settings: Pick<AppSettings, 'cutting'>): CutOptions => ({
  stockMm: settings.cutting?.stockMm ?? DEFAULT_STOCK_MM,
  kerfMm: settings.cutting?.kerfMm ?? DEFAULT_KERF_MM,
});

export interface CutPiece {
  lengthMm: number;
  /** ključ pozicije (elementa) kojoj komad pripada, npr. „2" ili „1–3" ili „S4" */
  pos: string;
  part: string;
  /** komad rama: oba kraja se seku pod 45° */
  miter?: boolean;
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
  summary: { lengthMm: number; qty: number; positions: string[]; miter?: boolean }[];
}

export interface CuttingList {
  stockMm: number;
  kerfMm: number;
  profiles: ProfileCutPlan[];
  positions: CutPosition[];
  /** bars = nove šipke za nabavku; offcutBars = iskorišćeni ostaci */
  totals: { profiles: number; bars: number; offcutBars: number; pieces: number; pieceTotalMm: number; leftoverMm: number; efficiencyPct: number };
  notes: string[];
}

/**
 * Raspoređivanje na šipke: najduži komadi prvi, svaki komad ide u šipku sa najmanjim ostatkom u koji staje (rez troši širinu testere).
 * Ostaci materijala (`offcuts`, dužine u mm) se koriste PRVI: komad ide u ostatak kad god u neki staje, a nova šipka se otvara
 * tek kad ne staje ni u jedan ostatak ni u već otvorenu šipku. Neupotrebljeni ostaci se vraćaju u `unusedOffcuts`.
 */
export function packBars(pieces: CutPiece[], stockMm: number, kerfMm: number, offcuts: number[] = []): { bars: CutBar[]; oversize: CutPiece[]; unusedOffcuts: number[] } {
  interface Open { pieces: CutPiece[]; free: number; len: number; offcut: boolean }
  const bars: Open[] = [...offcuts].filter((l) => l > 0).sort((a, b) => a - b).map((len) => ({ pieces: [], free: len, len, offcut: true }));
  const oversize: CutPiece[] = [];
  const sorted = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm);
  // komad staje ako ima mesta za njega i rez; u praznu šipku staje i kad je tačno njene dužine (bez reza)
  const fits = (b: Open, p: CutPiece) => b.free >= p.lengthMm + kerfMm || (b.pieces.length === 0 && b.free >= p.lengthMm);
  const place = (b: Open, p: CutPiece) => { b.pieces.push(p); b.free = Math.max(0, b.free - p.lengthMm - kerfMm); };
  const bestOf = (list: Open[], p: CutPiece): Open | null => list.filter((b) => fits(b, p)).sort((a, b) => a.free - b.free)[0] ?? null;
  for (const p of sorted) {
    const off = bestOf(bars.filter((b) => b.offcut), p);
    if (off) { place(off, p); continue; }
    if (p.lengthMm > stockMm) { oversize.push(p); continue; }
    const open = bestOf(bars.filter((b) => !b.offcut), p);
    if (open) { place(open, p); continue; }
    const nb: Open = { pieces: [], free: stockMm, len: stockMm, offcut: false };
    place(nb, p);
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
  const key = (b: CutBar) => `${b.offcut ? `o${b.stockMm}` : 'n'}#${b.pieces.map((p) => `${p.lengthMm}@${p.pos}`).join('|')}`;
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
function collectPieces(project: Project, specs: ModelSpecs | undefined, materials: Material[]): { groups: RawGroup[]; positions: CutPosition[] } {
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
    if (c.glass) continue;
    const pos = elementPos(c.index);
    for (let i = 0; i < c.qty; i++) add(c.profile, { lengthMm: c.lengthMm, pos, part: c.miter ? `${c.part} (45°)` : c.part, ...(c.miter ? { miter: true } : {}) });
  }

  // stubovi uz tarabicu: cev stuba (80 × 80 ili 100 × 100) se seče iz šipke po visini stuba
  const laid = computeLayout(project);
  project.posts.forEach((p, i) => {
    if (laid.posts[i]?.hidden || !isTarabicaPost(project.items, p, i)) return;
    const post = { ...p, heightMm: laid.posts[i]?.lengthMm ?? p.heightMm };
    const tube = tarabicaPostLines(post)[0];
    const key = `S${i + 1}`;
    positions.set(key, { key, label: `Stub ${key}`, detail: `${tube.label} · visina ${Math.round(post.heightMm)} mm` });
    add(materialName(materials, tube.materialId), { lengthMm: Math.round(post.heightMm), pos: key, part: 'Stub' });
  });

  // model 06 (RL10): stubovi i lajsne po visini stuba, rukohvat i prečke po nizovima polja istog nagiba
  const rl10 = buildRl10Sheet(project, specs);
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
  const rail = buildRail04Sheet(project, specs);
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
  const louver = buildLouver08Sheet(project, specs);
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
  const { groups, positions } = collectPieces(project, specs, materials);
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
      const { bars, oversize, unusedOffcuts } = packBars(g.pieces, opts.stockMm, opts.kerfMm, offcutsOf.get(g.profile) ?? []);
      const totalBarMm = bars.reduce((s, b) => s + barLength(b, opts.stockMm), 0);
      const placed = bars.flatMap((b) => b.pieces);
      const pieceTotalMm = placed.reduce((s, p) => s + p.lengthMm, 0);
      const leftoverMm = bars.reduce((s, b) => s + b.leftoverMm, 0);
      const byLen = new Map<string, { lengthMm: number; miter: boolean; qty: number; positions: Set<string> }>();
      for (const p of g.pieces) {
        const k = `${p.lengthMm}|${p.miter ? 1 : 0}`;
        const cur = byLen.get(k) ?? { lengthMm: p.lengthMm, miter: !!p.miter, qty: 0, positions: new Set<string>() };
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
        summary: [...byLen.values()].sort((a, b) => b.lengthMm - a.lengthMm).map((v) => ({ lengthMm: v.lengthMm, qty: v.qty, positions: [...v.positions], ...(v.miter ? { miter: true } : {}) })),
      };
    })
    .sort((a, b) => a.profile.localeCompare(b.profile, 'sr'));
  const bars = profiles.reduce((s, p) => s + p.newBars, 0);
  const offcutBars = profiles.reduce((s, p) => s + p.offcutBars, 0);
  const allBarMm = profiles.reduce((s, p) => s + p.bars.reduce((x, b) => x + barLength(b, opts.stockMm), 0), 0);
  const pieceTotalMm = profiles.reduce((s, p) => s + p.pieceTotalMm, 0);
  const notes: string[] = [`Nabavna dužina šipke ${opts.stockMm} mm, širina reza testere ${opts.kerfMm} mm. Svi rezovi su ravni (90°), osim ako je drugačije označeno.`];
  const louver = buildLouver08Sheet(project, specs);
  if (louver) notes.push(louver.notes[0]);
  const rail = buildRail04Sheet(project, specs);
  if (rail) notes.push(rail.notes[0]);
  if (profiles.some((p) => p.summary.some((s) => s.miter))) notes.push('Delovi rama (oznaka 45°) se seku pod uglom od 45° na oba kraja (gerung); navedena dužina je spoljna, duža mera komada.');
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
    },
    notes,
  };
}
