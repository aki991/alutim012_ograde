import { gateLeafPoses, gateSpecWidth } from '../geometry/gates';
import { isStair, stairGroupAt, stairGroupSummary } from '../geometry/stair';
import { computeInfill } from '../geometry/infill';
import { computeLayout, railingWidthMm } from '../geometry/layout';
import { AUTOMATION_LABELS, colorText, HINGE_LABELS, LOCK_LABELS, MOUNTING_LABELS, POST_LABELS } from '../models/catalog';
import type { ModelSpecs } from '../models/spec';
import type { Material, Project } from '../models/types';
import { indexOfNumber, itemLabel, itemNumber } from '../../utils/labels';
import { buildBom, buildElementFinishing, buildProjectFinishing } from './calc';
import { finishingArea, finishingMass, measureFinishing, type FinishingSummary } from './finishing';
import { buildRl10Sheet } from './rl10Spec';
import { customSlatCount, isCustomModel } from '../models/customRegistry';
import { leafHeightOf } from '../gates/slidingLayout';
import { resolveSliding, variantTitle } from '../gates/slidingAssembly';
import { slidingH } from '../gates/slidingLayout';
import { buildCuttingList, inPrintScope, scopedProject, type CutOptions, type CuttingList, type CutPosition } from './cutting';
import { buildCutList } from './production';
import { postMaterialLine } from '../models/postTemplates';
import { isProductionPost } from '../models/productionPosts';

/** Radni nalog za majstora koji sklapa ogradu: elementi sa delovima, stubovi, okovi i sitan materijal, kontrolne tačke. */

/** deo za sklapanje; name = naziv bez oznake uglova (za povezivanje sa sklopnim crtežom), no = broj dela na sklopnom crtežu */
export interface WorkPart { part: string; name?: string; profile: string; lengthMm: number | null; qty: number; note?: string; no?: number }
export interface WorkFact { label: string; value: string }

export interface WorkElement {
  finishing: FinishingSummary;
  /** ključ pozicije iz krojne liste (P1, P2…) */
  key: string;
  label: string;
  detail: string;
  /** boja (RAL) elementa; prazno za nizove više elemenata */
  color: string;
  parts: WorkPart[];
  facts: WorkFact[];
  /** kapija: dodatne tačke kontrole (okov, funkcija) */
  isGate: boolean;
  /** klizna kapija kao sklop: redni broj elementa u projektu (za sklopni crtež sa brojevima delova) */
  slidingIndex?: number;
  /** redni broj (od 0) prvog elementa projekta koji pripada poziciji: za sklopni crtež elementa */
  itemIndex?: number;
}

export interface WorkPost { name: string; where: string; type: string; widthMm: number; heightMm: number; mounting: string; color: string; plinthMm?: number }
export interface WorkSmallItem { name: string; qty: number; unit: string }

export interface WorkOrder {
  finishing: FinishingSummary;
  cutting: CuttingList;
  elements: WorkElement[];
  posts: WorkPost[];
  small: WorkSmallItem[];
  summary: { occupiedMm: number; elements: number; gates: number; posts: number; maxHeightMm: number };
  /** ključ pozicije (krojne liste) za svaki element projekta; ključevi nizova pokrivaju više elemenata */
  positionOfItem: (index: number) => string | null;
}

const SIDE = { left: 'levo', right: 'desno' } as const;
const SLIDE = { left: 'ulevo', right: 'udesno' } as const;
/** Boja za prikaz: RAL ključ, a posebna (heksadecimalna) boja sa oznakom. */
const colorLabel = colorText;
const SWING = { inward: 'ka unutra', outward: 'ka spolja' } as const;

export function positionOfItem(positions: CutPosition[], index: number): string | null {
  const own = String(index + 1);
  if (positions.some((p) => p.key === own)) return own;
  const n = index + 1;
  for (const p of positions) {
    const m = /^(\d+)–(\d+)$/.exec(p.key);
    if (m && Number(m[1]) <= n && n <= Number(m[2])) return p.key;
  }
  return null;
}

const isStubKey = (k: string) => /^S\d+$/.test(k);

/** redosled delova klizne kapije u radnom nalogu (i brojeva na sklopnom crtežu): ram, U vođice, ispuna, C-profil ili šina, rep, ostalo */
function assemblyRank(name: string): number {
  const order: [RegExp, number][] = [[/^Ram/, 0], [/^Bočn/, 1], [/^Ispuna|^Prečka|^Ploča/, 2], [/C-profil|^Podna šina/, 3], [/^Rep — kosnik/, 4], [/^Rep — donja/, 5], [/^Rep/, 6]];
  return order.find(([re]) => re.test(name))?.[1] ?? 7;
}

export function buildWorkOrder(project: Project, specs: ModelSpecs | undefined, materials: Material[], opts: CutOptions): WorkOrder {
  const cutting = buildCuttingList(project, specs, materials, opts);
  // deo projekta koji se štampa (ceo, samo kapije ili ograda bez kapija): elementi van njega su prazni otvori, pa stubovi uz njih ne ulaze
  const scope = opts.scope ?? 'all';
  const sp = scopedProject(project, scope);
  const layout = computeLayout(sp);
  const rl10 = buildRl10Sheet(sp, specs);
  const glassBy = new Map<string, WorkPart[]>();
  for (const c of buildCutList(project, specs, materials)) {
    if (!c.glass || !inPrintScope(project.items[c.index], scope)) continue;
    const key = String(c.index + 1);
    const list = glassBy.get(key) ?? [];
    list.push({ part: c.part, profile: c.profile, lengthMm: null, qty: c.qty, note: c.note });
    glassBy.set(key, list);
  }

  // delovi po poziciji: isti deo, profil i dužina se sabiraju
  const partsBy = new Map<string, Map<string, WorkPart>>();
  for (const prof of cutting.profiles) {
    for (const bar of prof.bars) {
      for (const pc of bar.pieces) {
        const m = partsBy.get(pc.pos) ?? new Map<string, WorkPart>();
        const k = `${prof.profile}|${pc.part}|${pc.lengthMm}`;
        const cur = m.get(k);
        if (cur) cur.qty += 1; else m.set(k, { part: pc.part, name: pc.name ?? pc.part, profile: prof.profile, lengthMm: pc.lengthMm, qty: 1 });
        partsBy.set(pc.pos, m);
      }
    }
    for (const pc of prof.oversize) {
      const m = partsBy.get(pc.pos) ?? new Map<string, WorkPart>();
      const k = `${prof.profile}|${pc.part}|${pc.lengthMm}`;
      const cur = m.get(k);
      if (cur) cur.qty += 1; else m.set(k, { part: pc.part, name: pc.name ?? pc.part, profile: prof.profile, lengthMm: pc.lengthMm, qty: 1 });
      partsBy.set(pc.pos, m);
    }
  }

  const elements: WorkElement[] = [];
  for (const pos of cutting.positions) {
    if (isStubKey(pos.key)) continue; // stubovi su u zasebnoj tabeli
    const idx = /^\d+$/.test(pos.key) ? indexOfNumber(project.items, Number(pos.key)) : -1;
    const it = idx >= 0 ? project.items[idx] : undefined;
    const range = /^(\d+)–\d+$/.exec(pos.key);
    const firstIdx = idx >= 0 ? idx : range ? indexOfNumber(project.items, Number(range[1])) : -1;
    const sliding = it?.kind === 'gate' && it.sliding ? it.sliding : undefined;
    const parts = [...(partsBy.get(pos.key)?.values() ?? []), ...(glassBy.get(pos.key) ?? [])]
      .sort((a, b) => (sliding ? assemblyRank(a.name ?? a.part) - assemblyRank(b.name ?? b.part) : 0) || a.profile.localeCompare(b.profile, 'sr') || (b.lengthMm ?? 0) - (a.lengthMm ?? 0));
    // klizna kapija: delovi su numerisani kao na sklopnom crtežu (redom sklapanja: ram, ispuna, C-profil, rep)
    if (sliding) parts.forEach((p, i) => { p.no = i + 1; });
    const facts: WorkFact[] = [];
    let color = '';
    let isGate = false;
    if (it && it.kind !== 'opening') {
      color = colorLabel(it.color, it.finish);
      isGate = it.kind === 'gate';
      const modelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
      const li = layout.items[idx];
      // dvokrilna kapija: letvice oba krila (svako krilo ima svoju širinu); kapija: širina i visina krila (kao u krojnoj listi),
      // klizna kapija bez odstojanja od tla
      const leafWs = it.kind === 'gate' && it.gateType === 'double' ? gateLeafPoses(it, li.clearStart, li.clearEnd, 0).map((q) => q.widthMm) : [it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth];
      const leafH = it.kind === 'gate' ? leafHeightOf(it) : it.heightMm;
      const bars = leafWs.reduce((n, w) => n + computeInfill(modelId, w, leafH, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount).bars.filter((b) => b.tone === 'main').length, 0);
      const slatCount = isCustomModel(modelId) ? leafWs.reduce((n, w) => n + customSlatCount(modelId, w, it.kind === 'gate' ? leafHeightOf(it) : it.heightMm, it.params.slats), 0) : 0;
      facts.push(
        ...(sliding ? [] : [{ label: 'Ukupna širina', value: `${Math.round(railingWidthMm(project, idx))} mm` }, { label: 'Visina', value: `${Math.round(it.heightMm)} mm` }]),
        { label: 'Boja', value: colorLabel(it.color, it.finish) },
        ...(bars > 0 && !isCustomModel(modelId) ? [{ label: 'Profila ispune', value: String(bars) }] : []),
        // nacrtan model: broj uspravnih letvica preračunat za stvarnu širinu krila (isti kao na crtežu i u krojnoj listi)
        ...(isCustomModel(modelId) && slatCount > 0 ? [{ label: 'Letvica', value: String(slatCount) }] : []),
        ...(isStair(it) ? [{ label: 'Stepenište', value: stairGroupSummary(stairGroupAt(project.items, idx)!) }] : []),
      );
      if (it.kind === 'gate' && sliding) {
        // klizna kapija: mere sklopa koje majstoru trebaju (krilo, visina od tla, rep, C-profil ili šina, hod)
        const r = resolveSliding(sliding, li.clearWidth, slidingH(it));
        const fb = r.spec.frameBottomY;
        facts.unshift(
          { label: 'Izvedba', value: variantTitle(r.spec) },
          { label: 'Krilo (š × v)', value: `${Math.round(r.W)} × ${Math.round(r.frameHeight)} mm` },
          { label: 'Ram od tla', value: `${Math.round(fb)} mm` },
          { label: 'Visina od tla', value: `${Math.round(fb + r.frameHeight)} mm` },
          ...(r.spec.support === 'cantilever'
            ? [{ label: 'Rep', value: `${Math.round(r.at('carrierLength') - r.W)} mm` }, { label: 'C-profil', value: `${Math.round(r.at('carrierLength'))} mm` }]
            : [{ label: 'Šina', value: `${Math.round(r.at('railLength'))} mm` }]),
          { label: 'Hod', value: `${Math.round(r.spec.travel)} mm` },
        );
        facts.push({ label: 'Klizanje', value: SLIDE[it.opening] }, { label: 'Pogon', value: r.spec.actuation === 'manual' ? 'Ručni' : 'Motorni' });
        if (it.availableSpaceMm) facts.push({ label: 'Prostor za povlačenje', value: `${Math.round(it.availableSpaceMm)} mm` });
      } else if (it.kind === 'gate') {
        facts.push(
          it.gateType === 'sliding'
            ? { label: 'Klizanje', value: SLIDE[it.opening] }
            : { label: 'Otvaranje', value: `${SIDE[it.opening]}, ${SWING[it.swing]}` },
          ...(it.gateType === 'sliding' ? [] : [{ label: 'Šarke', value: HINGE_LABELS[it.hinge] }]),
          { label: 'Brava', value: LOCK_LABELS[it.lock] },
          { label: 'Automatika', value: it.automation ? AUTOMATION_LABELS[it.automationType] : 'Bez automatike' },
        );
        if (it.gateType === 'sliding' && it.availableSpaceMm) facts.push({ label: 'Prostor za povlačenje', value: `${Math.round(it.availableSpaceMm)} mm` });
        if (it.gateType === 'double' && it.unequalLeaves) facts.push({ label: 'Levo krilo', value: `${Math.round(it.leftLeafMm)} mm` });
      }
    }
    const limits = /^(\d+)(?:–(\d+))?$/.exec(pos.key);
    const indices = project.items.flatMap((item, i) => item.kind !== 'opening' && inPrintScope(item, scope) && limits && itemNumber(project.items, i) >= Number(limits[1]) && itemNumber(project.items, i) <= Number(limits[2] ?? limits[1]) ? [i] : []);
    const corner = rl10?.corners.find((c) => c.slopeBall && `U${c.postName}` === pos.key);
    const finishing = corner ? measureFinishing([
      { materialId: 'mat_bts_p1033', name: 'Rukohvat P-1033', unit: 'm', geometricQty: corner.railPieceMm / 1000 },
      { materialId: 'mat_bts_p1146', name: 'Prečka P-1146', unit: 'm', geometricQty: corner.rodPieceMm * corner.rods / 1000 },
      { materialId: 'mat_bts_ak5020k', name: 'Zglob rukohvata AK-5020K', unit: 'kom', geometricQty: 2 },
      { materialId: 'mat_bts_ak5022y', name: 'Zglob prečke AK-5022Y', unit: 'kom', geometricQty: 2 * corner.rods },
    ], materials) : buildElementFinishing(sp, indices, materials, specs);
    facts.push({ label: 'Masa (bez stubova)', value: finishingMass(finishing) }, { label: 'Plastificiranje', value: finishingArea(finishing) });
    elements.push({ finishing, key: pos.key, label: pos.label, detail: pos.detail, color, parts, facts, isGate, ...(sliding && idx >= 0 ? { slidingIndex: idx } : {}), ...(firstIdx >= 0 ? { itemIndex: firstIdx } : {}) });
  }

  const posts: WorkPost[] = project.posts.flatMap((p, i) => (layout.posts[i]?.hidden || !isProductionPost(p) ? [] : [{ p, i }])).map(({ p, i }) => {
    const n = project.items.length;
    const spacerRight = project.items[i]?.kind === 'opening' && Boolean((project.items[i] as { spacer?: boolean }).spacer);
    const spacerLeft = project.items[i - 1]?.kind === 'opening' && Boolean((project.items[i - 1] as { spacer?: boolean }).spacer);
    const where = i === 0 ? 'Početak (levo)' : i === n ? 'Kraj (desno)' : spacerRight ? `Stub ograde uz: ${itemLabel(project.items, i - 1)}` : spacerLeft ? `Svoj stub: ${itemLabel(project.items, i)}` : `Između: ${itemLabel(project.items, i - 1)} i ${itemLabel(project.items, i)}`;
    return {
      // presek stuba (cev iz koje se seče): izabran materijal ili standardna cev iste mere
      name: `S${i + 1}`, where, type: ((own) => (own ? `${POST_LABELS[p.type]} · ${materials?.find((m) => m.id === own.materialId)?.name ?? ''}` : POST_LABELS[p.type]))(materials ? postMaterialLine(project, i, materials, layout.posts[i]?.lengthMm ?? p.heightMm) : null), widthMm: p.widthMm, heightMm: layout.posts[i]?.lengthMm ?? p.heightMm, mounting: MOUNTING_LABELS[p.mounting], color: colorLabel(p.color, p.finish),
      plinthMm: p.type === 'concrete_plinth' ? p.plinthMm : undefined,
    };
  });

  // okovi i sitan materijal: ukupno za projekat (bez profila, stubova i rezerve u novcu)
  const SMALL_GROUPS = new Set(['Nosači i spojnice', 'Vijci', 'Šarke', 'Brave', 'Točkići', 'Automatika']);
  // profil koji se seče po krojnoj listi (npr. C-profil) je već među delovima elementa, pa se ne ponavlja u okovu
  const cutProfiles = new Set(cutting.profiles.map((p) => p.profile));
  const small: WorkSmallItem[] = buildBom(sp, materials, specs)
    .filter((l) => SMALL_GROUPS.has(l.group) && l.geometricQty > 0 && !(l.unit === 'm' && cutProfiles.has(l.name)))
    .map((l) => ({ name: l.name, qty: l.unit === 'kom' || l.unit === 'set' ? Math.ceil(l.geometricQty - 1e-9) : Math.round(l.geometricQty * 100) / 100, unit: l.unit }));

  const gates = project.items.filter((i) => i.kind === 'gate' && inPrintScope(i, scope)).length;
  return {
    finishing: buildProjectFinishing(sp, materials, specs),
    cutting,
    elements,
    posts,
    small,
    summary: { occupiedMm: layout.railingLengthMm, elements: project.items.filter((i) => i.kind !== 'opening' && inPrintScope(i, scope)).length, gates, posts: posts.length, maxHeightMm: Math.max(0, ...sp.items.map((it) => it.kind === 'opening' ? 0 : it.heightMm), ...posts.map((p) => p.heightMm)) },
    positionOfItem: (index) => positionOfItem(cutting.positions, itemNumber(project.items, index) - 1),
  };
}
