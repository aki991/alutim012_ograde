import { partBounds, type CustomModel, type CustomPart } from './custom';
import { checkDrawing, type DrawingProblem } from './drawingCheck';
import { scaledModel } from './customRegistry';
import { materialShape } from './materialShape';
import { bodyParts } from './pairHardware';
import type { Material } from './types';

/**
 * Provera modela na više veličina polja: model se računa za uobičajene veličine (usko, uobičajeno, visoko i široko polje ili krilo) po
 * istim pravilima kao u projektu, a prijavljuje se ono što bi tamo bilo pogrešno: deo koji izlazi iz polja, delovi koji se preklapaju
 * ili nejednaki razmaci koji na crtežu ne postoje, materijal koji nestane. Upozorenja se prikazuju uz ostala upozorenja crteža i mogu
 * da se prihvate (ključ upozorenja pamti se uz model).
 */
export const PROBE_SIZES: readonly [number, number][] = [[900, 1000], [1500, 1200], [1750, 1600], [2500, 1800]];

const fmtSize = ([w, h]: [number, number]): string => `${w} × ${h} mm`;
const keyOf = (kind: string, size: [number, number], extra: string): string => `size|${kind}|${size[0]}x${size[1]}|${extra}`;

export function checkSizes(model: CustomModel, materials: Material[], sizes: readonly [number, number][] = PROBE_SIZES): DrawingProblem[] {
  if (model.kind === 'terrace' || !model.parts.length) return [];
  // dvokrilna kapija iz dva krila: svako krilo se proverava posebno (ceo crtež se ne razvlači na druge mere kao jedno polje)
  const lv = model.gate?.leaves;
  if (lv) {
    const { left, right } = bodyParts(model.parts, materials, lv);
    const sub = (parts: CustomPart[], dx: number, w: number): CustomModel => ({ ...model, gate: undefined, widthMm: w, parts: parts.map((p) => ({ ...p, x: p.x - dx })) });
    const all = [...checkSizes(sub(left, 0, lv.leftMm), materials, sizes), ...checkSizes(sub(right, lv.leftMm + lv.gapMm, lv.rightMm), materials, sizes)];
    return all.filter((p, i) => all.findIndex((q) => q.key === p.key) === i);
  }
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  const nameOf = (p: CustomPart): string => byId.get(p.materialId)?.name ?? 'deo';
  const native = checkDrawing(model, materials);
  /** vrsta preklapanja po paru materijala: više istih letvica koje naležu na isti nosač je jedan isti problem, ne novi */
  const sigOf = (mm: CustomModel, pr: DrawingProblem): string => pr.ids.map((id) => mm.parts.find((p) => p.id === id)?.materialId ?? '?').sort().join('+');
  const nativeSigs = (kind: string) => new Set(native.filter((p) => p.kind === kind).map((p) => sigOf(model, p)));
  const ownIds = new Set(model.parts.map((p) => p.id));
  const out: DrawingProblem[] = [];
  for (const size of sizes) {
    const [w, h] = size;
    const m = scaledModel(model, w, h);
    const label = `Na polju ${fmtSize(size)}`;
    // 1) deo izlazi iz polja
    const outside: CustomPart[] = [];
    for (const p of m.parts) {
      const s = shapeOf(p);
      if (!s || s.type === 'piece') continue;
      const b = partBounds(p, s);
      if (b.x0 < -1 || b.y0 < -1 || b.x1 > w + 1 || b.y1 > h + 1) outside.push(p);
    }
    if (outside.length) {
      const names = [...new Set(outside.map(nameOf))].slice(0, 3).join(', ');
      out.push({ kind: 'size', key: keyOf('outside', size, [...new Set(outside.map((p) => p.materialId))].sort().join('|')), msg: `${label} ${outside.length === 1 ? 'deo izlazi' : `${outside.length} dela izlazi`} iz polja (${names}). Pomerite delove bliže ivici ili ih vežite za ivicu.`, ids: outside.map((p) => p.id).filter((id) => ownIds.has(id)) });
    }
    // 2) novi problemi crteža koji na izvornoj veličini ne postoje
    const probs = checkDrawing(m, materials);
    const nOv = nativeSigs('overlap');
    const overlaps = probs.filter((p) => p.kind === 'overlap' && !nOv.has(sigOf(m, p)));
    if (overlaps.length) {
      const names = [...new Set(overlaps.map((p) => sigOf(m, p)))].map((sg) => sg.split('+').map((id) => byId.get(id)?.name ?? 'deo').join(' i ')).slice(0, 2).join('; ');
      out.push({ kind: 'size', key: keyOf('overlap', size, [...new Set(overlaps.map((p) => sigOf(m, p)))].sort().join(',')), msg: `${label} se preklapaju delovi koji se na crtežu ne preklapaju: ${names}. Letvice ili prečke su pretesne za ovu veličinu: smanjite broj ili debljinu, ili povećajte razmak.`, ids: overlaps.flatMap((p) => p.ids).filter((id) => ownIds.has(id)) });
    }
    const nGap = nativeSigs('gap');
    const gaps = probs.filter((p) => p.kind === 'gap' && !nGap.has(sigOf(m, p)));
    if (gaps.length) {
      out.push({ kind: 'size', key: keyOf('gap', size, [...new Set(gaps.map((p) => sigOf(m, p)))].sort().join(',')), msg: `${label} razmaci između istih delova nisu jednaki: ${gaps[0].msg}`, ids: gaps.flatMap((p) => p.ids).filter((id) => ownIds.has(id)) });
    }
    // 3) materijal sa crteža nestaje na polju
    const have = new Set(m.parts.map((p) => p.materialId));
    const lost = [...new Set(model.parts.map((p) => p.materialId))].filter((id) => !have.has(id));
    if (lost.length) {
      out.push({ kind: 'size', key: keyOf('lost', size, [...lost].sort().join('|')), msg: `${label} nestaje materijal sa crteža: ${lost.map((id) => byId.get(id)?.name ?? id).join(', ')}.`, ids: model.parts.filter((p) => lost.includes(p.materialId)).map((p) => p.id) });
    }
  }
  return out;
}
