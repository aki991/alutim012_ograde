import { computeLayout } from '../geometry/layout';
import { customLiftOf, customPartsFor } from '../models/customRegistry';
import { sheetPoly } from '../models/custom';
import type { Material, Project } from '../models/types';
import { itemNumber } from '../../utils/labels';

export type GlassPoint = [number, number];
export interface GlassCutPiece {
  id: string;
  pos: string;
  index: number;
  material: string;
  sku: string;
  thicknessMm: number;
  /** A, B, C, D: donji levi, donji desni, gornji desni i gornji levi ugao gledano spreda. */
  points: GlassPoint[];
  /** AB, BC, CD, DA (mm) i unutrašnji uglovi A, B, C, D (°). */
  edgesMm: number[];
  anglesDeg: number[];
  horizontalMm: number;
  heightMm: number;
  slopeDeg: number;
  areaM2: number;
}

export function glassPolygon(points: GlassPoint[]): Pick<GlassCutPiece, 'points' | 'edgesMm' | 'anglesDeg' | 'horizontalMm' | 'heightMm' | 'areaM2'> {
  const minX = Math.min(...points.map((p) => p[0])); const minY = Math.min(...points.map((p) => p[1]));
  const p = points.map(([x, y]): GlassPoint => [x - minX, y - minY]);
  const edgesMm = p.map((a, i) => Math.hypot(p[(i + 1) % p.length][0] - a[0], p[(i + 1) % p.length][1] - a[1]));
  const anglesDeg = p.map((a, i) => {
    const before = p[(i + p.length - 1) % p.length]; const after = p[(i + 1) % p.length];
    const u = [before[0] - a[0], before[1] - a[1]]; const v = [after[0] - a[0], after[1] - a[1]];
    const cosine = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  });
  const areaM2 = Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0)) / 2e6;
  return { points: p, edgesMm, anglesDeg, horizontalMm: Math.max(...p.map((q) => q[0])), heightMm: Math.max(...p.map((q) => q[1])), areaM2 };
}

/** Ista tabla i isto smicanje kao na crtežu: x ostaje horizontalan, y se podiže za tan(nagiba) × x. */
export function buildGlassCutPieces(project: Project, materials: Material[]): GlassCutPiece[] {
  const out: GlassCutPiece[] = [];
  for (const li of computeLayout(project).items) {
    const it = li.item;
    if (it.kind !== 'fence') continue;
    const up = Math.min(Math.max(0, it.params.liftMm ?? customLiftOf(it.modelId)), Math.max(0, it.heightMm - 100));
    const tan = li.axisEnd > li.axisStart ? (li.floorEnd - li.floorStart) / (li.axisEnd - li.axisStart) : 0;
    let n = 0;
    for (const r of customPartsFor(it.modelId, li.clearWidth, it.heightMm - up, it.color, it.params.slats)) {
      if (r.shape.type !== 'sheet' || !r.shape.glass || r.part.lengthMm <= 0 || !(r.part.heightMm! > 0)) continue;
      const mat = materials.find((m) => m.id === (project.partMaterials?.[r.part.materialId] ?? r.part.materialId)) ?? r.material;
      const polygon = glassPolygon(sheetPoly(r.part).map(([x, y]): GlassPoint => [x, y + tan * x]));
      const pos = String(itemNumber(project.items, li.index));
      out.push({ ...polygon, id: `G${pos}.${++n}`, pos, index: li.index, material: mat?.name ?? 'Staklo', sku: mat?.sku ?? '',
        thicknessMm: mat?.dims?.t ?? r.shape.thick, slopeDeg: Math.atan(tan) * 180 / Math.PI });
    }
  }
  return out;
}

export const glassMm = (v: number, digits = 1): string => v.toLocaleString('sr-Latn-RS', { maximumFractionDigits: digits });
export const glassEdgesLabel = (p: GlassCutPiece): string => p.edgesMm.map((mm, i) => `${['AB', 'BC', 'CD', 'DA'][i]} ${glassMm(mm)} mm`).join(' · ');
export const glassAnglesLabel = (p: GlassCutPiece): string => p.anglesDeg.map((deg, i) => `${'ABCD'[i]} ${glassMm(deg)}°`).join(' · ');
