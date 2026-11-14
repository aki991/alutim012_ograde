import { isRl10Post } from '../models/rl10';
import { buildRl10Sheet, isRl10Item } from './rl10Spec';
import { itemSlope } from '../geometry/stair';
import { gateLeafPoses, gateSpecWidth } from '../geometry/gates';
import { computeLayout, type LaidOutItem } from '../geometry/layout';
import type { FenceModelId, FenceSection, Gate, Material, PricingSettings, Project } from '../models/types';
import { CALC_RULES } from './rules';
import { evaluateSpec, hasCustomSpec, specFor, specVars, type ModelSpecs } from '../models/spec';
import { buildLouver08Sheet, FILL_PROFILES, GUIDE_PROFILES, isLouver08, louverSpecOf } from './louverSpec';
import { buildRail04Sheet, isRail04, RAIL04 } from './railSpec';
import { isTarabicaPost, tarabicaPostLines } from '../models/tarabica';
import { missingHardware, resolveGate, systemOf, unknownHwLabel, type HwRole } from '../gates/design';
import { gateCutRows } from '../gates/production';

const HW_GROUP: Record<HwRole, BomGroup> = {
  hinge_left: 'Šarke', hinge_right: 'Šarke', hinge: 'Šarke', lock: 'Brave', catch: 'Brave', drop_bolt: 'Brave', ground_stop: 'Nosači i spojnice', trolley: 'Točkići', carrier_kit: 'Točkići',
  guide: 'Nosači i spojnice', end_roller: 'Točkići', receiver: 'Nosači i spojnice', stopper: 'Nosači i spojnice', wheel: 'Točkići', rail: 'Nosači i spojnice', motor: 'Automatika', other: 'Nosači i spojnice',
};

/** stavke sastavnice iz mera kapije: profili (metri neto dužine) i okovi (komadi); deo bez veze sa cenovnikom nosi naziv radnika */
export function gateBomLines(g: Gate, clearWidthMm: number, materials: Material[]): { group: BomGroup; materialId: string; qty: number; label?: string }[] {
  const res = resolveGate(g, clearWidthMm);
  const out: { group: BomGroup; materialId: string; qty: number; label?: string }[] = [];
  for (const r of gateCutRows(g, res, materials)) {
    if (r.lengthMm === null) continue;
    const m = (r.qty * r.lengthMm) / 1000;
    out.push({ group: 'Ramovi', materialId: r.materialId ?? `gate-m:${r.profile}`, qty: m, label: r.materialId ? undefined : `${r.profile}${r.code ? ` (${r.code})` : ''} — kapija`.trim() });
  }
  for (const h of g.design?.hardware ?? []) {
    if (h.qty <= 0) continue;
    out.push({ group: HW_GROUP[h.role], materialId: h.materialId ?? `gate-hw:${h.name}`, qty: h.qty, label: h.materialId ? undefined : `${h.name}${h.code ? ` (${h.code})` : ' (bez fabričke šifre)'}` });
  }
  // okov koji radnik nije upisao: red sa nepoznatom oznakom (bez cene), da se vidi da uz kapiju ide
  for (const r of missingHardware(g, systemOf(g))) out.push({ group: HW_GROUP[r.role], materialId: `gate-unknown:${r.role}`, qty: r.qty, label: unknownHwLabel(r.role) });
  // isti materijal u istoj grupi (npr. stubovi rama oba krila) je jedan red
  const merged = new Map<string, (typeof out)[number]>();
  for (const l of out) {
    const k = `${l.group}|${l.materialId}`;
    const cur = merged.get(k);
    if (cur) cur.qty += l.qty; else merged.set(k, { ...l });
  }
  return [...merged.values()];
}

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

export const POST_MATERIAL = { aluminium: 'mat_post_alu', concrete: 'mat_post_concrete', concrete_plinth: 'mat_post_concrete', decorative: 'mat_post_decorative', gate: 'mat_post_gate' } as const;
export const HINGE_MATERIAL = { standard: 'mat_hinge_standard', hidden: 'mat_hinge_hidden', heavy: 'mat_hinge_heavy' } as const;
export const LOCK_MATERIAL = { standard: 'mat_lock_standard', cylinder: 'mat_lock_cylinder', electric: 'mat_lock_electric' } as const;
export const MOTOR_MATERIAL = { sliding_motor: 'mat_motor_sliding', swing_arm: 'mat_motor_swing', underground: 'mat_motor_underground' } as const;

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
  const add = (group: BomGroup, originalId: string, qty: number, label?: string) => {
    if (qty <= 0) return;
    // deo zamenjen u projektu („Delovi ograde“): umesto materijala iz specifikacije ide izabrani
    const materialId = project.partMaterials?.[originalId] ?? originalId;
    const k = `${group}|${materialId}`;
    const cur = acc.get(k);
    if (cur) cur.qty += qty;
    else acc.set(k, { group, materialId, qty, label });
  };

  for (const li of layout.items) {
    const it = li.item;
    if (it.kind === 'opening') continue;
    const modelId: FenceModelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
    // modeli 04 i 08 imaju detaljnu sastavnicu dok se njihova specifikacija ne izmeni
    if (isRail04(it) && !hasCustomSpec(modelId, specs)) continue;
    if (isLouver08(it) && !hasCustomSpec(modelId, specs)) continue;
    if (isRl10Item(it) && !hasCustomSpec(modelId, specs)) continue;
    // elementi specifikacije modela (podrazumevani ili izmenjeni): količine i dužine po formulama
    const vars = specVars({ modelId, slopeFactor: itemSlope(li).factor, widthMm: it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth, heightMm: it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double', leafWidthsMm: it.kind === 'gate' && it.gateType === 'double' ? gateLeafPoses(it, li.clearStart, li.clearEnd, 1).map((q) => q.widthMm) : undefined });
    for (const ev of evaluateSpec(specFor(modelId, specs), vars)) add(ev.part.group, ev.part.materialId, ev.materialQty);

    if (it.kind === 'gate' && it.design) {
      for (const l of gateBomLines(it, li.clearWidth, materials)) add(l.group, l.materialId, l.qty, l.label);
    } else if (it.kind === 'gate') {
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
  project.posts.forEach((p, i) => {
    if (railPosts.has(i) || layout.posts[i]?.hidden) return;
    // stub uz tarabicu: kvadratna cev 80 × 80 ili 100 × 100 po dužini stuba i izabrane kape iz kataloga
    if (isTarabicaPost(project.items, p, i)) { for (const l of tarabicaPostLines({ ...p, heightMm: layout.posts[i]?.lengthMm ?? p.heightMm })) add('Stubovi', l.materialId, l.qty); return; }
    // stubovi RL10 se obračunavaju u sastavnici modela (cev, lajsna, veza, stopa, sidra, nosači, završeci)
    if (isRl10Post(project.items, i) && !hasCustomSpec('rail_inox', specs)) return;
    // betonski stubovi se crtaju (na šta se kapija montira), ali ne ulaze u ponudu: aluminijumska radnja ih ne izvodi
    if (p.type === 'concrete' || p.type === 'concrete_plinth') return;
    add('Stubovi', POST_MATERIAL[p.type], 1);
  });
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
  {
    // RL10: rukohvat P-1033, prečke P-1146, stubovi P-1054 sa lajsnom, veze, stope, sidra, nosači, zglobovi i završeci
    const sheet = buildRl10Sheet(project, specs);
    if (sheet) {
      const q = sheet.quantities;
      const meters = (lens: number[]) => lens.reduce((x, v) => x + v, 0) / 1000;
      add('Profili ispune', 'mat_bts_p1033', meters([...q.railLens, ...q.cornerRailLens]));
      add('Profili ispune', 'mat_bts_p1146', meters([...q.rodLens, ...q.cornerRodLens]));
      add('Stubovi', 'mat_bts_p1054', meters(q.tubeLens));
      add('Stubovi', 'mat_bts_pal2647', meters(q.tubeLens));
      add('Stubovi', 'mat_bts_ak5036x', q.posts);
      add('Stubovi', 'mat_bts_ak5027k', q.posts * 3);
      add('Nosači i spojnice', 'mat_bts_ak5062', q.posts);
      add('Nosači i spojnice', 'mat_bts_ak5039n', q.saddlesFixed);
      add('Nosači i spojnice', 'mat_bts_ak5001', q.saddlesAdjustable);
      add('Nosači i spojnice', 'mat_bts_ak5011y', q.holders);
      add('Nosači i spojnice', 'mat_bts_ak5020k', q.jointsRail);
      add('Nosači i spojnice', 'mat_bts_ak5022y', q.jointsRod);
      add('Nosači i spojnice', 'mat_bts_ak5009', q.railCaps);
      add('Nosači i spojnice', 'mat_bts_ak5012a', q.rodCaps);
    }
  }
  // betonsko podnožje se crta (na šta se kapija montira), ali NE ulazi u ponudu: aluminijumska radnja ga ne izvodi

  const lines: BomLine[] = [];
  for (const a of acc.values()) {
    const mat = materials.find((x) => x.id === a.materialId);
    const line = toLine(a, mat, project.settings.pricing);
    // deo kapije bez veze sa cenovnikom (ručno zadat okov ili profil): naziv radnika, bez cene
    if (!mat && a.label) { line.name = a.label; line.unit = a.materialId.startsWith('gate-m:') ? 'm' : 'kom'; }
    lines.push(line);
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
