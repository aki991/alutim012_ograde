import { BOM_GROUPS } from '../models/spec';
import type { ModelSpecs } from '../models/spec';
import type { Material, Project } from '../models/types';
import { buildBom, type BomGroup } from './calc';

/**
 * Spisak materijala projekta (bez cena): sve što treba za ogradu i kapije u projektu, grupisano. Isti obračun kao u ponudi
 * (`buildBom`): materijal iz sastavnica modela (i ono što je korisnik dodao u sastavnicu), stubovi sa kapama, kapije i okov.
 */
export interface MaterialListLine {
  sku: string;
  name: string;
  unit: Material['unit'];
  /** potrebno prema crtežu, bez otpada */
  needed: number;
  /** za nabavku (sa otpadom / zaokruživanjem) */
  purchase: number;
}

export interface MaterialListGroup { group: BomGroup; lines: MaterialListLine[] }

export function buildMaterialList(project: Project, materials: Material[], specs?: ModelSpecs): MaterialListGroup[] {
  // „Dodatni sitni materijal (% od materijala)“ je paušal u ceni, ne materijal koji se nabavlja
  const bom = buildBom(project, materials, specs).filter((l) => l.key !== 'extra');
  return BOM_GROUPS
    .map((group) => ({
      group,
      lines: bom.filter((l) => l.group === group).map((l) => ({ sku: l.sku, name: l.name, unit: l.unit, needed: l.geometricQty, purchase: l.purchaseQty })),
    }))
    .filter((g) => g.lines.length > 0);
}

/** Količina za prikaz: komadi celi, ostalo na dve decimale. */
export const materialQtyText = (qty: number, unit: Material['unit']): string => {
  const v = unit === 'kom' || unit === 'set' ? Math.round(qty) : Math.round(qty * 100) / 100;
  return String(v).replace('.', ',');
};

/** Redovi tabele (CSV / Excel): zaglavlje sa projektom i kupcem, pa materijal po grupama. */
export function materialListRows(project: Project, customerName: string | null, groups: MaterialListGroup[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['Spisak materijala'],
    ['Projekat', project.name],
    ['Kupac', customerName ?? ''],
    ['Broj ponude', project.quoteNo],
    [],
    ['Grupa', 'Naziv', 'JM', 'Potrebno', 'Za nabavku (sa otpadom)'],
  ];
  for (const g of groups) for (const l of g.lines) rows.push([g.group, l.name, l.unit, materialQtyText(l.needed, l.unit), materialQtyText(l.purchase, l.unit)]);
  return rows;
}
