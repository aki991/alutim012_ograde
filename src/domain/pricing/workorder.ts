import { isStair, stairGroupAt, stairGroupSummary } from '../geometry/stair';
import { computeInfill } from '../geometry/infill';
import { computeLayout, outerWidthMm } from '../geometry/layout';
import { AUTOMATION_LABELS, colorText, HINGE_LABELS, LOCK_LABELS, MOUNTING_LABELS, POST_LABELS } from '../models/catalog';
import type { ModelSpecs } from '../models/spec';
import type { Material, Project } from '../models/types';
import { indexOfNumber, itemLabel, itemNumber } from '../../utils/labels';
import { buildBom } from './calc';
import { buildCuttingList, type CutOptions, type CuttingList, type CutPosition } from './cutting';
import { buildCutList } from './production';

/** Radni nalog za majstora koji sklapa ogradu: elementi sa delovima, stubovi, okovi i sitan materijal, kontrolne tačke. */

export interface WorkPart { part: string; profile: string; lengthMm: number | null; qty: number; note?: string }
export interface WorkFact { label: string; value: string }

export interface WorkElement {
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
}

export interface WorkPost { name: string; where: string; type: string; widthMm: number; heightMm: number; mounting: string; color: string; plinthMm?: number }
export interface WorkSmallItem { name: string; qty: number; unit: string }

export interface WorkOrder {
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

export function buildWorkOrder(project: Project, specs: ModelSpecs | undefined, materials: Material[], opts: CutOptions): WorkOrder {
  const cutting = buildCuttingList(project, specs, materials, opts);
  const layout = computeLayout(project);
  const glassBy = new Map<string, WorkPart[]>();
  for (const c of buildCutList(project, specs, materials)) {
    if (!c.glass) continue;
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
        if (cur) cur.qty += 1; else m.set(k, { part: pc.part, profile: prof.profile, lengthMm: pc.lengthMm, qty: 1 });
        partsBy.set(pc.pos, m);
      }
    }
    for (const pc of prof.oversize) {
      const m = partsBy.get(pc.pos) ?? new Map<string, WorkPart>();
      const k = `${prof.profile}|${pc.part}|${pc.lengthMm}`;
      const cur = m.get(k);
      if (cur) cur.qty += 1; else m.set(k, { part: pc.part, profile: prof.profile, lengthMm: pc.lengthMm, qty: 1 });
      partsBy.set(pc.pos, m);
    }
  }

  const elements: WorkElement[] = [];
  for (const pos of cutting.positions) {
    if (isStubKey(pos.key)) continue; // stubovi su u zasebnoj tabeli
    const parts = [...(partsBy.get(pos.key)?.values() ?? []), ...(glassBy.get(pos.key) ?? [])]
      .sort((a, b) => a.profile.localeCompare(b.profile, 'sr') || (b.lengthMm ?? 0) - (a.lengthMm ?? 0));
    const facts: WorkFact[] = [];
    let color = '';
    let isGate = false;
    const idx = /^\d+$/.test(pos.key) ? indexOfNumber(project.items, Number(pos.key)) : -1;
    const it = idx >= 0 ? project.items[idx] : undefined;
    if (it && it.kind !== 'opening') {
      color = colorLabel(it.color, it.finish);
      isGate = it.kind === 'gate';
      const modelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
      const li = layout.items[idx];
      const geo = computeInfill(modelId, li.clearWidth, it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount, it.params.liftMm, undefined, it.params.archMm);
      facts.push(
        { label: 'Ukupna širina', value: `${Math.round(outerWidthMm(project, idx))} mm` },
        { label: 'Visina', value: `${Math.round(it.heightMm)} mm` },
        { label: 'Boja', value: colorLabel(it.color, it.finish) },
        { label: 'Profila ispune', value: String(geo.bars.filter((b) => b.tone === 'main').length) },
        ...(isStair(it) ? [{ label: 'Stepenište', value: stairGroupSummary(stairGroupAt(project.items, idx)!) }] : []),
      );
      if (it.kind === 'gate') {
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
    elements.push({ key: pos.key, label: pos.label, detail: pos.detail, color, parts, facts, isGate });
  }

  const posts: WorkPost[] = project.posts.flatMap((p, i) => (layout.posts[i]?.hidden ? [] : [{ p, i }])).map(({ p, i }) => {
    const n = project.items.length;
    const spacerRight = project.items[i]?.kind === 'opening' && Boolean((project.items[i] as { spacer?: boolean }).spacer);
    const spacerLeft = project.items[i - 1]?.kind === 'opening' && Boolean((project.items[i - 1] as { spacer?: boolean }).spacer);
    const where = i === 0 ? 'Početak (levo)' : i === n ? 'Kraj (desno)' : spacerRight ? `Stub ograde uz: ${itemLabel(project.items, i - 1)}` : spacerLeft ? `Svoj stub: ${itemLabel(project.items, i)}` : `Između: ${itemLabel(project.items, i - 1)} i ${itemLabel(project.items, i)}`;
    return {
      name: `S${i + 1}`, where, type: POST_LABELS[p.type], widthMm: p.widthMm, heightMm: layout.posts[i]?.lengthMm ?? p.heightMm, mounting: MOUNTING_LABELS[p.mounting], color: colorLabel(p.color, p.finish),
      plinthMm: p.type === 'concrete_plinth' ? p.plinthMm : undefined,
    };
  });

  // okovi i sitan materijal: ukupno za projekat (bez profila, stubova i rezerve u novcu)
  const SMALL_GROUPS = new Set(['Nosači i spojnice', 'Vijci', 'Šarke', 'Brave', 'Točkići', 'Automatika']);
  const small: WorkSmallItem[] = buildBom(project, materials, specs)
    .filter((l) => SMALL_GROUPS.has(l.group) && l.geometricQty > 0)
    .map((l) => ({ name: l.name, qty: l.unit === 'kom' || l.unit === 'set' ? Math.ceil(l.geometricQty - 1e-9) : Math.round(l.geometricQty * 100) / 100, unit: l.unit }));

  const gates = project.items.filter((i) => i.kind === 'gate').length;
  return {
    cutting,
    elements,
    posts,
    small,
    summary: { occupiedMm: layout.occupiedMm, elements: project.items.filter((i) => i.kind !== 'opening').length, gates, posts: layout.postCount, maxHeightMm: layout.maxHeightMm },
    positionOfItem: (index) => positionOfItem(cutting.positions, itemNumber(project.items, index) - 1),
  };
}
