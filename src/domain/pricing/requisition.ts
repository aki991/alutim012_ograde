import { BOM_GROUPS, materialName, type ModelSpecs } from '../models/spec';
import type { Material, Project } from '../models/types';
import { buildBom, type BomGroup } from './calc';
import { buildCuttingList, type CutOptions } from './cutting';

/**
 * Trebovanje materijala za projekat: sav materijal iz sastavnica (ograda, kapije, stubovi, okov), a profili koji se seku poručuju se
 * u celim šipkama — koliko šipki traži krojna lista (raspored komada na nabavne šipke). Količina svakog reda može ručno da se promeni
 * (npr. jedna šipka više za rezervu); izmena se čuva uz projekat i može da se vrati na izračunatu.
 */
export interface RequisitionLine {
  /** stabilan ključ reda (za ručno izmenjenu količinu) */
  key: string;
  group: BomGroup;
  sku: string;
  name: string;
  /** jedinica poručivanja: „šipka“ za profile koji se seku, inače jedinica materijala iz cenovnika */
  unit: string;
  /** izračunata količina (cele šipke, celi komadi) */
  calc: number;
  /** količina za trebovanje: ručno izmenjena ili izračunata */
  qty: number;
  edited: boolean;
  /** objašnjenje količine (npr. „14 komada iz 5 šipki od 6000 mm“) */
  note?: string;
}

export interface Requisition { stockMm: number; groups: { group: BomGroup; lines: RequisitionLine[] }[] }

const ceil2 = (n: number): number => Math.ceil(n * 100 - 1e-6) / 100;

export function buildRequisition(project: Project, materials: Material[], specs: ModelSpecs | undefined, opts: CutOptions): Requisition {
  const bom = buildBom(project, materials, specs).filter((l) => l.key !== 'extra');
  const cut = buildCuttingList(project, specs, materials, opts);
  const plans = new Map(cut.profiles.map((p) => [p.profile, p]));
  const used = new Set<string>();
  const lines: RequisitionLine[] = [];
  const stock = opts.stockMm;
  const barsOf = (meters: number) => Math.max(1, Math.ceil((meters * 1000 - 1e-6) / stock));
  for (const l of bom) {
    const profile = plans.get(l.name) ?? plans.get(materialName(materials, l.materialId));
    if (l.unit === 'm') {
      // profil: cele šipke iz krojne liste; profil koji nije u krojnoj listi (npr. bez dužine reza) — šipke iz metraže sa otpadom
      if (profile && !used.has(profile.profile)) {
        used.add(profile.profile);
        const bars = profile.newBars + profile.oversize.length;
        lines.push({ key: `bar|${l.materialId}`, group: l.group, sku: l.sku, name: l.name, unit: 'šipka', calc: bars, qty: bars, edited: false,
          note: `${profile.pieceCount} kom. za sečenje · šipka ${stock} mm${profile.offcutBars ? ` · iz ostataka ${profile.offcutBars} šip.` : ''}${profile.oversize.length ? ` · ${profile.oversize.length} komad duži od šipke` : ''}` });
        continue;
      }
      if (profile) continue;
      const bars = barsOf(l.purchaseQty);
      lines.push({ key: `bar|${l.materialId}`, group: l.group, sku: l.sku, name: l.name, unit: 'šipka', calc: bars, qty: bars, edited: false, note: `${String(Math.round(l.purchaseQty * 100) / 100).replace('.', ',')} m sa otpadom · šipka ${stock} mm` });
      continue;
    }
    const calc = l.unit === 'kom' || l.unit === 'set' ? Math.ceil(l.purchaseQty - 1e-6) : ceil2(l.purchaseQty);
    lines.push({ key: `qty|${l.group}|${l.materialId}`, group: l.group, sku: l.sku, name: l.name, unit: l.unit, calc, qty: calc, edited: false });
  }
  // profili iz krojne liste kojih nema u sastavnici (npr. delovi kapije sa merama)
  for (const p of cut.profiles) {
    if (used.has(p.profile) || bom.some((l) => l.name === p.profile)) continue;
    const m = materials.find((x) => x.name === p.profile);
    const bars = p.newBars + p.oversize.length;
    lines.push({ key: `bar|name|${p.profile}`, group: 'Profili ispune', sku: m?.sku ?? '—', name: p.profile, unit: 'šipka', calc: bars, qty: bars, edited: false, note: `${p.pieceCount} kom. za sečenje · šipka ${stock} mm` });
  }
  const over = project.requisition ?? {};
  for (const l of lines) {
    const v = over[l.key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) { l.qty = v; l.edited = v !== l.calc; }
  }
  const groups = BOM_GROUPS.map((group) => ({ group, lines: lines.filter((l) => l.group === group && (l.calc > 0 || l.qty > 0)) })).filter((g) => g.lines.length > 0);
  return { stockMm: stock, groups };
}

/** ručno izmenjena količina jednog reda (null vraća izračunatu); vraća novi projekat */
export function setRequisitionQty(project: Project, key: string, qty: number | null): Project {
  const next = { ...(project.requisition ?? {}) };
  if (qty === null) delete next[key]; else next[key] = Math.max(0, qty);
  return { ...project, requisition: Object.keys(next).length ? next : undefined, updatedAt: new Date().toISOString() };
}

/** sve količine trebovanja na izračunate vrednosti */
export const resetRequisition = (project: Project): Project => ({ ...project, requisition: undefined, updatedAt: new Date().toISOString() });
