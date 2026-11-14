import { partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape, type MatShape } from './materialShape';
import type { Material } from './types';

/**
 * Promena širine ili visine nacrtanog modela u crtanju: crtež se prilagođava novim merama, a profili zadržavaju svoj presek.
 * Ram uz ivicu (bočne vođice, gornji i donji ram) ostaje isti i pomera se na novu ivicu, a sve između se razvlači: vodoravne
 * prečke postaju duže ili kraće, uspravne letvice se raspoređuju šire, razmaci prečki rastu srazmerno. Broj delova ostaje isti.
 */

/** Delovi uz ivicu (ram) ostaju kakvi jesu, unutrašnjost se linearno razvlači između njih. */
function mapper(size: number, newSize: number, marginLo: number, marginHi: number): (c: number) => number {
  const inner = size - marginLo - marginHi;
  const newInner = newSize - marginLo - marginHi;
  const k = inner > 1e-6 && newInner > 0 ? newInner / inner : newSize / size;
  const d = newSize - size;
  if (!(inner > 1e-6 && newInner > 0)) return (c) => c * k;
  return (c) => (c <= marginLo ? c : c >= size - marginHi ? c + d : marginLo + (c - marginLo) * k);
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function resizeModel(model: CustomModel, widthMm: number, heightMm: number, materials: Material[]): CustomModel {
  const W = model.widthMm; const H = model.heightMm;
  if (Math.abs(W - widthMm) < 1e-9 && Math.abs(H - heightMm) < 1e-9) return model;
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart): MatShape | null => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  const a = (p: CustomPart): number => ((p.angleDeg % 360) + 360) % 360;
  const isV = (p: CustomPart) => a(p) === 90 || a(p) === 270;
  const isH = (p: CustomPart) => a(p) === 0 || a(p) === 180;

  // ram uz ivice: uspravni profili uz levu / desnu ivicu, vodoravni uz donju / gornju
  let mL = 0; let mR = 0; let mB = 0; let mT = 0;
  for (const p of model.parts) {
    const s = shapeOf(p);
    if (!s || s.type !== 'linear') continue;
    const b = partBounds(p, s);
    if (isV(p)) { if (b.x0 < 1) mL = Math.max(mL, b.x1); if (b.x1 > W - 1) mR = Math.max(mR, W - b.x0); }
    if (isH(p)) { if (b.y0 < 1) mB = Math.max(mB, b.y1); if (b.y1 > H - 1) mT = Math.max(mT, H - b.y0); }
  }
  const mx = mapper(W, widthMm, mL, mR);
  const my = mapper(H, heightMm, mB, mT);

  const parts = model.parts.map((p): CustomPart => {
    const s = shapeOf(p);
    if (!s) return p;
    if (s.type === 'sheet') {
      const x0 = mx(p.x); const x1 = mx(p.x + p.lengthMm); const y0 = my(p.y); const y1 = my(p.y + (p.heightMm ?? 0));
      return { ...p, x: r3(x0), y: r3(y0), lengthMm: r3(x1 - x0), heightMm: r3(y1 - y0) };
    }
    if (s.type === 'piece') return { ...p, x: r3(mx(p.x)), y: r3(my(p.y)) };
    const rad = (p.angleDeg * Math.PI) / 180;
    const ex = p.x + p.lengthMm * Math.cos(rad); const ey = p.y + p.lengthMm * Math.sin(rad);
    const x0 = mx(p.x); const y0 = my(p.y); const x1 = mx(ex); const y1 = my(ey);
    if (isH(p)) return { ...p, x: r3(x0), y: r3(y0), lengthMm: r3(Math.abs(x1 - x0)) }; // početak ostaje početak (i kod ugla 180°)
    if (isV(p)) return { ...p, x: r3(x0), y: r3(y0), lengthMm: r3(Math.abs(y1 - y0)) };
    // kosi deo: krajevi se pomeraju, a dužina i ugao se računaju iznova
    return { ...p, x: r3(x0), y: r3(y0), lengthMm: r3(Math.hypot(x1 - x0, y1 - y0)), angleDeg: r3((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI) };
  });
  return { ...model, widthMm, heightMm, parts };
}
