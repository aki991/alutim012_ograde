import { excludesMaterialMass, withMaterialMass } from '../models/materialMass';
import { materialShape, norm, type Solid } from '../models/materialShape';
import { materialUnitFactors } from '../models/materialUnits';
import type { Material, MaterialUnit } from '../models/types';
import { isSimulationMaterial } from '../models/productionPosts';

export interface FinishingSummary {
  massKg: number;
  areaM2: number;
  massEstimated: boolean;
  areaEstimated: boolean;
  missingMass: string[];
  missingArea: string[];
}

type Quantity = { materialId: string; name: string; unit: MaterialUnit; geometricQty: number; group?: string };
const positive = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
const perimeter = (points: [number, number][]) => points.reduce((sum, p, i) => {
  const next = points[(i + 1) % points.length];
  return sum + Math.hypot(next[0] - p[0], next[1] - p[1]);
}, 0);

/** Površine jednostavnih tela crteža, u mm². Kod sklopova su dodirne površine procena. */
function solidArea(s: Solid): number {
  if (s.prim === 'box') { const [a, b, c] = s.size; return 2 * (a * b + b * c + a * c); }
  if (s.prim === 'cyl') return 2 * Math.PI * s.r * (s.len + s.r);
  if (s.prim === 'sph') return 4 * Math.PI * s.r ** 2;
  if (s.prim === 'pyr') { const [a, b] = s.base; return a * b + a * Math.hypot(b / 2, s.h) + b * Math.hypot(a / 2, s.h); }
  const a = s.w / 2; const b = s.h;
  const halfEllipse = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) / 2;
  return (halfEllipse + s.w) * s.d + Math.PI * a * b;
}

/** Aluminijumski delovi za plastifikaciju; staklo, okov, polimeri, beton i inox ne idu na ovu uslugu. */
export function coatsMaterial(m: Material): boolean {
  return !excludesMaterialMass(m) && !/inox|inoks|prohrom|nerdjaj|celik|celic|gvozd|steel|\bs[23][357]5\b|beton|gumen|\bguma\b|epdm|plasti[ck]|pvc|polikarbonat|wpc|\bhpl\b|drven/.test(norm(m.name));
}

/** Neto ugrađene količine. Zatvoreni profili: spoljašnji obim, otvoreni: ceo dostupni obim, lim: obe strane.
 * Ne uključuje unutrašnje komore zatvorenih cevi, čela rezova, otpad i nabavne cele šipke.
 */
export function measureFinishing(lines: Quantity[], materials: Material[]): FinishingSummary {
  const result: FinishingSummary = { massKg: 0, areaM2: 0, massEstimated: false, areaEstimated: false, missingMass: [], missingArea: [] };
  const byId = new Map(materials.map((m) => [m.id, m]));
  for (const line of lines) {
    if (!(line.geometricQty > 0) || line.materialId === 'extra') continue;
    const original = byId.get(line.materialId);
    if (!original) {
      if (/^gate-hw:|^gate-unknown:/.test(line.materialId)) continue;
      if ((line.unit === 'kom' || line.unit === 'set') && ['Vijci', 'Šarke', 'Brave', 'Točkići', 'Automatika'].includes(line.group ?? '')) continue;
      result.missingMass.push(line.name); result.missingArea.push(line.name); continue;
    }
    const m = withMaterialMass(original);
    if (excludesMaterialMass(m) || isSimulationMaterial(m)) continue;
    const factors = materialUnitFactors(m);
    if (positive(factors.kg)) {
      result.massKg += line.geometricQty / factors.kg;
      result.massEstimated ||= m.massSource === 'estimated';
    } else result.missingMass.push(m.name);
    if (!coatsMaterial(m)) continue;
    const shape = materialShape(m);
    let area = 0;
    if (shape.type === 'sheet' && positive(factors.m2)) {
      area = 2 * line.geometricQty / factors.m2;
      result.areaEstimated ||= /perfor|lasers|rezan|rebrast|profilisan|sendvic|kompozit/.test(norm(m.name));
    }
    else if (shape.type === 'linear' && positive(factors.m)) {
      const p = shape.section.round ? Math.PI * shape.section.w : shape.section.polys.reduce((sum, poly) => sum + perimeter(poly.outline), 0);
      area = p / 1000 * line.geometricQty / factors.m;
      result.areaEstimated ||= !shape.exact || shape.section.polys.length > 1 || ['maske', 'kose', 'z', 'c'].includes(shape.group);
    } else if (shape.type === 'piece' && (positive(factors.kom) || m.unit === 'set')) {
      area = shape.solids.reduce((sum, s) => sum + solidArea(s), 0) / 1e6 * line.geometricQty / (factors.kom ?? 1);
      result.areaEstimated = true;
    }
    if (positive(area)) result.areaM2 += area;
    else result.missingArea.push(m.name);
  }
  result.missingMass = [...new Set(result.missingMass)];
  result.missingArea = [...new Set(result.missingArea)];
  return result;
}

const num = (v: number) => v.toLocaleString('sr-RS', { maximumFractionDigits: 3 });
export function finishingMass(s: FinishingSummary): string {
  return `${s.missingMass.length ? '≥ ' : s.massEstimated ? '≈ ' : ''}${num(s.massKg)} kg`;
}
export function finishingArea(s: FinishingSummary): string {
  return `${s.missingArea.length ? '≥ ' : s.areaEstimated ? '≈ ' : ''}${num(s.areaM2)} m²`;
}
export const FINISHING_NOTE = 'Neto ugrađeni delovi sa stubovima, bez otpada, okova i stakla. Površina: spoljašnji obim profila × dužina; lim sa obe strane. Unutrašnje komore i čela rezova nisu uključeni. ≈ označava procenu.';
export function finishingMissing(s: FinishingSummary): string[] {
  return [
    ...(s.missingMass.length ? [`Nedostaje masa: ${s.missingMass.join('; ')}.`] : []),
    ...(s.missingArea.length ? [`Nedostaje površina za plastificiranje: ${s.missingArea.join('; ')}. Obračunata je samo poznata površina.`] : []),
  ];
}
