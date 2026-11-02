import { computeLayout, type LaidOutItem } from '../geometry/layout';
import type { FenceModelId, FenceSection, Gate, Material, PricingSettings, Project } from '../models/types';
import { CALC_RULES } from './rules';
import { evaluateSpec, hasCustomSpec, specFor, specVars, type ModelSpecs } from '../models/spec';
import { buildLouver08Sheet, FILL_PROFILES, GUIDE_PROFILES, isLouver08, louverSpecOf } from './louverSpec';
import { buildRail04Sheet, isRail04, RAIL04 } from './railSpec';

/* ---------- Osnovne geometrijske funkcije ---------- */

export { countHorizontalBars, countVerticalBars } from '../geometry/infill';

/** Ukupna geometrijska dužina profila u mm (bez otpada). */
export const profileLengthMm = (count: number, lengthMm: number): number => count * lengthMm;

/** Broj stubova koje dele dva susedna elementa (svaki fizički stub se računa jednom). */
export function sharedPostCount(elementCount: number): number {
  return Math.max(0, elementCount - 1);
}

export interface InnerArea { widthMm: number; heightMm: number }

export function innerArea(li: LaidOutItem, heightMm: number, frameMm: number): InnerArea {
  return { widthMm: Math.max(0, li.clearWidth - 2 * frameMm), heightMm: Math.max(0, heightMm - 2 * frameMm) };
}

const POST_MATERIAL = { aluminium: 'mat_post_alu', concrete: 'mat_post_concrete', concrete_plinth: 'mat_post_concrete', decorative: 'mat_post_decorative', gate: 'mat_post_gate' } as const;
const HINGE_MATERIAL = { standard: 'mat_hinge_standard', hidden: 'mat_hinge_hidden', heavy: 'mat_hinge_heavy' } as const;
const LOCK_MATERIAL = { standard: 'mat_lock_standard', cylinder: 'mat_lock_cylinder', electric: 'mat_lock_electric' } as const;
const MOTOR_MATERIAL = { sliding_motor: 'mat_motor_sliding', swing_arm: 'mat_motor_swing', underground: 'mat_motor_underground' } as const;

/* ---------- Spisak materijala (BOM) ---------- */

export type BomGroup = 'Profili ispune' | 'Ramovi' | 'Stubovi' | 'Nosači i spojnice' | 'Vijci' | 'Šarke' | 'Brave' | 'Točkići' | 'Automatika' | 'Dodatni materijal';

export interface BomLine {
  key: string;
  group: BomGroup;
  materialId: string;
  sku: string;
  name: string;
  unit: Material['unit'];
  /** Geometrijska količina (iz crteža), bez otpada */
  geometricQty: number;
  /** Nabavna količina (sa otpadom/zaokruživanjem) */
  purchaseQty: number;
  unitPriceNet: number;
  total: number;
  missingPrice: boolean;
}

export const netUnitPrice = (price: number, pricing: PricingSettings): number =>
  pricing.pricesIncludeVat ? price / (1 + pricing.vatPercent / 100) : price;

interface Acc { group: BomGroup; materialId: string; qty: number; label?: string }

export function buildBom(project: Project, materials: Material[], specs?: ModelSpecs): BomLine[] {
  const layout = computeLayout(project);
  const acc = new Map<string, Acc>();
  const add = (group: BomGroup, materialId: string, qty: number) => {
    if (qty <= 0) return;
    const k = `${group}|${materialId}`;
    const cur = acc.get(k);
    if (cur) cur.qty += qty;
    else acc.set(k, { group, materialId, qty });
  };

  for (const li of layout.items) {
    const it = li.item;
    if (it.kind === 'opening') continue;
    const modelId: FenceModelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
    // modeli 04 i 08 imaju detaljnu sastavnicu dok se njihova specifikacija ne izmeni
    if (isRail04(it) && !hasCustomSpec(modelId, specs)) continue;
    if (isLouver08(it) && !hasCustomSpec(modelId, specs)) continue;
    // elementi specifikacije modela (podrazumevani ili izmenjeni): količine i dužine po formulama
    const vars = specVars({ modelId, widthMm: li.clearWidth, heightMm: it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double' });
    for (const ev of evaluateSpec(specFor(modelId, specs), vars)) add(ev.part.group, ev.part.materialId, ev.materialQty);

    if (it.kind === 'gate') {
      const hinges = CALC_RULES.hingesPerGate[it.gateType] ?? 0;
      add('Šarke', HINGE_MATERIAL[it.hinge], hinges);
      if (it.gateType !== 'sliding' || it.lock !== 'standard') add('Brave', LOCK_MATERIAL[it.lock], 1);
      else add('Brave', LOCK_MATERIAL.standard, 1);
      if (it.gateType === 'sliding') add('Točkići', 'mat_wheel', CALC_RULES.wheelsPerSlidingGate);
      if (it.automation) add('Automatika', MOTOR_MATERIAL[it.automationType], 1);
    }
  }
  {
    // model 08: bočne U vođice i horizontalne letvice po radnoj specifikaciji
    const lv = buildLouver08Sheet(project, specs);
    if (lv) {
      const sp = louverSpecOf(project);
      const meters = (lens: number[]) => lens.reduce((x, v) => x + v, 0) / 1000;
      // osnovica „po šipki": kupuju se cele šipke (metraža = broj šipki × dužina šipke)
      const guideM = sp.priceBasis === 'per_bar' ? (lv.quantities.guideBars * RAIL04.stockMm) / 1000 : meters(lv.quantities.guideLens);
      const fillM = sp.priceBasis === 'per_bar' ? (lv.quantities.fillBars * RAIL04.stockMm) / 1000 : meters(lv.quantities.fillLens);
      add('Profili ispune', GUIDE_PROFILES[sp.guideProfile].materialId, guideM);
      add('Profili ispune', FILL_PROFILES[sp.fillProfile].materialId, fillM);
    }
  }
  const railPosts = new Set(hasCustomSpec('rail_black', specs) ? [] : project.posts.map((_, i) => i).filter((i) => [project.items[i - 1], project.items[i]].some((x) => x && isRail04(x))));
  project.posts.forEach((p, i) => { if (!railPosts.has(i)) add('Stubovi', POST_MATERIAL[p.type], 1); });
  {
    // model 04: srebrni stubovi Ø40, rukohvat Ø50, prečke Ø16 u prolaznim nosačima (planerska izvedba, neprekinuti komadi po nizu)
    const sheet = buildRail04Sheet(project, specs);
    if (sheet) {
      const q = sheet.quantities;
      const meters = (lens: number[]) => lens.reduce((x, v) => x + v, 0) / 1000;
      add('Profili ispune', 'mat_pega_04', meters(q.railLens));
      add('Profili ispune', 'mat_pega_2275_1', meters(q.rodLens));
      add('Nosači i spojnice', 'mat_pega_eco_11', q.railSupports);
      add('Nosači i spojnice', 'mat_pega_eco_12', q.railSupports);
      add('Nosači i spojnice', 'mat_pega_eco_97', q.rodSupports);
      add('Nosači i spojnice', 'mat_pega_97_8', q.rodSupports);
      add('Nosači i spojnice', 'mat_pega_eco_46', q.railEnds);
      add('Nosači i spojnice', 'mat_pega_sks_51_2', q.rodEnds);
      add('Vijci', 'mat_screw', q.railSupports + q.rodSupports);
      add('Nosači i spojnice', 'mat_pipe_bend', q.bends);
      add('Stubovi', 'mat_pega_06', meters(q.stubLens));
      add('Stubovi', 'mat_pega_eco_10', q.stubLens.length);
      add('Stubovi', 'mat_pega_09', meters(q.lajsnaLens));
      add('Stubovi', 'mat_anchor', q.stubLens.length);
    }
  }
  for (const li of layout.items) add('Stubovi', 'mat_concrete_plinth', (li.clearWidth * li.plinthMm) / 1_000_000);

  const lines: BomLine[] = [];
  for (const a of acc.values()) {
    const mat = materials.find((x) => x.id === a.materialId);
    lines.push(toLine(a, mat, project.settings.pricing));
  }
  const materialSum = lines.reduce((s, l) => s + l.total, 0);
  if (materialSum > 0 && CALC_RULES.extraMaterialPercent > 0) {
    const extra = (materialSum * CALC_RULES.extraMaterialPercent) / 100;
    lines.push({ key: 'extra', group: 'Dodatni materijal', materialId: 'extra', sku: 'DEMO-DM', name: `Dodatni sitni materijal (${CALC_RULES.extraMaterialPercent}% od materijala)`, unit: 'set', geometricQty: 1, purchaseQty: 1, unitPriceNet: extra, total: extra, missingPrice: false });
  }
  const order: BomGroup[] = ['Profili ispune', 'Ramovi', 'Stubovi', 'Nosači i spojnice', 'Vijci', 'Šarke', 'Brave', 'Točkići', 'Automatika', 'Dodatni materijal'];
  return lines.sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group));
}

function toLine(a: Acc, mat: Material | undefined, pricing: PricingSettings): BomLine {
  const waste = mat?.wastePercent ?? 0;
  const continuous = mat?.unit === 'm' || mat?.unit === 'm2' || mat?.unit === 'kg';
  const purchaseQty = continuous ? a.qty * (1 + waste / 100) : Math.ceil(a.qty);
  const unitPriceNet = mat ? netUnitPrice(mat.unitPrice, pricing) : 0;
  return {
    key: `${a.group}|${a.materialId}`,
    group: a.group,
    materialId: a.materialId,
    sku: mat?.sku ?? '—',
    name: mat?.name ?? `Nepoznat materijal (${a.materialId})`,
    unit: mat?.unit ?? 'kom',
    geometricQty: a.qty,
    purchaseQty,
    unitPriceNet,
    total: purchaseQty * unitPriceNet,
    missingPrice: !mat,
  };
}

/* ---------- Cena ---------- */

export interface PriceRow { label: string; base: string; amount: number; emphasis?: boolean }

export interface PriceBreakdown {
  materialTotal: number;
  laborTotal: number;
  installTotal: number;
  costBase: number;
  profitAmount: number;
  sellNet: number;
  discountAmount: number;
  netAfterDiscount: number;
  vatAmount: number;
  grossTotal: number;
  rows: PriceRow[];
  fenceAreaM2: number;
  runningMeters: number;
  gateCount: number;
}

export function materialTotal(bom: BomLine[]): number {
  return bom.reduce((s, l) => s + l.total, 0);
}

export function laborCost(project: Project): { total: number; areaM2: number; gates: number } {
  const p = project.settings.pricing;
  const layout = computeLayout(project);
  let areaM2 = 0;
  let gates = 0;
  for (const li of layout.items) {
    if (li.item.kind === 'fence') areaM2 += (li.clearWidth * li.item.heightMm) / 1_000_000;
    else if (li.item.kind === 'gate') gates += 1;
  }
  return { total: areaM2 * p.laborPerM2Rsd + gates * p.laborPerGateRsd, areaM2, gates };
}

export function installCost(project: Project): { total: number; meters: number; gates: number } {
  const p = project.settings.pricing;
  const layout = computeLayout(project);
  const gates = project.items.filter((i) => i.kind === 'gate').length;
  const meters = layout.totalModularMm / 1000;
  return { total: meters * p.installPerMeterRsd + gates * p.installPerGateRsd, meters, gates };
}

/** Prodajna osnovica iz troška: marža = udeo u prodajnoj ceni; uvećanje = procenat na nabavnu osnovicu. */
export function sellingPrice(cost: number, pricing: Pick<PricingSettings, 'profitMode' | 'profitPercent'>): number {
  const pct = pricing.profitPercent;
  if (pricing.profitMode === 'margin') {
    const m = Math.min(pct, 99.9);
    return cost / (1 - m / 100);
  }
  return cost * (1 + pct / 100);
}

export function computePrice(project: Project, materials: Material[], specs?: ModelSpecs): PriceBreakdown {
  const pricing = project.settings.pricing;
  const bom = buildBom(project, materials, specs);
  const mat = materialTotal(bom);
  const labor = laborCost(project);
  const inst = installCost(project);
  const costBase = mat + labor.total + inst.total;
  const sellNet = sellingPrice(costBase, pricing);
  const profitAmount = sellNet - costBase;
  const discountAmount = (sellNet * pricing.discountPercent) / 100;
  const netAfterDiscount = sellNet - discountAmount;
  const vatAmount = (netAfterDiscount * pricing.vatPercent) / 100;
  const grossTotal = netAfterDiscount + vatAmount;
  const profitLabel = pricing.profitMode === 'margin' ? `Marža ${pricing.profitPercent}%` : `Uvećanje ${pricing.profitPercent}%`;
  const profitBase = pricing.profitMode === 'margin' ? 'udeo u prodajnoj ceni (trošak / (1 − marža))' : 'na nabavnu osnovicu (materijal + rad + montaža)';
  const rows: PriceRow[] = [
    { label: 'Materijal', base: pricing.pricesIncludeVat ? 'neto (iz bruto cena bez PDV-a)' : 'neto, sa otpadom', amount: mat },
    { label: 'Rad (izrada)', base: `${labor.areaM2.toFixed(2)} m² ograde + ${labor.gates} kapija`, amount: labor.total },
    { label: 'Montaža', base: `${inst.meters.toFixed(2)} m trase + ${inst.gates} kapija`, amount: inst.total },
    { label: 'Osnovica troška', base: 'materijal + rad + montaža', amount: costBase, emphasis: true },
    { label: profitLabel, base: profitBase, amount: profitAmount },
    { label: 'Prodajna cena (neto)', base: 'trošak + zarada', amount: sellNet, emphasis: true },
    { label: `Popust ${pricing.discountPercent}%`, base: 'na prodajnu cenu (neto)', amount: -discountAmount },
    { label: 'Osnovica za PDV', base: 'prodajna cena umanjena za popust', amount: netAfterDiscount, emphasis: true },
    { label: `PDV ${pricing.vatPercent}%`, base: 'na osnovicu za PDV', amount: vatAmount },
    { label: 'Ukupno sa PDV-om', base: '', amount: grossTotal, emphasis: true },
  ];
  return {
    materialTotal: mat, laborTotal: labor.total, installTotal: inst.total, costBase, profitAmount, sellNet,
    discountAmount, netAfterDiscount, vatAmount, grossTotal, rows,
    fenceAreaM2: labor.areaM2, runningMeters: inst.meters, gateCount: inst.gates,
  };
}

export const isFence = (i: unknown): i is FenceSection => (i as FenceSection)?.kind === 'fence';
export const isGate = (i: unknown): i is Gate => (i as Gate)?.kind === 'gate';
