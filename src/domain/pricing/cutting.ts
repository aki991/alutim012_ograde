import { outerWidthMm } from '../geometry/layout';
import type { AppSettings, Material, Project } from '../models/types';
import { materialName, type ModelSpecs } from '../models/spec';
import { itemLabel } from '../../utils/labels';
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
}

export interface ProfileCutPlan {
  profile: string;
  bars: CutBar[];
  /** komadi duži od šipke: ne mogu se iseći iz jedne šipke */
  oversize: CutPiece[];
  pieceCount: number;
  pieceTotalMm: number;
  leftoverMm: number;
  /** udeo komada u dužini svih šipki (%) */
  efficiencyPct: number;
  /** zbirni spisak: dužina, komada, pozicije */
  summary: { lengthMm: number; qty: number; positions: string[] }[];
}

export interface CuttingList {
  stockMm: number;
  kerfMm: number;
  profiles: ProfileCutPlan[];
  positions: CutPosition[];
  totals: { profiles: number; bars: number; pieces: number; pieceTotalMm: number; leftoverMm: number; efficiencyPct: number };
  notes: string[];
}

/** Raspoređivanje na šipke: najduži komadi prvi, svaki komad ide u šipku sa najmanjim ostatkom u koji staje (rez troši širinu testere). */
export function packBars(pieces: CutPiece[], stockMm: number, kerfMm: number): { bars: CutBar[]; oversize: CutPiece[] } {
  const bars: { pieces: CutPiece[]; free: number }[] = [];
  const oversize: CutPiece[] = [];
  const sorted = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm);
  for (const p of sorted) {
    if (p.lengthMm > stockMm) { oversize.push(p); continue; }
    if (p.lengthMm + kerfMm > stockMm) { bars.push({ pieces: [p], free: stockMm - p.lengthMm }); continue; } // cela šipka, bez reza
    const need = p.lengthMm + kerfMm;
    let best = -1;
    bars.forEach((b, i) => { if (b.free >= need && (best < 0 || b.free < bars[best].free)) best = i; });
    if (best >= 0) { bars[best].pieces.push(p); bars[best].free -= need; }
    else bars.push({ pieces: [p], free: stockMm - need });
  }
  return { bars: bars.map((b) => ({ pieces: b.pieces, leftoverMm: Math.max(0, b.free) })), oversize };
}

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
  const key = (b: CutBar) => b.pieces.map((p) => `${p.lengthMm}@${p.pos}`).join('|');
  const out: BarGroup[] = [];
  bars.forEach((bar, i) => {
    const last = out[out.length - 1];
    if (last && key(last.bar) === key(bar)) { last.count += 1; last.to = i + 1; }
    else out.push({ bar, count: 1, from: i + 1, to: i + 1 });
  });
  return out;
}

interface RawGroup { profile: string; pieces: CutPiece[] }

const posKey = (a: number, b: number): string => (a === b ? String(a + 1) : `${a + 1}–${b + 1}`);

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
    const key = String(index + 1);
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
    for (let i = 0; i < c.qty; i++) add(c.profile, { lengthMm: c.lengthMm, pos, part: c.part });
  }

  // stubovi uz tarabicu: cev stuba (80 × 80 ili 100 × 100) se seče iz šipke po visini stuba
  project.posts.forEach((p, i) => {
    if (!isTarabicaPost(project.items, p, i)) return;
    const tube = tarabicaPostLines(p)[0];
    const key = `S${i + 1}`;
    positions.set(key, { key, label: `Stub ${key}`, detail: `${tube.label} · visina ${Math.round(p.heightMm)} mm` });
    add(materialName(materials, tube.materialId), { lengthMm: Math.round(p.heightMm), pos: key, part: 'Stub' });
  });

  // model 04: stubovi, rukohvat i prečke (nizovi polja se seku u najdužim komadima)
  const rail = buildRail04Sheet(project, specs);
  if (rail) {
    for (const p of rail04Posts(project)) {
      const key = p.name.replace('Stub ', '');
      if (!positions.has(key)) positions.set(key, { key, label: `Stub ${key}`, detail: `Stubni profil Ø40 · visina ${Math.round(p.heightMm)} mm` });
      add('Stub Ø40 — PEGA 06', { lengthMm: Math.round(p.heightMm), pos: key, part: 'Stub' });
    }
    for (const run of rail04Runs(project)) {
      const key = posKey(run.firstIndex, run.lastIndex);
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
  const profiles: ProfileCutPlan[] = groups
    .filter((g) => g.pieces.length > 0)
    .map((g) => {
      const { bars, oversize } = packBars(g.pieces, opts.stockMm, opts.kerfMm);
      const placed = bars.flatMap((b) => b.pieces);
      const pieceTotalMm = placed.reduce((s, p) => s + p.lengthMm, 0);
      const leftoverMm = bars.reduce((s, b) => s + b.leftoverMm, 0);
      const byLen = new Map<number, { qty: number; positions: Set<string> }>();
      for (const p of g.pieces) {
        const cur = byLen.get(p.lengthMm) ?? { qty: 0, positions: new Set<string>() };
        cur.qty += 1; cur.positions.add(p.pos);
        byLen.set(p.lengthMm, cur);
      }
      return {
        profile: g.profile,
        bars,
        oversize,
        pieceCount: g.pieces.length,
        pieceTotalMm,
        leftoverMm,
        efficiencyPct: bars.length ? (pieceTotalMm / (bars.length * opts.stockMm)) * 100 : 0,
        summary: [...byLen.entries()].sort((a, b) => b[0] - a[0]).map(([lengthMm, v]) => ({ lengthMm, qty: v.qty, positions: [...v.positions] })),
      };
    })
    .sort((a, b) => a.profile.localeCompare(b.profile, 'sr'));
  const bars = profiles.reduce((s, p) => s + p.bars.length, 0);
  const pieceTotalMm = profiles.reduce((s, p) => s + p.pieceTotalMm, 0);
  const notes: string[] = [`Nabavna dužina šipke ${opts.stockMm} mm, širina reza testere ${opts.kerfMm} mm. Svi rezovi su ravni (90°), osim ako je drugačije označeno.`];
  const louver = buildLouver08Sheet(project, specs);
  if (louver) notes.push(louver.notes[0]);
  const rail = buildRail04Sheet(project, specs);
  if (rail) notes.push(rail.notes[0]);
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
      pieces: profiles.reduce((s, p) => s + p.pieceCount, 0),
      pieceTotalMm,
      leftoverMm: profiles.reduce((s, p) => s + p.leftoverMm, 0),
      efficiencyPct: bars ? (pieceTotalMm / (bars * opts.stockMm)) * 100 : 0,
    },
    notes,
  };
}
