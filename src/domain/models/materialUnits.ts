import { dimsFromName, norm } from './materialShape';
import { excludesMaterialMass, withMaterialMass } from './materialMass';
import { fittingKind } from './materialCategory';
import type { Material, MaterialUnit } from './types';

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = { m: 'm', m2: 'm²', kom: 'kom', set: 'set', kg: 'kg' };
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const num = (s: string) => Number(s.replace(',', '.'));

export function knownLengthM(m: Material): number | null {
  if (positive(m.stockLengthM)) return m.stockLengthM;
  if (positive(m.dims?.lengthMm)) return m.dims.lengthMm / 1000;
  const text = /(?:šipka|sipka|dužina|duzina|visina|gotov\w*)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|m)\b/i.exec(m.name);
  return text && num(text[1]) > 0 ? num(text[1]) / (text[2].toLowerCase() === 'mm' ? 1000 : 1) : null;
}

export function knownAreaM2(m: Material): number | null {
  if (materialBaseUnit(m) !== 'm2') return null;
  if (positive(m.pieceAreaM2)) return m.pieceAreaM2;
  const d = dimsFromName(m.name);
  const a = m.dims?.width ?? d[0]; const b = m.dims?.height ?? d[1];
  return positive(a) && positive(b) && /lim|ploc|panel|stakl/.test(norm(m.name)) && !/panel-profil/.test(norm(m.name)) ? a * b / 1e6 : null;
}

export function knownPackCount(m: Material): number | null {
  if (positive(m.piecesPerSet)) return m.piecesPerSet;
  const n = norm(m.name);
  if (/levi i desni|leva i desna|\bpar\b/.test(n)) return 2;
  const count = /\b(\d+)\s*(?:kom(?:ad[ai]?)?|pcs)\b/.exec(n);
  return count && num(count[1]) > 0 ? num(count[1]) : null;
}

/** Fizička jedinica količina: bira se po vrsti artikla, ne po trenutno izabranoj ceni. */
export function materialBaseUnit(m: Material): MaterialUnit {
  const n = norm(m.name);
  const bundle = m.unit === 'set' || /\bset\b/.test(n) || (knownPackCount(m) !== null && /komplet|\bpar\b|levi i desni|leva i desna/.test(n));
  if (/usluga|savijanje/.test(n)) return m.unit === 'set' ? 'set' : 'kom';
  if (m.category === 'staklo') return 'm2';
  const linear = /profil|cev|lamel|letvic|rukohvat|precka|lajsn|traka|dask/.test(n);
  // Završni/montažni delovi često u nazivu pominju profil na koji naležu.
  const piece = /\bkap[aeu]\b|kapic|\bcep|rozet|zavrset|zavrsn|poklop|\bstop|flans|prirubnic|spojnic|veza|kolen|zglob|obujmic|stezaljk|nosac|drzac|prsten|spigot|klin|juliet|skretnic|granicnik/.test(n);
  if (piece && !(m.unit === 'm' && /maskic|lajsn/.test(n))) return bundle ? 'set' : 'kom';
  if (fittingKind({ ...m, unit: 'kom' }) === 'hardware' && !linear) return bundle ? 'set' : 'kom';
  if (!linear && (m.category === 'panel' || /\blim\b|\bploc[aeu]\b|^stakl|kaljeno staklo|laminirano staklo/.test(n))) return 'm2';
  if (!linear && m.unit === 'm2') return 'm2';
  if (/beton/.test(n)) return 'kom';
  if (m.drawn || linear || m.category === 'profil') return 'm';
  if (m.category === 'stub') return !/gotov|visina|duzina/.test(n) && (m.massUnit === 'kg/m' || dimsFromName(m.name).length >= 2 || /[øØ⌀]/.test(m.name)) ? 'm' : 'kom';
  if (m.category === 'zavrsetak' || m.category === 'montaza' || m.category === 'automatika' || m.category === 'okov') return bundle ? 'set' : 'kom';
  return m.unit;
}

/** Koliko osnovnih jedinica ima jedna jedinica iz cenovnika. Ne koristi procenjene dimenzije za komade/površinu. */
export function materialUnitFactors(m: Material): Partial<Record<MaterialUnit, number>> {
  const base = m.unit;
  const out: Partial<Record<MaterialUnit, number>> = { [base]: 1 };
  const length = knownLengthM(m); const area = knownAreaM2(m); const pack = knownPackCount(m);
  if (base === 'm' && length) out.kom = length;
  if (base === 'm2' && area) out.kom = area;
  if (base === 'kom' && length && (m.category === 'stub' || /cev|profil/.test(norm(m.name)))) out.m = 1 / length;
  if (base === 'kom' && area) out.m2 = 1 / area;
  if (base === 'set' && pack) out.kom = 1 / pack;
  if (base === 'kom' && pack) out.set = pack;
  const mass = withMaterialMass(m);
  if (!excludesMaterialMass(m) && positive(mass.mass)) {
    const massPhysical: MaterialUnit | null = mass.massUnit === 'kg/m' ? 'm' : mass.massUnit === 'kg/m²' ? 'm2' : mass.massUnit === 'kg/kom' ? (base === 'set' ? 'set' : 'kom') : null;
    const factor = massPhysical ? out[massPhysical] : undefined;
    if (positive(factor)) out.kg = factor / mass.mass;
  }
  return out;
}

export function materialPriceUnits(m: Material): MaterialUnit[] {
  const factors = materialUnitFactors(m);
  return [m.unit, ...(['m', 'm2', 'kom', 'set', 'kg'] as const).filter((u) => u !== m.unit)].filter((u) => positive(factors[u]));
}
export const selectedPriceUnit = (m: Material): MaterialUnit => m.priceUnit && positive(materialUnitFactors(m)[m.priceUnit]) ? m.priceUnit : m.unit;
export const materialPriceInUnit = (m: Material, unit = selectedPriceUnit(m)): number => m.unitPrice * (materialUnitFactors(m)[unit] ?? 1);
export const materialPriceToBase = (m: Material, price: number, unit = selectedPriceUnit(m)): number => price / (materialUnitFactors(m)[unit] ?? 1);
export function selectMaterialPriceUnit(m: Material, unit: MaterialUnit): Material {
  return positive(materialUnitFactors(m)[unit]) ? { ...m, priceUnit: unit === m.unit ? undefined : unit } : m;
}
export const priceUsesEstimatedMass = (m: Material): boolean => selectedPriceUnit(m) === 'kg' && m.unit !== 'kg' && withMaterialMass(m).massSource === 'estimated';

/** Isprava starih nelogičnih jedinica; osnovna cena se preračuna kad postoji pouzdana veza. */
export function withMaterialUnits(input: Material): Material {
  const unit = materialBaseUnit(input);
  let m = withMaterialMass(unit === input.unit ? input : { ...input, unit, massBasis: undefined });
  if (unit !== input.unit) {
    const factor = materialUnitFactors(m)[input.unit];
    m = positive(factor)
      ? { ...m, unitPrice: input.unitPrice / factor, priceUnit: input.priceUnit ?? input.unit }
      : { ...m, priceUnit: undefined, unitCorrection: input.unitCorrection ?? (input.unitPrice > 0 ? { from: input.unit, to: unit, originalPrice: input.unitPrice } : undefined) };
  }
  if (m.priceUnit && !positive(materialUnitFactors(m)[m.priceUnit])) m = { ...m, priceUnit: undefined };
  return m;
}
