import { TERRACE_MATERIALS } from '../../data/terraceMaterials';
import { dimsFromName, norm } from './materialShape';
import { geometryMaterialMass } from './materialMassEstimate';
import { fittingKind, withMaterialCategory } from './materialCategory';
import type { Material, MaterialMassUnit } from './types';

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const units: MaterialMassUnit[] = ['kg/m', 'kg/m²', 'kg/kom'];
const SOURCE = 'BTS Aluminium Railing Systems V8.0 / Frameless Glass Railing Systems V11; docs/analiza-ograde-za-terase.md';
// Dodatne tačne šifre dokumentovane u projektu, bez zamene sličnim profilom.
const BTS_KG_M: Record<string, number> = {
  'P-1033': 0.816, 'P-1054': 1.163, 'P-AL2647': 0.067, 'P-1146': 0.182,
  ...Object.fromEntries(TERRACE_MATERIALS.filter((m) => positive(m.kgPerM)).map((m) => [m.sku.toUpperCase(), m.kgPerM!])),
};

/** Okov, staklo i usluge nemaju masu u ovom katalogu; ostalim materijalima se dopunjava procena. */
export function excludesMaterialMass(m: Material): boolean {
  const n = norm(m.name);
  if (m.category === 'staklo' || /^stakl|kaljeno staklo|laminirano staklo|usluga|savijanje/.test(n)) return true;
  const kind = fittingKind(m);
  if (kind === 'ending' || kind === 'mounting') return false;
  return kind === 'hardware' || m.category === 'automatika';
}

export function defaultMassUnit(m: Material): MaterialMassUnit {
  if (fittingKind(m) === 'ending' || fittingKind(m) === 'mounting') return 'kg/kom';
  // Cevi i lamele ostaju kg/m i kad se prodaju kao cela šipka/komad.
  if (m.unit === 'm2') return 'kg/m²';
  if (m.unit === 'm' || /cev|profil|lamel|letvic|rukohvat|precka|lajsn|traka/.test(norm(m.name))) return 'kg/m';
  return 'kg/kom';
}

export function materialMassBasis(m: Material, legacy = false): string {
  const geometry = [m.sku.trim().toUpperCase(), norm(m.name), m.wallMm ?? null, Object.entries(m.dims ?? {}).sort(), m.drawn ?? null];
  return JSON.stringify(legacy ? geometry : [...geometry, m.unit, m.category]);
}

/** Dopuna starih zapisa i novih unosa. Ručni podatak ima prednost i preživljava svako ponovno učitavanje. */
export function withMaterialMass(m: Material): Material {
  m = withMaterialCategory(m);
  if (excludesMaterialMass(m)) return m;
  const currentBasis = materialMassBasis(m);
  if (positive(m.mass) && units.includes(m.massUnit!) && (!m.massSource || m.massSource === 'manual')) return m;
  const sameBasis = m.massBasis === currentBasis || m.massBasis === materialMassBasis(m, true);
  if (positive(m.mass) && units.includes(m.massUnit!) && sameBasis) return m.massBasis === currentBasis ? m : { ...m, massBasis: currentBasis };
  const changed = m.massBasis !== undefined && !sameBasis;
  const base: Material = { ...m, mass: undefined, massUnit: defaultMassUnit(m), massSource: undefined, massReference: undefined, massBasis: changed ? m.massBasis : undefined };
  const kg = BTS_KG_M[m.sku.trim().toUpperCase()];
  // Ranije sačuvana vrednost ima prednost; prepoznajemo i kataloške vrednosti BTS profila.
  if (!changed && positive(m.kgPerM)) return { ...base, mass: m.kgPerM, massUnit: 'kg/m', massSource: m.kgPerM === kg ? 'catalog' : 'manual', massReference: m.kgPerM === kg ? SOURCE : 'Ranije sačuvana masa kgPerM', massBasis: currentBasis };
  if (!changed && positive(kg) && !m.drawn && !Object.keys(m.dims ?? {}).length) {
    const canonical = TERRACE_MATERIALS.find((x) => x.sku.toUpperCase() === m.sku.trim().toUpperCase());
    // Ručno izmenjen presek više ne mora odgovarati kataloškom profilu.
    if ((!canonical || JSON.stringify(dimsFromName(canonical.name)) === JSON.stringify(dimsFromName(m.name))) && (m.wallMm === undefined || m.wallMm === canonical?.wallMm)) {
      return { ...base, mass: kg, massUnit: 'kg/m', massSource: 'catalog', massReference: SOURCE, massBasis: currentBasis };
    }
  }
  return { ...base, ...geometryMaterialMass(m), massBasis: currentBasis };
}

export function formatMaterialMass(m: Material): string {
  if (excludesMaterialMass(m)) return '—';
  const v = withMaterialMass(m);
  return positive(v.mass) && v.massUnit ? `${v.massSource === 'estimated' ? '≈ ' : ''}${new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 3 }).format(v.mass)} ${v.massUnit}` : 'Potreban podatak';
}
