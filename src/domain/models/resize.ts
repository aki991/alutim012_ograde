import { partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape, sectionFace, type MatShape } from './materialShape';
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

/** polje uže od ovoga (mm) nije polje za razvlačenje: smatra se delom krutog bloka */
const MIN_FIELD_MM = 50;

/**
 * Polja između uspravnih „krutih“ delova (ram, U profili, razdelne cevi): kruti delovi zadržavaju tačnu širinu i samo se pomeraju,
 * a nova širina se deli na polja između njih podjednako (tri polja rastu za isti iznos). Unutar krutog dela pomeraj je isti za
 * svaku tačku, pa prečke koje ulaze u U profil ostaju u njemu na istoj dubini; unutar polja se razvlači linearno.
 */
export function pieceMapper(size: number, newSize: number, rigid: [number, number][]): ((c: number) => number) | null {
  const all = [[0, 0], ...rigid, [size, size]].map(([lo, hi]) => [Math.max(0, lo), Math.min(size, hi)] as [number, number]).sort((p, q) => p[0] - q[0]);
  const R: [number, number][] = [];
  // dodirnuti blokovi i polja uža od MIN_FIELD_MM čine jedan kruti blok
  for (const iv of all) { const last = R[R.length - 1]; if (last && iv[0] <= last[1] + MIN_FIELD_MM - 1e-9) last[1] = Math.max(last[1], iv[1]); else R.push([iv[0], iv[1]]); }
  const n = R.length - 1;
  if (n < 1) return null;
  const d = newSize - size;
  const add = d / n;
  const gaps = Array.from({ length: n }, (_, j) => R[j + 1][0] - R[j][1]);
  if (gaps.some((g) => g + add < 1)) return null;
  const ns: number[] = [0];
  for (let j = 0; j < n; j++) ns.push(ns[j] + (R[j][1] - R[j][0]) + gaps[j] + add);
  return (c) => {
    if (c <= 0) return c;
    if (c >= size) return c + d;
    for (let j = 0; j <= n; j++) {
      if (c >= R[j][0] && c <= R[j][1]) return ns[j] + (c - R[j][0]);
      if (j < n && c > R[j][1] && c < R[j + 1][0]) return ns[j] + (R[j][1] - R[j][0]) + (c - R[j][1]) * ((gaps[j] + add) / gaps[j]);
    }
    return c + d;
  };
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** dodir ili zalazak do ove mere (mm) spaja uspravne delove u jedan kruti blok (npr. U profil uz razdelnu cev) */
const TOUCH_MM = 5;

/** Vodoravni opsezi (x0, x1) uspravnih krutih delova: u njih ulaze krajevi vodoravnih (ram, U profili sa prečkama) ili dodiruju takav deo. */
export function rigidIntervals(model: CustomModel, shapeOf: (p: CustomPart) => MatShape | null): [number, number][] {
  const a = (p: CustomPart): number => ((p.angleDeg % 360) + 360) % 360;
  const isV = (p: CustomPart) => a(p) === 90 || a(p) === 270;
  const isH = (p: CustomPart) => a(p) === 0 || a(p) === 180;
  const linear = model.parts.filter((p) => shapeOf(p)?.type === 'linear');
  const hEnds = linear.filter(isH).flatMap((p) => [p.x, p.x + (a(p) === 0 ? p.lengthMm : -p.lengthMm)]);
  const verts = linear.filter(isV).map((p) => ({ p, b: partBounds(p, shapeOf(p)!) }));
  const rigidSet = new Set(verts.filter((v) => hEnds.some((e) => e >= v.b.x0 - 1 && e <= v.b.x1 + 1)).map((v) => v.p.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const v of verts) {
      if (rigidSet.has(v.p.id)) continue;
      if (verts.some((o) => rigidSet.has(o.p.id) && v.b.x0 <= o.b.x1 + TOUCH_MM && v.b.x1 >= o.b.x0 - TOUCH_MM)) { rigidSet.add(v.p.id); changed = true; }
    }
  }
  return verts.filter((v) => rigidSet.has(v.p.id)).map((v): [number, number] => [v.b.x0, v.b.x1]);
}

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
    // letvica koja je u nizu istih (prva i poslednja prečka uz ivicu) nije ram: nosi se po svojoj osi, pa su razmaci u nizu jednaki
    const inRow = model.parts.filter((q) => q.id !== p.id && q.materialId === p.materialId && Math.abs(q.angleDeg - p.angleDeg) < 1e-6 && q.rot === p.rot && Math.abs(q.lengthMm - p.lengthMm) < 1 && (isH(p) ? Math.abs(q.x - p.x) < 1 : Math.abs(q.y - p.y) < 1)).length >= 2;
    if (inRow) continue;
    if (isV(p)) { if (b.x0 < 1) mL = Math.max(mL, b.x1); if (b.x1 > W - 1) mR = Math.max(mR, W - b.x0); }
    if (isH(p)) { if (b.y0 < 1) mB = Math.max(mB, b.y1); if (b.y1 > H - 1) mT = Math.max(mT, H - b.y0); }
  }
  const rigid = rigidIntervals(model, shapeOf);
  // pravilo važi samo kad ima razdelnih (unutrašnjih) krutih blokova; inače je dovoljno staro pravilo (ram uz ivice, niz letvica)
  const interior = rigid.length > 0 && (() => {
    const merged: [number, number][] = [];
    for (const iv of [...rigid].sort((p, q) => p[0] - q[0])) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + TOUCH_MM) last[1] = Math.max(last[1], iv[1]); else merged.push([iv[0], iv[1]]); }
    return merged.some(([lo, hi]) => lo > 1 && hi < W - 1);
  })();
  const piece = interior ? pieceMapper(W, widthMm, rigid) : null;
  const mx = piece ?? mapper(W, widthMm, mL, mR);
  const my = mapper(H, heightMm, mB, mT);

  /**
   * Niz istih letvica (prečke jedna iznad druge, ili uspravne letvice jedna pored druge): razmaci između letvica i razmak od
   * krajnjih letvica do ivice (ili rama) rastu srazmerno, a debljina letvica ostaje. Tako su razmaci uvek jednaki, a niz staje
   * tačno u novu meru (osa letvice se ne razvlači zajedno sa njenom debljinom).
   */
  const rowKey = (p: CustomPart) => [p.materialId, a(p), p.rot, Math.round(p.lengthMm), Math.round(isH(p) ? p.x : p.y)].join('|');
  const rows = new Map<string, CustomPart[]>();
  for (const p of model.parts) { const sh = shapeOf(p); if (sh?.type === 'linear' && (isH(p) || isV(p))) { const k = rowKey(p); rows.set(k, [...(rows.get(k) ?? []), p]); } }
  const rowAxis = new Map<string, number>();
  for (const list of rows.values()) {
    if (list.length < 3) continue;
    const horiz = isH(list[0]);
    if (!horiz && piece) continue; // uspravni delovi idu po krutim blokovima, ne kao niz letvica
    const sh = shapeOf(list[0]);
    if (sh?.type !== 'linear') continue;
    const e = sectionFace(sh.section, list[0].rot + (list[0].tiltDeg ?? 0));
    // položaj preseka oko ose: pod 0° i 270° lokalno u ide u pozitivan smer (y, odnosno x), pod 90° i 180° u suprotan
    const flip = a(list[0]) === 90 || a(list[0]) === 180;
    const lo = flip ? -e.u1 : e.u0; const hi = flip ? -e.u0 : e.u1;
    const axes = list.map((p) => (horiz ? p.y : p.x));
    const L = Math.min(...axes); const U = Math.max(...axes);
    const size = horiz ? H : W; const ns = horiz ? heightMm : widthMm; const m0 = horiz ? mB : mL; const m1 = horiz ? mT : mR;
    const k = (ns - m0 - m1) / Math.max(1e-6, size - m0 - m1);
    const g0 = L + lo - m0; const g1 = size - m1 - (U + hi);
    const L2 = m0 + g0 * k - lo; const U2 = ns - m1 - g1 * k - hi;
    if (!(U2 >= L2) || U - L < 1e-6) continue;
    for (const p of list) rowAxis.set(p.id, L2 + ((horiz ? p.y : p.x) - L) * ((U2 - L2) / (U - L)));
  }

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
    const ra = rowAxis.get(p.id);
    if (isH(p)) return { ...p, x: r3(x0), y: r3(ra ?? y0), lengthMm: r3(Math.abs(x1 - x0)) }; // početak ostaje početak (i kod ugla 180°)
    if (isV(p)) return { ...p, x: r3(ra ?? x0), y: r3(y0), lengthMm: r3(Math.abs(y1 - y0)) };
    // kosi deo: krajevi se pomeraju, a dužina i ugao se računaju iznova
    return { ...p, x: r3(x0), y: r3(y0), lengthMm: r3(Math.hypot(x1 - x0, y1 - y0)), angleDeg: r3((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI) };
  });
  return { ...model, widthMm, heightMm, parts };
}
