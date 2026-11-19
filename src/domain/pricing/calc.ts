import { isRl10Post } from '../models/rl10';
import { postMaterialLine } from '../models/postTemplates';
import { buildRl10Sheet, isRl10Item } from './rl10Spec';
import { itemSlope } from '../geometry/stair';
import { gateLeafPoses, gateSpecWidth } from '../geometry/gates';
import { computeLayout, type LaidOutItem } from '../geometry/layout';
import type { FenceModelId, FenceSection, Gate, Material, PricingSettings, Project } from '../models/types';
import { CALC_RULES } from './rules';
import { evaluateItemParts, hasCustomSpec, type ModelSpecs, type SpecContext } from '../models/spec';
import { buildLouver08Sheet, FILL_PROFILES, GUIDE_PROFILES, isLouver08, louverSpecOf } from './louverSpec';
import { buildRail04Sheet, isRail04, RAIL04 } from './railSpec';
import { gateHingeQty } from '../gates/hingeRule';
import { missingHardware, resolveGate, systemOf, unknownHwLabel, type HwRole } from '../gates/design';
import { gateCutRows } from '../gates/production';
import { resolveSliding, slidingBom, type SlidingBomItem } from '../gates/slidingAssembly';
import { leafHeightOf, slidingH } from '../gates/slidingLayout';
import { measureFinishing, finishingArea, type FinishingSummary } from './finishing';
import { isProductionPost, isSimulationMaterial } from '../models/productionPosts';

const HW_GROUP: Record<HwRole, BomGroup> = {
  hinge_left: 'Šarke', hinge_right: 'Šarke', hinge: 'Šarke', lock: 'Brave', catch: 'Brave', drop_bolt: 'Brave', ground_stop: 'Nosači i spojnice', trolley: 'Točkići', carrier_kit: 'Točkići',
  guide: 'Nosači i spojnice', end_roller: 'Točkići', receiver: 'Nosači i spojnice', stopper: 'Nosači i spojnice', wheel: 'Točkići', rail: 'Nosači i spojnice', motor: 'Automatika', other: 'Nosači i spojnice',
};

const SLIDING_GROUP: Record<SlidingBomItem['group'], BomGroup> = { 'Ram i ispuna': 'Ramovi', 'Oslonac i vođenje': 'Točkići', Okov: 'Brave', 'Pogon i automatika': 'Automatika', 'Pričvršćenje': 'Vijci' };

/**
 * Stavke klizne kapije (sklop) za sastavnicu projekta. Stavka sa izabranim materijalom ide pod tim materijalom (cena iz cenovnika):
 * profili u metrima, kupljeni delovi u komadima. Stavka bez izabranog materijala ima oznaku „nije definisano“. Delovi kompleta motora
 * (krajnji prekidači i sl.) se ne ponavljaju osim ako im je materijal izabran; stavke koje čekaju potvrdu nose oznaku „potvrditi“.
 */
export function slidingBomLines(g: Gate, clearWidthMm: number, materials: Material[] = []): { group: BomGroup; materialId: string; qty: number; label?: string; unit: Material['unit'] }[] {
  if (!g.sliding) return [];
  const res = resolveSliding(g.sliding, clearWidthMm, slidingH(g));
  const out: { group: BomGroup; materialId: string; qty: number; label?: string; unit: Material['unit'] }[] = [];
  for (const b of slidingBom(res)) {
    const mat = b.materialId ? materials.find((m) => m.id === b.materialId) : undefined;
    if (b.kit && !mat && !b.materialText) continue;
    const group = SLIDING_GROUP[b.group];
    const meters = b.totalM !== null && (b.make === 'izrada' || b.key === 'rail' || b.key === 'carrier');
    if (mat) {
      const inMeters = (mat.unit === 'm' || mat.unit === 'm2') && b.totalM !== null;
      out.push({ group, materialId: mat.id, qty: inMeters ? b.totalM! : b.unit === 'par' ? b.qty * 2 : b.qty, unit: mat.unit });
      continue;
    }
    // ručno upisan naziv (npr. „C profil 60×60×2“) ide u listu umesto „nije definisano“; nije u cenovniku, pa je bez cene
    const label = b.materialText ? `${b.materialText} — ${b.name} (klizna kapija, nije u cenovniku)${b.confirm ? ' (potvrditi)' : ''}` : `${b.name} (klizna kapija) — nije definisano${b.confirm ? ' (potvrditi)' : ''}`;
    out.push(meters
      ? { group, materialId: `gate-m:sliding:${g.id}:${b.key}`, qty: b.totalM!, label, unit: 'm' }
      : { group, materialId: `gate-hw:sliding:${g.id}:${b.key}`, qty: b.unit === 'par' ? b.qty * 2 : b.qty, label, unit: 'kom' });
  }
  return out;
}

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
  for (const r of missingHardware(g, systemOf(g), gateHingeQty(g, clearWidthMm))) out.push({ group: HW_GROUP[r.role], materialId: `gate-unknown:${r.role}`, qty: r.qty, label: unknownHwLabel(r.role) });
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

interface Acc { group: BomGroup; materialId: string; qty: number; label?: string; unit?: Material['unit'] }

export function buildBom(project: Project, materials: Material[], specs?: ModelSpecs, physical?: { netLengths?: boolean; includePosts?: boolean }): BomLine[] {
  const layout = computeLayout(project);
  const acc = new Map<string, Acc>();
  const add = (group: BomGroup, originalId: string, qty: number, label?: string, unit?: Material['unit']) => {
    if (qty <= 0) return;
    if (physical?.includePosts === false && group === 'Stubovi') return;
    // deo zamenjen u projektu („Delovi ograde“): umesto materijala iz specifikacije ide izabrani
    const materialId = project.partMaterials?.[originalId] ?? originalId;
    if (isSimulationMaterial(materials.find((m) => m.id === materialId))) return;
    if (materialId === 'mat_post_concrete' || materialId === 'mat_concrete_plinth') return;
    const k = `${group}|${materialId}`;
    const cur = acc.get(k);
    if (cur) cur.qty += qty;
    else acc.set(k, { group, materialId, qty, label, unit });
  };

  for (const li of layout.items) {
    const it = li.item;
    if (it.kind === 'opening') continue;
    const modelId: FenceModelId = it.kind === 'fence' ? it.modelId : it.infillModelId;
    // modeli 04 i 08 imaju detaljnu sastavnicu dok se njihova specifikacija ne izmeni
    if (isRail04(it) && !hasCustomSpec(modelId, specs)) continue;
    if (isLouver08(it) && !hasCustomSpec(modelId, specs)) continue;
    if (isRl10Item(it) && !hasCustomSpec(modelId, specs)) continue;
    // klizna kapija kao sklop: sve stavke iz njenog crteža (bez specifikacije modela i starih paušalnih stavki kapije)
    // krilo iz modela (nacrtano ili model ograde) ide po specifikaciji modela, kao kod ostalih kapija; klizni okov iz sklopa
    if (it.kind === 'gate' && it.sliding) { for (const l of slidingBomLines(it, li.clearWidth, materials)) add(l.group, l.materialId, l.qty, l.label, l.unit); if (!it.sliding.drawnLeaf) continue; }
    // elementi specifikacije modela (podrazumevani ili izmenjeni): količine i dužine po formulama
    const specCtx: SpecContext = ({ modelId, slopeFactor: itemSlope(li).factor, widthMm: it.kind === 'gate' ? gateSpecWidth(it, li.clearWidth) : li.clearWidth, heightMm: it.kind === 'gate' ? leafHeightOf(it) : it.heightMm, axisMm: li.axisEnd - li.axisStart, params: it.params, doubleGate: it.kind === 'gate' && it.gateType === 'double', gate: it.kind === 'gate', leafWidthsMm: it.kind === 'gate' && it.gateType === 'double' ? gateLeafPoses(it, li.clearStart, li.clearEnd, 1).map((q) => q.widthMm) : undefined });
    for (const ev of evaluateItemParts(modelId, specs, specCtx)) add(ev.part.group, ev.part.materialId, ev.materialQty);

    if (it.kind === 'gate' && it.sliding) {
      // klizni okov je već dodat iz sklopa
    } else if (it.kind === 'gate' && it.design) {
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
      const guideM = sp.priceBasis === 'per_bar' && !physical?.netLengths ? (lv.quantities.guideBars * RAIL04.stockMm) / 1000 : meters(lv.quantities.guideLens);
      const fillM = sp.priceBasis === 'per_bar' && !physical?.netLengths ? (lv.quantities.fillBars * RAIL04.stockMm) / 1000 : meters(lv.quantities.fillLens);
      add('Profili ispune', GUIDE_PROFILES[sp.guideProfile].materialId, guideM);
      add('Profili ispune', FILL_PROFILES[sp.fillProfile].materialId, fillM);
    }
  }
  const railPosts = new Set(hasCustomSpec('rail_black', specs) ? [] : project.posts.map((_, i) => i).filter((i) => [project.items[i - 1], project.items[i]].some((x) => x && isRail04(x))));
  project.posts.forEach((p, i) => {
    if (layout.posts[i]?.hidden || !isProductionPost(p)) return;
    if (p.materialId && isSimulationMaterial(materials.find((m) => m.id === p.materialId))) return;
    // kapa na vrhu i dno stuba izabrani u panelu stuba (materijal iz cenovnika, po komadu)
    if (p.capTopMaterialId && p.type !== 'concrete' && p.type !== 'concrete_plinth') add('Stubovi', p.capTopMaterialId, 1);
    if (p.capBottomMaterialId && p.type !== 'concrete' && p.type !== 'concrete_plinth') add('Stubovi', p.capBottomMaterialId, 1);
    if (railPosts.has(i)) return;
    // stubovi RL10 se obračunavaju u sastavnici modela (cev, lajsna, veza, stopa, sidra, nosači, završeci)
    if (isRl10Post(project.items, i) && !hasCustomSpec('rail_inox', specs)) return;
    // betonski stubovi se crtaju (na šta se kapija montira), ali ne ulaze u ponudu: aluminijumska radnja ih ne izvodi
    if (p.type === 'concrete' || p.type === 'concrete_plinth') return;
    // stub sa izabranim materijalom (šablon stuba): profil po dužini stuba, ostalo po komadu
    const own = postMaterialLine(project, i, materials, layout.posts[i]?.lengthMm ?? p.heightMm);
    if (own) { add('Stubovi', own.materialId, own.qty); return; }
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
      if (physical?.includePosts !== false) add('Nosači i spojnice', 'mat_bts_ak5062', q.posts);
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
    if (!mat && a.label) { line.name = a.label; line.unit = a.unit ?? (a.materialId.startsWith('gate-m:') ? 'm' : 'kom'); }
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

/** Isti neto obračun za cenu plastificiranja, krojnu listu i radni nalog. */
export function buildProjectFinishing(project: Project, materials: Material[], specs?: ModelSpecs, includePosts = true): FinishingSummary {
  return measureFinishing(buildBom(project, materials, specs, { netLengths: true, includePosts }), materials);
}

/** Materijal jednog elementa/niza, bez zajedničkih stubova. Čuva položaje i svetle otvore projekta. */
export function buildElementFinishing(project: Project, indices: number[], materials: Material[], specs?: ModelSpecs): FinishingSummary {
  const keep = new Set(indices);
  const part: Project = { ...project, items: project.items.map((it, i) => keep.has(i) || it.kind === 'opening' ? it : { kind: 'opening', id: it.id, widthMm: it.widthMm, heightMm: it.heightMm }) };
  const result = buildProjectFinishing(part, materials, specs, false);
  // Izdvajanje jednog dela neprekinutog niza menja prepuste i spojeve na njegovim krajevima.
  // Takva pojedinačna masa je približna; zbir celog projekta koristi originalnu sastavnicu.
  if (indices.some((i) => (isRl10Item(project.items[i]) || isRail04(project.items[i])) && project.items.some((it, j) => !keep.has(j) && (isRl10Item(it) || isRail04(it))))) {
    result.massEstimated = true;
    result.areaEstimated = true;
  }
  return result;
}

/* ---------- Cena ---------- */

export interface PriceRow { label: string; base: string; amount: number; emphasis?: boolean }

export interface PriceBreakdown {
  materialTotal: number;
  coatingTotal: number;
  coatingAreaM2: number;
  finishing: FinishingSummary;
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
  const finishing = buildProjectFinishing(project, materials, specs);
  const coatingRate = Math.max(0, Number.isFinite(pricing.coatingPerM2Rsd) ? pricing.coatingPerM2Rsd! : 0);
  const coatingTotal = finishing.areaM2 * coatingRate;
  const costBase = mat + labor.total + inst.total + coatingTotal;
  const sellNet = sellingPrice(costBase, pricing);
  const profitAmount = sellNet - costBase;
  const discountAmount = (sellNet * pricing.discountPercent) / 100;
  const netAfterDiscount = sellNet - discountAmount;
  const vatAmount = (netAfterDiscount * pricing.vatPercent) / 100;
  const grossTotal = netAfterDiscount + vatAmount;
  const profitLabel = pricing.profitMode === 'margin' ? `Marža ${pricing.profitPercent}%` : `Uvećanje ${pricing.profitPercent}%`;
  const profitBase = pricing.profitMode === 'margin' ? 'udeo u prodajnoj ceni (trošak / (1 − marža))' : 'na nabavnu osnovicu (materijal + rad + montaža + plastificiranje)';
  const rows: PriceRow[] = [
    { label: 'Materijal', base: pricing.pricesIncludeVat ? 'neto (iz bruto cena bez PDV-a)' : 'neto, sa otpadom', amount: mat },
    { label: 'Rad (izrada)', base: `${labor.areaM2.toFixed(2)} m² ograde + ${labor.gates} kapija`, amount: labor.total },
    { label: 'Montaža', base: `${inst.meters.toFixed(2)} m trase + ${inst.gates} kapija`, amount: inst.total },
    { label: 'Plastificiranje', base: `${finishingArea(finishing)} × ${coatingRate.toLocaleString('sr-RS')} RSD/m² (neto)${finishing.missingArea.length ? ' • nepotpuna površina' : ''}`, amount: coatingTotal },
    { label: 'Osnovica troška', base: 'materijal + rad + montaža + plastificiranje', amount: costBase, emphasis: true },
    { label: profitLabel, base: profitBase, amount: profitAmount },
    { label: 'Prodajna cena (neto)', base: 'trošak + zarada', amount: sellNet, emphasis: true },
    { label: `Popust ${pricing.discountPercent}%`, base: 'na prodajnu cenu (neto)', amount: -discountAmount },
    { label: 'Osnovica za PDV', base: 'prodajna cena umanjena za popust', amount: netAfterDiscount, emphasis: true },
    { label: `PDV ${pricing.vatPercent}%`, base: 'na osnovicu za PDV', amount: vatAmount },
    { label: 'Ukupno sa PDV-om', base: '', amount: grossTotal, emphasis: true },
  ];
  return {
    materialTotal: mat, coatingTotal, coatingAreaM2: finishing.areaM2, finishing, laborTotal: labor.total, installTotal: inst.total, costBase, profitAmount, sellNet,
    discountAmount, netAfterDiscount, vatAmount, grossTotal, rows,
    fenceAreaM2: labor.areaM2, runningMeters: inst.meters, gateCount: inst.gates,
  };
}

export const isFence = (i: unknown): i is FenceSection => (i as FenceSection)?.kind === 'fence';
export const isGate = (i: unknown): i is Gate => (i as Gate)?.kind === 'gate';
