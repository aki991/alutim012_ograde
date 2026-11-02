import { computeInfill } from '../geometry/infill';
import { computeLayout } from '../geometry/layout';
import { FENCE_MODELS, GATE_LABELS } from '../models/catalog';
import type { Project } from '../models/types';
import { itemLabel } from '../../utils/labels';
import { Material } from '../models/types';
import { evaluateSpec, hasCustomSpec, materialName, specFor, specVars, type ModelSpecs } from '../models/spec';
import { isLouver08 } from './louverSpec';
import { isRail04 } from './railSpec';

export interface CutRow {
  element: string;
  part: string;
  profile: string;
  lengthMm: number;
  qty: number;
  note?: string;
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
    if ((isRail04(it) || isLouver08(it)) && !hasCustomSpec(modelId, specs)) continue;
    const vars = specVars({ modelId, widthMm: li.clearWidth, heightMm: it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double' });
    const geo = computeInfill(modelId, li.clearWidth, it.heightMm, it.params.frameMm, it.params.barSizeMm, it.params.gapMm, it.params.barCount);
    if (geo.glass) {
      rows.push({ element: name, part: 'Staklo', profile: FENCE_MODELS[modelId].parts.main, lengthMm: Math.round(geo.glass.w), qty: 1, note: `${Math.round(geo.glass.w)} × ${Math.round(geo.glass.h)} mm` });
    }
    const group = new Map<string, CutRow>();
    for (const ev of evaluateSpec(specFor(modelId, specs), vars)) {
      if (ev.lengthMm === null) continue; // delovi bez dužine reza (vijci, nosači) nisu u krojnoj listi
      const len = Math.round(ev.lengthMm);
      const qty = Math.round(ev.qty);
      if (qty <= 0 || len <= 0) continue;
      const profile = materials ? materialName(materials, ev.part.materialId) : ev.part.name;
      const key = `${ev.part.name}|${len}`;
      const cur = group.get(key);
      if (cur) cur.qty += qty;
      else group.set(key, { element: name, part: ev.part.name, profile, lengthMm: len, qty, note: ev.part.note });
    }
    rows.push(...group.values());
  }
  return rows;
}

export interface HardwareRow { element: string; item: string; qty: number }

export function buildHardwareList(project: Project): HardwareRow[] {
  const rows: HardwareRow[] = [];
  project.items.forEach((it, i) => {
    if (it.kind !== 'gate') return;
    const el = itemLabel(project.items, i);
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
  return `${GATE_LABELS[it.gateType]} — ${FENCE_MODELS[it.infillModelId].name}`;
}
