import { withMaterialMass } from '../models/materialMass';
import { isTerraceMaterial, materialShape, norm } from '../models/materialShape';
import { materialPriceInUnit, materialPriceToBase, materialUnitFactors, withMaterialUnits } from '../models/materialUnits';
import type { Material } from '../models/types';

/**
 * Jedna cena po kilogramu za čelične cevi (i, po izboru, U profile): cena svakog takvog materijala u cenovniku (po metru, šipki …)
 * računa se iz te cene i mase materijala. Kad se cena po kg promeni, menjaju se cene svih tih materijala.
 */
export type KgPriceGroup = 'tube' | 'u';
export interface KgPrice { /** cena po kg u RSD (osnovna valuta cenovnika) */ priceRsd: number; groups: KgPriceGroup[] }

export const KG_PRICE_GROUP_LABELS: Record<KgPriceGroup, string> = { tube: 'Cevi (kvadratne, pravougaone, okrugle)', u: 'U profili' };

/**
 * grupa materijala za cenu po kg; null kad materijal ne ulazi (gotovi stubovi, okov, aluminijum i inox, materijali za terase).
 * Sirova cev koja se koristi za stubove (npr. kvadratna cev 100 × 100) jeste cev i ulazi.
 */
export function kgPriceGroupOf(m: Material): KgPriceGroup | null {
  if (isTerraceMaterial(m)) return null;
  const n = norm(m.name);
  if (/\bstub|alumin|\balu\b|inox|nerdj/.test(n)) return null;
  const s = materialShape(m);
  if (s.type !== 'linear') return null;
  if (s.u) return 'u';
  return /\bcev/.test(n) ? 'tube' : null;
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** cena materijala u osnovnoj jedinici iz cene po kg; null kad masa nije poznata */
export function priceFromKg(m: Material, priceRsd: number): number | null {
  const u = withMaterialUnits(m);
  return positive(materialUnitFactors(u).kg) ? materialPriceToBase(u, priceRsd, 'kg') : null;
}

/** da li cena po kg važi za materijal (pripada izabranoj grupi) */
export const followsKgPrice = (m: Material, kg: KgPrice | null | undefined): boolean => {
  if (!kg || !(kg.priceRsd >= 0)) return false;
  const g = kgPriceGroupOf(m);
  return !!g && kg.groups.includes(g);
};

/** materijal sa cenom iz cene po kg (isti materijal kad cena po kg za njega ne važi ili mu masa nije poznata) */
export function withKgPrice(m: Material, kg: KgPrice | null | undefined): Material {
  if (!followsKgPrice(m, kg)) return m;
  const p = priceFromKg(m, kg!.priceRsd);
  if (p === null) return m;
  const unitPrice = Math.round(p * 10000) / 10000;
  return Math.abs(unitPrice - m.unitPrice) < 1e-9 && !m.unitCorrection ? m : { ...m, unitPrice, unitCorrection: undefined };
}

export interface KgPriceReport {
  /** materijali čija se cena računa iz cene po kg */
  priced: Material[];
  /** u grupi, a bez poznate mase: cena ostaje ručna dok se ne upiše masa */
  noMass: Material[];
  /** u grupi, sa procenjenom masom (nije iz deklaracije): cena je približna */
  estimated: Material[];
}

export function kgPriceReport(materials: Material[], kg: KgPrice): KgPriceReport {
  const inGroup = materials.filter((m) => followsKgPrice(m, kg));
  return {
    priced: inGroup.filter((m) => priceFromKg(m, kg.priceRsd) !== null),
    noMass: inGroup.filter((m) => priceFromKg(m, kg.priceRsd) === null),
    estimated: inGroup.filter((m) => priceFromKg(m, kg.priceRsd) !== null && withMaterialMass(m).massSource === 'estimated'),
  };
}

/** Postojeća cena po kg materijala (za predlog početne vrednosti): najčešća zaokružena vrednost u grupi. */
export function currentKgPrice(materials: Material[], groups: KgPriceGroup[]): number | null {
  const counts = new Map<number, number>();
  for (const m of materials) {
    const g = kgPriceGroupOf(m);
    if (!g || !groups.includes(g)) continue;
    const u = withMaterialUnits(m);
    if (!positive(materialUnitFactors(u).kg) || !(u.unitPrice > 0)) continue;
    const v = Math.round(materialPriceInUnit(u, 'kg'));
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}
