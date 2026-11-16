import { hasAngledEnds } from './cutEnds';
import { isRl10Item } from './rl10Spec';
import { itemSlope } from '../geometry/stair';
import { gateLeafPoses, gateSpecWidth } from '../geometry/gates';
import { computeInfill } from '../geometry/infill';
import { computeLayout } from '../geometry/layout';
import { FENCE_MODELS, GATE_LABELS } from '../models/catalog';
import type { Project } from '../models/types';
import { itemLabel } from '../../utils/labels';
import { Material } from '../models/types';
import { evaluateSpec, hasCustomSpec, materialName, slatCutLengths, specFor, specVars, type ModelSpecs } from '../models/spec';
import { isLouver08 } from './louverSpec';
import { isRail04 } from './railSpec';
import { HW_ROLE_LABELS, missingHardware, resolveGate, systemOf, unknownHwLabel } from '../gates/design';
import { gateCutRows } from '../gates/production';
import { resolveSliding, slidingBom, variantTitle } from '../gates/slidingAssembly';
import { leafHeightOf, slidingH } from '../gates/slidingLayout';

export interface CutRow {
  element: string;
  /** redni broj elementa u projektu (od 0) */
  index: number;
  /** staklo/ispuna: nije šipkasti profil, pa ne ulazi u krojnu listu šipki */
  glass?: boolean;
  part: string;
  profile: string;
  lengthMm: number;
  qty: number;
  note?: string;
  /** deo rama: seče se pod 45° na oba kraja (dužina je spoljna mera) */
  miter?: boolean;
  /** uglovi sečenja oba kraja (90° = ravan rez; dva ugla = zasek V); samo komadi koji se seku pod uglom (npr. ojačanja repa) */
  ends?: [number[], number[]];
  /** oblik krajeva za crtež šipke (vidi TailMember.endShape) */
  endShape?: [[number, number][], [number, number][]];
  /** širina profila u ravni reza (mm): za deljenje kosog reza (štednja materijala) */
  faceMm?: number;
}

/**
 * OKVIRNA GEOMETRIJSKA specifikacija delova — nije optimizacija sečenja ni finalna proizvodna dokumentacija.
 * Kasnije se može proširiti optimizacijom sečenja standardnih šipki.
 */
export function buildCutList(project: Project, specs?: ModelSpecs, materials?: Material[]): CutRow[] {
  const layout = computeLayout(project);
  const rows: CutRow[] = [];
  for (const li of layout.items) {
    const it = li.item;
    if (it.kind === 'opening') continue;
    const name = itemLabel(project.items, li.index);
    const modelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
    // modeli 04 i 08 imaju zasebnu krojnu listu dok se njihova specifikacija ne izmeni
    if ((isRail04(it) || isLouver08(it) || isRl10Item(it)) && !hasCustomSpec(modelId, specs)) continue;
    // klizna kapija kao sklop: u krojnu listu idu samo komadi sa poznatom krojnom merom (upisanom ili ravnim rezom šine/C-profila);
    // komad čija mera zavisi od spoja čeka potvrdu u panelu kapije
    if (it.kind === 'gate' && it.sliding) {
      for (const b of slidingBom(resolveSliding(it.sliding, li.clearWidth, slidingH(it)))) {
        if (b.cutMm === null || b.cutMm <= 0 || b.unit !== 'kom') continue;
        if (b.make !== 'izrada' && b.key !== 'rail' && b.key !== 'carrier') continue;
        const mat = b.materialId ? materials?.find((m) => m.id === b.materialId) : undefined;
        rows.push({ element: name, index: li.index, part: b.name, profile: mat ? mat.name : b.materialText ? b.materialText : `${b.name} — nije definisano`, lengthMm: b.cutMm, qty: b.qty, ...(b.ends && hasAngledEnds(b.ends) ? { ends: b.ends, ...(b.endShape ? { endShape: b.endShape } : {}), ...(b.faceMm ? { faceMm: b.faceMm } : {}) } : {}), note: [b.note, b.shownMm !== null && b.shownMm !== b.cutMm ? `prikazano ${b.shownMm} mm` : ''].filter(Boolean).join(' · ') || undefined });
      }
      if (!it.sliding.drawnLeaf) continue;
    }
    const slope = itemSlope(li);
    const stairNote = slope.factor > 1 ? `stepenište: krajevi pod uglom ${Math.round(slope.deg)}°` : '';
    const vars = specVars({ modelId, slopeFactor: slope.factor, widthMm: it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth, heightMm: it.kind === 'gate' ? leafHeightOf(it) : it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double', leafWidthsMm: it.kind === 'gate' && it.gateType === 'double' ? gateLeafPoses(it, li.clearStart, li.clearEnd, 1).map((q) => q.widthMm) : undefined });
    const geo = computeInfill(modelId, it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth, it.kind === 'gate' ? leafHeightOf(it) : it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount, it.params.liftMm, undefined, it.params.archMm);
    if (geo.glass) {
      rows.push({ element: name, index: li.index, glass: true, part: 'Staklo', profile: FENCE_MODELS[modelId].parts.main, lengthMm: Math.round(geo.glass.w), qty: 1, note: slope.factor > 1 ? `paralelogram: ${Math.round(geo.glass.w)} mm horizontalno × ${Math.round(geo.glass.h)} mm vertikalno, nagib ${Math.round(slope.deg)}°` : `${Math.round(geo.glass.w)} × ${Math.round(geo.glass.h)} mm` });
    }
    const group = new Map<string, CutRow>();
    const slats = slatCutLengths({ modelId, slopeFactor: slope.factor, widthMm: it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth, heightMm: it.kind === 'gate' ? leafHeightOf(it) : it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double', leafWidthsMm: it.kind === 'gate' && it.gateType === 'double' ? gateLeafPoses(it, li.clearStart, li.clearEnd, 1).map((q) => q.widthMm) : undefined });
    if (it.kind === 'gate' && it.design && !it.sliding) {
      // mere kapije: ram krila, noseći profil, rep, šina — red koji još nema meru ostaje u prozoru „Mere kapije“ (ne ide u plan rezanja)
      for (const r of gateCutRows(it, resolveGate(it, li.clearWidth), materials ?? [])) {
        if (r.lengthMm === null || r.lengthMm <= 0) continue;
        const diff = r.manual && r.geometricMm !== null ? Math.round(r.lengthMm - r.geometricMm) : 0;
        rows.push({
          element: name, index: li.index, part: `${r.assembly} — ${r.part}`, profile: r.profile, lengthMm: Math.round(r.lengthMm), qty: r.qty, miter: r.miter,
          note: [r.ends, r.ref, r.manual ? `ručna rezna mera${diff ? ` (geometrijski ${Math.round(r.geometricMm!)} mm, razlika ${diff > 0 ? '+' : ''}${diff} mm)` : ''}` : ''].filter(Boolean).join(' · '),
        });
      }
    }
    for (const ev of evaluateSpec(specFor(modelId, specs), vars)) {
      if (ev.lengthMm === null) continue;
      const len = Math.round(ev.lengthMm);
      const qty = Math.round(ev.qty);
      if (qty <= 0 || len <= 0) continue;
      const profile = materials ? materialName(materials, project.partMaterials?.[ev.part.materialId] ?? ev.part.materialId) : ev.part.name;
      // deo rama sa jednim ugaonim krajem (ram nije oko cele ograde): 45° samo na tom kraju, drugi je ravan
      const mEnds = ev.part.miterEnds;
      const partial = ev.part.group === 'Ramovi' && !!mEnds && !(mEnds[0] && mEnds[1]);
      const miter = (ev.part.group === 'Ramovi' && !partial) || undefined;
      // deo nacrtanog modela nosi naziv svoje uloge (npr. „Ram — gornja i donja prečka“), da se zna koji je koji deo
      const partName = ev.part.role ?? ev.part.name;
      const faceMm = miter || (partial && (mEnds![0] || mEnds![1])) ? ev.part.miterMm : undefined;
      const cutEnds: Pick<CutRow, 'ends' | 'endShape'> | null = partial && (mEnds![0] || mEnds![1])
        ? { ends: [[mEnds![0] ? 45 : 90], [mEnds![1] ? 45 : 90]], endShape: [mEnds![0] ? [[0, 0], [1, 1]] : [[0, 0], [0, 1]], mEnds![1] ? [[0, 0], [1, 1]] : [[0, 0], [0, 1]]] }
        : null;
      // tarabice sa lukom: svaka grupa iste dužine je poseban red krojne liste
      if (slats && ev.part.lengthMm === 'MAINLEN-CAPH') {
        const byLen = new Map<number, number>();
        for (const l of slats) byLen.set(Math.round(l), (byLen.get(Math.round(l)) ?? 0) + 1);
        for (const [l, n] of [...byLen].sort((a, b) => b[0] - a[0])) {
          if (l <= 0) continue;
          group.set(`${partName}|${l}`, { element: name, index: li.index, part: partName, profile, lengthMm: l, qty: n, note: [ev.part.note, 'luk: tarabice različitih dužina', stairNote].filter(Boolean).join(' · ') });
        }
        continue;
      }
      const key = `${partName}|${len}`;
      const cur = group.get(key);
      if (cur) cur.qty += qty;
      else group.set(key, { element: name, index: li.index, part: partName, profile, lengthMm: len, qty, miter, ...(cutEnds ?? {}), ...(faceMm ? { faceMm } : {}), note: [ev.part.note, miter && !/45/.test(ev.part.note ?? '') ? 'rez 45° na oba kraja' : '', stairNote].filter(Boolean).join(' · ') || undefined });
    }
    rows.push(...group.values());
  }
  return rows;
}

export interface HardwareRow { element: string; item: string; qty: number }

export function buildHardwareList(project: Project, materials?: Material[]): HardwareRow[] {
  const layout = computeLayout(project);
  const rows: HardwareRow[] = [];
  project.items.forEach((it, i) => {
    if (it.kind !== 'gate') return;
    const el = itemLabel(project.items, i);
    if (it.sliding) {
      // kupljeni delovi kliznog sklopa; delovi kompleta motora se ne ponavljaju, nepotvrđeni nose oznaku
      for (const b of slidingBom(resolveSliding(it.sliding, layout.items[i].clearWidth, slidingH(it)))) {
        if (b.make !== 'kupovina' || b.kit || b.key === 'rail' || b.key === 'carrier') continue;
        const mat = b.materialId ? materials?.find((m) => m.id === b.materialId) : undefined;
        rows.push({ element: el, item: mat ? `${b.name}: ${mat.name}${b.confirm ? ' (potvrditi)' : ''}` : b.materialText ? `${b.name}: ${b.materialText}${b.confirm ? ' (potvrditi)' : ''}` : `${b.name} — nije definisano${b.confirm ? ' (potvrditi)' : ''}`, qty: b.unit === 'par' ? b.qty * 2 : b.qty });
      }
      return;
    }
    if (it.design) {
      for (const h of it.design.hardware.filter((x) => x.name.trim())) rows.push({ element: el, item: `${HW_ROLE_LABELS[h.role]}: ${h.name}${h.code ? ` (${h.code})` : ''}`, qty: h.qty });
      // okov koji radnik nije upisao: nepoznata oznaka, sa količinom koja uz kapiju ide
      for (const r of missingHardware(it, systemOf(it))) rows.push({ element: el, item: unknownHwLabel(r.role), qty: r.qty });
      return;
    }
    const hinges = { pedestrian: 2, single: 2, double: 4, sliding: 0 }[it.gateType];
    if (hinges) rows.push({ element: el, item: `Šarke (${it.hinge})`, qty: hinges });
    rows.push({ element: el, item: `Brava (${it.lock})`, qty: 1 });
    if (it.gateType === 'sliding') rows.push({ element: el, item: 'Točkići', qty: 2 });
    if (it.automation) rows.push({ element: el, item: `Automatika (${it.automationType})`, qty: 1 });
  });
  return rows;
}

export function describeItem(project: Project, index: number): string {
  const it = project.items[index];
  if (it.kind === 'opening') return it.bendDeg !== undefined ? `Ugaoni spoj ${Math.abs(it.bendDeg)}° (savijene prečke)` : 'Prazan otvor';
  if (it.kind === 'fence') return FENCE_MODELS[it.modelId].name;
  if (it.sliding) return `${GATE_LABELS[it.gateType]} — ${variantTitle(it.sliding)}`;
  return `${GATE_LABELS[it.gateType]} — ${FENCE_MODELS[it.infillModelId].name}`;
}
