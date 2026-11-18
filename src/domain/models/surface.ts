import { contentBounds, partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape, sectionFace, solidsZMin } from './materialShape';
import type { Material } from './types';
import { uid } from '../../utils/id';
import { hingePositions } from '../gates/design';

/**
 * Prednja ravan profila ili ploče ispod tačke (x, y): najveće „z + prednja ivica preseka“ među delovima koji pokrivaju tačku.
 * Komadni deo (brava, šarka) postavljen preko profila dobija dubinu tako da njegova zadnja strana naleže na tu ravan (ne ulazi u profil).
 */
export function frontSurfaceAt(model: Pick<CustomModel, 'parts'>, x: number, y: number, materials: Material[], skipId?: string): number | null {
  let front: number | null = null;
  for (const p of model.parts) {
    if (p.id === skipId) continue;
    const m = materials.find((q) => q.id === p.materialId);
    const sh = m ? materialShape(m) : null;
    if (!sh || sh.type === 'piece') continue;
    const b = partBounds(p, sh);
    if (x < b.x0 - 1e-6 || x > b.x1 + 1e-6 || y < b.y0 - 1e-6 || y > b.y1 + 1e-6) continue;
    const z = sh.type === 'linear' ? p.z + sectionFace(sh.section, p.rot + (p.tiltDeg ?? 0)).v1 : p.z;
    front = front === null ? z : Math.max(front, z);
  }
  return front;
}

/** Komadni deo leži na površini ispod sebe (dubina z); drugi delovi i delovi bez površine ispod ostaju kakvi jesu. */
export function restOnSurface(model: Pick<CustomModel, 'parts'>, part: CustomPart, materials: Material[]): CustomPart {
  const m = materials.find((q) => q.id === part.materialId);
  const sh = m ? materialShape(m) : null;
  if (!sh || sh.type !== 'piece') return part;
  const front = frontSurfaceAt(model, part.x, part.y + 1, materials, part.id);
  if (front === null) return part;
  return { ...part, z: Math.round((front - solidsZMin(sh.solids)) * 10) / 10 };
}

/**
 * Šarke duž jedne ivice kapije: ravnomerno od gornje do donje (gornja i donja na 150 mm od ivice), sa osom na ivici crteža.
 * Šarka ima osovinu na ivici, a listove na ramu krila i na stubu (list na stubu izlazi iz mera crteža).
 */
export function hingesAlongEdge(model: CustomModel, material: Material, side: 'left' | 'right', count: number, materials: Material[]): CustomPart[] {
  const sh = materialShape(material);
  if (sh.type !== 'piece') return [];
  const cb = contentBounds(model, (p) => { const mm = materials.find((q) => q.id === p.materialId); return mm ? materialShape(mm) : null; });
  if (!cb) return [];
  const { x0, y0, x1, y1 } = cb;
  // osovina šarke je na samoj ivici krila: jedan list leži na ramu krila, a drugi na stubu
  const top = 150;
  const H = y1 - y0;
  const ys = hingePositions(H, Math.max(1, count), null, Math.min(top, H / 4));
  const x = side === 'left' ? x0 : x1;
  const out: CustomPart[] = [];
  for (const mmFromTop of ys) {
    const yc = y1 - mmFromTop;
    // origin šarke je donja ivica; visina šarke je 90 mm, pa se centar spušta za polovinu
    const part: CustomPart = { id: uid('part'), materialId: material.id, x, y: Math.round((yc - 45) * 10) / 10, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 };
    out.push(restOnSurface({ parts: [...model.parts, ...out] }, part, materials));
  }
  return out;
}

/** Šarka iz cenovnika: komadni deo čiji naziv sadrži „šark“ (sa ili bez kvačica). */
export const isHingeMaterial = (m: Material): boolean => materialShape(m).type === 'piece' && /sark/.test(m.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
