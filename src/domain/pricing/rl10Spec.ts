import { computeLayout, isSpacer, type ProjectLayout } from '../geometry/layout';
import { isRl10Post, RL10_MODEL, rl10Corner, rl10Ends, rl10Geometry, rl10PostInfo, type Rl10Geometry } from '../models/rl10';
import { hasCustomSpec, type ModelSpecs } from '../models/spec';
import type { FenceSection, Project } from '../models/types';
import { itemLabel } from '../../utils/labels';
import { describePieces, fmtMm, group, planBars, RAIL04, splitLength, type BarPlanRow, type SheetBomRow, type SheetCutRow } from './railSpec';

/**
 * Sastavnica i krojna lista za model „Inox — horizontalne prečke" (BTS ROUND RL10). Rukohvat P-1033 i prečke P-1146 se seku u
 * najdužim mogućim komadima: susedna polja istog nagiba čine jedan niz. Spoj ravnog dela i stepeništa je zglob AK-5020K
 * (rukohvat) i AK-5022Y (svaka prečka): cevi se seku pod 90°, a ugao daje zglob. Stub uz stepenište ima podesivu vezu AK-5001.
 * Mere i količine su PLANERSKE (procena iz kataloga BTS) — proveriti sa dobavljačem pre narudžbine.
 */
export const isRl10Item = (it: { kind: string; modelId?: string }): boolean => it.kind === 'fence' && it.modelId === RL10_MODEL;

export interface Rl10Run {
  /** prvo i poslednje polje niza (indeksi u projektu) */
  firstIndex: number;
  lastIndex: number;
  names: string[];
  /** zbir dužina polja (osa–osa) po nagibu */
  axisMm: number;
  /** potrebna dužina rukohvata i prečki (sa prepustom na slobodnom kraju, bez polovine zgloba na spoju) */
  railLenMm: number;
  rodLenMm: number;
  railPieces: number[];
  rodPieces: number[];
  rodHeightsMm: number[];
  heightMm: number;
  slopeDeg: number;
  leftEnd: 'cap' | 'joint';
  rightEnd: 'cap' | 'joint';
  postCount: number;
}

export interface Rl10Post {
  name: string;
  /** dužina cevi stuba i lajsne (od mesta na kome stoji do vrha stuba) */
  tubeMm: number;
  /** podesiva veza AK-5001 (pod nagibom) umesto fiksne AK-5039N */
  adjustable: boolean;
  /** spoj ravnog dela i stepeništa na ovom stubu */
  joint: boolean;
  rods: number;
}

/** Ugao u osnovi (stepenište pa ograda u stranu, ili skretanje ravne ograde) na stubu `postIndex`. */
export interface Rl10CornerPart { postName: string; slopeBall: boolean; turnDeg: number; railPieceMm: number; rodPieceMm: number; rods: number }

export interface Rl10Quantities {
  /** uglovi u osnovi: pravo parče rukohvata, ravni delovi prečki uz kuglu, kolena */
  cornerPieces: Rl10CornerPart[];
  /** pravo parče rukohvata i ravni delovi prečki između kugli na uglu (mm) */
  cornerRailLens: number[];
  cornerRodLens: number[];
  tubeLens: number[];
  railLens: number[];
  rodLens: number[];
  saddlesFixed: number;
  saddlesAdjustable: number;
  holders: number;
  jointsRail: number;
  jointsRod: number;
  railCaps: number;
  rodCaps: number;
  posts: number;
}

export interface Rl10Sheet {
  corners: Rl10CornerPart[];
  title: string;
  panels: { name: string; index: number }[];
  runs: Rl10Run[];
  posts: Rl10Post[];
  bom: SheetBomRow[];
  cuts: SheetCutRow[];
  bars: BarPlanRow[];
  quantities: Rl10Quantities;
  mainTotalMm: number;
  notes: string[];
}

interface FieldInfo { li: ProjectLayout['items'][number]; f: FenceSection; geo: Rl10Geometry; tan: number }

export function rl10Runs(project: Project, layout: ProjectLayout = computeLayout(project)): Rl10Run[] {
  const runs: Rl10Run[] = [];
  let cur: { fields: FieldInfo[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const fields = cur.fields;
    const first = fields[0];
    const last = fields[fields.length - 1];
    const d = first.geo.dims;
    const axisMm = fields.reduce((s, x) => s + (x.li.axisEnd - x.li.axisStart) * Math.sqrt(1 + x.tan * x.tan), 0);
    const ends = rl10Ends(project.items, layout, first.li.index, project.posts);
    const endsR = rl10Ends(project.items, layout, last.li.index, project.posts);
    const leftEnd = ends.left.rail.kind === 'cap' ? 'cap' : 'joint';
    const rightEnd = endsR.right.rail.kind === 'cap' ? 'cap' : 'joint';
    // krajevi: prepust (−), polovina zgloba ili skraćenje do kolena (+)
    const railLenMm = Math.round(axisMm - ends.left.rail.insetMm - endsR.right.rail.insetMm);
    const rodLenMm = Math.round(axisMm - ends.left.rod.insetMm - endsR.right.rod.insetMm);
    runs.push({
      firstIndex: first.li.index, lastIndex: last.li.index, names: fields.map((x) => itemLabel(project.items, x.li.index)),
      axisMm, railLenMm, rodLenMm,
      railPieces: splitLength(railLenMm, RAIL04.stockMm, d.railOverhangMm).pieces,
      rodPieces: splitLength(rodLenMm, RAIL04.stockMm, d.rodOverhangMm).pieces,
      rodHeightsMm: first.geo.rodHeightsMm, heightMm: first.f.heightMm,
      slopeDeg: Math.round((Math.atan(Math.abs(first.tan)) * 180) / Math.PI),
      leftEnd, rightEnd, postCount: fields.length + 1,
    });
    cur = null;
  };
  for (const li of layout.items) {
    if (isSpacer(li.item)) continue;
    if (!isRl10Item(li.item)) { flush(); continue; }
    const f = li.item as FenceSection;
    const geo = rl10Geometry(f.heightMm, f.params);
    const tan = li.axisEnd > li.axisStart ? (li.floorEnd - li.floorStart) / (li.axisEnd - li.axisStart) : 0;
    const prev = cur?.fields[cur.fields.length - 1];
    const through = prev && prev.li.index === li.index - 1 && !rl10Corner(project.items, layout, project.posts, li.index) && Math.abs(prev.tan - tan) < 1e-3 && prev.f.heightMm === f.heightMm && prev.geo.rodHeightsMm.join() === geo.rodHeightsMm.join()
      && prev.geo.dims.railDiaMm === geo.dims.railDiaMm;
    if (!through) flush();
    if (!cur) cur = { fields: [] };
    cur.fields.push({ li, f, geo, tan });
  }
  flush();
  return runs;
}

export function rl10Posts(project: Project, layout: ProjectLayout = computeLayout(project)): Rl10Post[] {
  const out: Rl10Post[] = [];
  project.posts.forEach((_, i) => {
    if (layout.posts[i]?.hidden || !isRl10Post(project.items, i)) return;
    const item = [project.items[i - 1], project.items[i]].find((it) => it && isRl10Item(it)) as FenceSection;
    const g = rl10Geometry(item.heightMm, item.params);
    const info = rl10PostInfo(project.items, layout, i);
    const lp = layout.posts[i];
    const corner = layout.posts[i].auxShiftMm !== null;
    // ugao u osnovi: oba stuba nose ravne delove (fiksna veza), a pomoćni stub je na dolazećoj ogradi
    out.push({ name: `Stub S${i + 1}`, tubeMm: Math.round(g.postTopMm + Math.max(0, lp.lineMm - lp.floorMm)), adjustable: corner ? false : info.adjustable, joint: corner ? false : info.joint !== null, rods: g.rodHeightsMm.length });
    if (corner) out.push({ name: `Stub S${i + 1}a`, tubeMm: Math.round(g.postTopMm), adjustable: false, joint: false, rods: g.rodHeightsMm.length });
  });
  return out;
}

export function buildRl10Sheet(project: Project, specs?: ModelSpecs): Rl10Sheet | null {
  if (hasCustomSpec(RL10_MODEL, specs)) return null; // izmenjena specifikacija zamenjuje detaljnu sastavnicu
  if (!project.items.some((it) => isRl10Item(it))) return null;
  const layout = computeLayout(project);
  const runs = rl10Runs(project, layout);
  const posts = rl10Posts(project, layout);
  const panels = layout.items.filter((li) => isRl10Item(li.item)).map((li) => ({ name: itemLabel(project.items, li.index), index: li.index }));

  const tubeLens = posts.map((p) => p.tubeMm);
  const railLens = runs.flatMap((r) => r.railPieces);
  const rodLens = runs.flatMap((r) => r.rodHeightsMm.flatMap(() => r.rodPieces));
  const saddlesAdjustable = posts.filter((p) => p.adjustable).length;
  const saddlesFixed = posts.length - saddlesAdjustable;
  const holders = posts.reduce((s, p) => s + p.rods, 0);
  // zglobovi: spoj nagiba (po jedna kugla), ugao u osnovi (po jedna kugla; uz stepenište dve kugle sa pravim parčetom na rukohvatu i svakoj prečki)
  const corners: Rl10CornerPart[] = [];
  let jointsRail = 0;
  let jointsRod = 0;
  const cornerRailPieces: number[] = [];
  const cornerRodPieces: number[] = [];
  project.posts.forEach((_, i) => {
    if (layout.posts[i]?.hidden) return;
    const c = rl10Corner(project.items, layout, project.posts, i);
    const rl = project.items[i - 1] && isRl10Item(project.items[i - 1]) ? (project.items[i - 1] as FenceSection) : null;
    const n = rl ? rl10Geometry(rl.heightMm, rl.params).rodHeightsMm.length : 0;
    if (c) {
      jointsRail += c.slopeBall ? 2 : 1;
      jointsRod += c.slopeBall ? 2 * n : n;
      if (c.slopeBall) { for (let r = 0; r < n; r++) cornerRodPieces.push(Math.round(c.rod.pieceLenMm)); cornerRailPieces.push(Math.round(c.railPieceLenMm)); }
      corners.push({ postName: `S${i + 1}`, slopeBall: c.slopeBall, turnDeg: Math.round((c.turn * 180) / Math.PI), railPieceMm: Math.round(c.railPieceLenMm), rodPieceMm: Math.round(c.rod.pieceLenMm), rods: n });
    } else if (project.posts[i] && rl10PostInfo(project.items, layout, i).joint) {
      jointsRail += 1;
      jointsRod += n;
    }
  });
  const capEnds = runs.reduce((s, r) => s + (r.leftEnd === 'cap' ? 1 : 0) + (r.rightEnd === 'cap' ? 1 : 0), 0);
  const railCaps = capEnds;
  const rodCaps = runs.reduce((s, r) => s + ((r.leftEnd === 'cap' ? 1 : 0) + (r.rightEnd === 'cap' ? 1 : 0)) * r.rodHeightsMm.length, 0);
  const quantities: Rl10Quantities = { cornerPieces: corners, cornerRailLens: cornerRailPieces, cornerRodLens: cornerRodPieces, tubeLens, railLens, rodLens, saddlesFixed, saddlesAdjustable, holders, jointsRail, jointsRod, railCaps, rodCaps, posts: posts.length };

  const first = project.items.find((it) => isRl10Item(it)) as FenceSection;
  const d = rl10Geometry(first.heightMm, first.params);
  const bom: SheetBomRow[] = [];
  const add = (part: string, code: string, qty: string, note: string) => bom.push({ pos: bom.length + 1, part, code, qty, note });
  const allRailLens = [...railLens, ...cornerRailPieces];
  const allRodLens = [...rodLens, ...cornerRodPieces];
  add(`Rukohvat — cev Ø${d.dims.railDiaMm} × 2 mm`, 'P-1033', describePieces(allRailLens), 'Neprekinut komad po nizu polja istog nagiba; slobodan kraj ima prepust do završetka; pravo parče između kugli na uglu');
  add(`Prečka — cev Ø${d.rodDiaMm}`, 'P-1146', describePieces(allRodLens), 'Jedan komad po prečki i nizu; prolazi kroz nosače ispred stubova; kratki komadi uz kuglu na uglu');
  add(`Stub — cev Ø${d.dims.postDiaMm} × 2 mm sa kanalom`, 'P-1054', describePieces(tubeLens), 'Dužina = od mesta na kome stub stoji do vrha stuba (ispod veze sa rukohvatom)');
  add('Pokrivna lajsna kanala stuba', 'P-AL2647', describePieces(tubeLens), 'Ista dužina kao stub (ulazi u kanal sa strane prečki)');
  add('Prsten na vrhu stuba Ø40', 'AK-5062', `${posts.length} kom`, 'Po jedan na svakom stubu');
  if (saddlesFixed > 0) add('Veza stub Ø40 – rukohvat Ø50, fiksna', 'AK-5039N', `${saddlesFixed} kom`, 'Ravni delovi (i stub ispod zgloba); 3 vijka BTS-VP4219 po vezi');
  if (saddlesAdjustable > 0) add('Veza stub Ø40 – rukohvat Ø50, podesiva', 'AK-5001', `${saddlesAdjustable} kom`, 'Stubovi uz stepenište: ležište prati nagib rukohvata; 3 vijka BTS-VP4219 po vezi');
  add('Stopa stuba Ø40, spoljna prirubnica sa čaurom', 'AK-5036X', `${posts.length} kom`, 'Po jedna na svakom stubu');
  add('Hemijsko sidro (ETA)', 'AK-5027K', `${posts.length * 3} kom`, '3 sidra po stopi (BTS-VT75100 × 3)');
  add('Nosač prečke Ø16, podesivi', 'AK-5011Y', `${holders} kom`, 'Po jedan na svakom stubu za svaku prečku; 1 vijak BTS-VP4238 po nosaču');
  if (jointsRail > 0) {
    add('Zglob rukohvata Ø50 (kuglasti, podesiv ugao)', 'AK-5020K', `${jointsRail} kom`, 'Spoj ravnog dela i stepeništa i ugao u osnovi; stoji sam (ne nosi ga stub); cevi se seku pod 90°');
  }
  if (jointsRod > 0) add('Zglob prečke Ø16 (kuglasti, podesiv ugao)', 'AK-5022Y', `${jointsRod} kom`, 'Na spoju ravnog dela i stepeništa i na uglu u osnovi: na svakoj prečki, isto kao rukohvat (uz stepenište dve kugle sa pravim parčetom)');
  add('Završetak rukohvata Ø50', 'AK-5009', `${railCaps} kom`, 'Na slobodnim krajevima niza');
  add('Završetak prečke Ø16', 'AK-5012A', `${rodCaps} kom`, 'Na slobodnim krajevima prečki');
  add('Montažni potrošni materijal', 'Prema postupku montaže', 'prema potrošnji', 'Ne računati celo pakovanje kao potrošnju');

  const cuts: SheetCutRow[] = [];
  const straight = 'Oba kraja ravno, pod 90°';
  type Piece = { len: number; cut: string };
  const emit = (prefix: string, part: string, profile: string, pieces: Piece[]) => {
    const g = new Map<string, { len: number; cut: string; qty: number }>();
    for (const p of pieces) { const k = `${p.len}|${p.cut}`; const cur = g.get(k); if (cur) cur.qty += 1; else g.set(k, { ...p, qty: 1 }); }
    [...g.values()].sort((a, b) => b.len - a.len).forEach((x, i) => cuts.push({ mark: `${prefix}-${String(i + 1).padStart(2, '0')}`, part, profile, qty: x.qty, lengthMm: x.len, totalMm: x.qty * x.len, cut: x.cut }));
  };
  const cutOf = (r: Rl10Run) => (r.slopeDeg > 0 ? `${straight} (ugao ${r.slopeDeg}° daje zglob)` : straight);
  emit('S', 'Stub Ø40', 'P-1054', tubeLens.map((len) => ({ len, cut: straight })));
  emit('L', 'Pokrivna lajsna', 'P-AL2647', tubeLens.map((len) => ({ len, cut: straight })));
  emit('R', 'Rukohvat Ø50', 'P-1033', runs.flatMap((r) => r.railPieces.map((len) => ({ len, cut: cutOf(r) }))));
  emit('P', 'Prečka Ø16', 'P-1146', runs.flatMap((r) => r.rodHeightsMm.flatMap(() => r.rodPieces.map((len) => ({ len, cut: cutOf(r) })))));

  const mainTotalMm = [...tubeLens, ...railLens, ...rodLens].reduce((s, v) => s + v, 0);
  const bars: BarPlanRow[] = [];
  for (const [label, lens] of [['Stub Ø40 — P-1054', tubeLens], ['Pokrivna lajsna — P-AL2647', tubeLens], ['Rukohvat Ø50 — P-1033', railLens], ['Prečke Ø16 — P-1146', rodLens]] as const) {
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
    'Planerske mere i količine prema katalogu BTS (ROUND RL10): proveriti sa dobavljačem. Susedna polja istog nagiba čine jedan niz: rukohvat i prečke se seku u najdužim mogućim komadima.',
    `Dužina rukohvata = zbir polja (osa–osa, po nagibu) + prepust ${d.dims.railOverhangMm} mm na slobodnom kraju; na spoju sa stepeništem se oduzima polovina zgloba (${d.dims.railJointMm / 2} mm). Prečke: prepust ${d.dims.rodOverhangMm} mm, polovina zgloba ${d.dims.rodJointMm / 2} mm.`,
    'Stub je dugačak od mesta na kome stoji do vrha stuba (ispod veze sa rukohvatom). Stub na stepeništu stoji po sredini gazišta (podrazumevano na svaki treći stepenik) i duži je za razliku između linije rukohvata i gazišta.',
    `Raspored na šipke: nabavna dužina ${RAIL04.stockMm} mm i širina reza ${RAIL04.kerfMm} mm su pretpostavke. Ukupno stubova: ${posts.length}, nosača prečki: ${holders}.`,
    'Vijci BTS-VP4219 (veza), BTS-VP4238 (nosač prečke) i BTS-VT75100 (stopa) navedeni su u opisu; proveriti šta se isporučuje uz komade. Raspored prečki nije proveren kao zaštitna ograda protiv pada.',
  ];
  for (const r of runs) {
    if (r.railPieces.length > 1) notes.push(`Niz ${r.names[0]}–${r.names[r.names.length - 1]}: rukohvat ${fmtMm(r.railLenMm)} mm je duži od šipke (${fmtMm(RAIL04.stockMm)} mm), pa se spaja (potrebne spojnice).`);
  }
  return { title: 'Model 06 — Inox (RL10)', corners, panels, runs, posts, bom, cuts, bars, quantities, mainTotalMm, notes };
}
