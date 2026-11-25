import { partAngle, partBounds, sheetPoly, type CustomModel, type CustomPart } from './custom';
import { isFramePart } from './frame';
import { materialShape, sectionFace, type MatShape } from './materialShape';
import { clipProfileByLine, fitProfileCorner } from './profileCuts';
import type { Material } from './types';

/**
 * Odsečen gornji ugao polja (npr. poslednje polje uz kosinu stepeništa, krova ili zida): kosa linija ide od tačke na vrhu polja,
 * `inMm` od ivice, do tačke na ivici polja, `dropMm` ispod vrha.
 */
export interface CornerCut { side: 'left' | 'right'; dropMm: number; inMm: number }

type Pt = [number, number];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/** Mere kosine svedene na polje: kosina ostaje unutar širine i visine platna. */
export function cornerCutLimits(widthMm: number, heightMm: number): { maxDrop: number; maxIn: number } {
  return { maxDrop: Math.max(10, Math.round(heightMm - 20)), maxIn: Math.max(10, Math.round(widthMm - 20)) };
}

interface Lin { p: CustomPart; shape: Extract<MatShape, { type: 'linear' }>; d: Pt; n: Pt; u0: number; u1: number; face: number }

/** Ugao polja sa kosinom: tačke na vrhu i na ivici, i normala ka unutra (od ugla ka platnu). */
function cutGeometry(W: number, H: number, cut: CornerCut) {
  const { maxDrop, maxIn } = cornerCutLimits(W, H);
  const drop = Math.min(Math.max(cut.dropMm, 1), maxDrop); const inn = Math.min(Math.max(cut.inMm, 1), maxIn);
  const right = cut.side === 'right';
  const top: Pt = [right ? W - inn : inn, H];
  const edge: Pt = [right ? W : 0, H - drop];
  const corner: Pt = [right ? W : 0, H];
  const dir = unit(sub(edge, top));
  let m: Pt = [-dir[1], dir[0]];
  if (dot(sub(corner, top), m) > 0) m = [-m[0], -m[1]];
  return { top, edge, corner, dir, m, right };
}

/**
 * Polje sa odsečenim gornjim uglom. Bočni profil na toj strani (U vođica, cev ili deo rama) se skraćuje, a kosinu prati nov profil
 * istog materijala i okretanja, spojen sa bočnim profilom (i sa gornjim delom rama, ako ga ima) pod zajedničkim uglom; bez gornjeg
 * rama kosi profil je na vrhu sečen vodoravno. Ostali delovi ispune se seku po unutrašnjoj ivici kosog profila: prečka koja je ulazila u
 * bočnu U vođicu ulazi isto toliko i u kosu. Deo koji je ceo iznad kosine otpada. Krojna lista i radni nalog se računaju iz ovih delova.
 */
export function applyCornerCut(model: CustomModel, cut: CornerCut | undefined, materials: Material[]): CustomModel {
  if (!cut || !(cut.dropMm > 0) || !(cut.inMm > 0)) return model;
  const W = model.widthMm; const H = model.heightMm;
  const g = cutGeometry(W, H, cut);
  const inside = (q: Pt) => dot(sub(q, g.top), g.m);
  const shapeOf = (p: CustomPart): MatShape | null => { const mat = materials.find((x) => x.id === p.materialId); return mat ? materialShape(mat) : null; };
  const lin = (p: CustomPart): Lin | null => {
    const shape = shapeOf(p);
    if (!shape || shape.type !== 'linear' || p.hw || p.joint3d || p.tube3d) return null;
    const a = p.angleDeg * Math.PI / 180; const d: Pt = [Math.cos(a), Math.sin(a)];
    const f = sectionFace(shape.section, partAngle(p));
    return { p, shape, d, n: [-d[1], d[0]], u0: f.u0, u1: f.u1, face: f.face };
  };
  const corners = (p: CustomPart, shape: MatShape): Pt[] => {
    if (shape.type === 'sheet') return sheetPoly(p) as Pt[];
    const b = partBounds(p, shape);
    return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  };

  // bočni profil na strani kosine: krajnji uspravan profil na toj strani (U vođica, cev, deo rama) koji prolazi kroz visinu tačke na ivici
  const outerX = (l: Lin) => { const b = partBounds(l.p, l.shape); return g.right ? b.x1 : -b.x0; };
  const side = model.parts.map(lin).filter((l): l is Lin => !!l && Math.abs(l.d[0]) < 0.01).filter((l) => {
    const b = partBounds(l.p, l.shape);
    return (g.right ? b.x1 > W * 0.75 : b.x0 < W * 0.25) && b.y1 > g.edge[1] + 0.5 && b.y0 < g.edge[1] - 0.5;
  }).sort((a, b) => outerX(b) - outerX(a) || b.face - a.face)[0];
  // gornji deo rama koji prelazi kosinu
  const top = model.parts.map(lin).find((l): l is Lin => !!l && isFramePart(l.p) && Math.abs(l.d[1]) < 0.01 && Math.abs(partBounds(l.p, l.shape).y1 - H) < 1.5
    && (g.right ? partBounds(l.p, l.shape).x1 > g.top[0] + 0.5 : partBounds(l.p, l.shape).x0 < g.top[0] - 0.5));

  // kosi profil: spoljna ivica na kosini, presek okrenut ka platnu isto kao kod bočnog profila
  let diag: CustomPart | null = null;
  let innerP: Pt = g.top; // tačka na liniji po kojoj se seku ostali delovi
  if (side) {
    const center: Pt = [W / 2, H / 2];
    const inwardN = dot(side.n, sub(center, [side.p.x, side.p.y])) > 0;
    let dd = g.dir; let nd: Pt = [-dd[1], dd[0]];
    if ((dot(nd, g.m) > 0) !== inwardN) { dd = [-dd[0], -dd[1]]; nd = [-nd[0], -nd[1]]; }
    const outer = inwardN ? side.u0 : side.u1;
    const span = Math.hypot(g.top[0] - g.edge[0], g.top[1] - g.edge[1]);
    const ext = side.face * 4;
    const from = dot(dd, sub(g.edge, g.top)) > 0 ? g.top : g.edge;
    const origin = add(add(from, nd, -outer), dd, -ext);
    const { guides: _g, nests: _n, splitOf: _s, cut45: _c, miter: _m, miterEnds: _me, endCuts: _e, endTips: _t, fit: _f, autoGuides: _a, divider: _d, cutStartDeg: _cs, cutEndDeg: _ce, plumbEnds: _pe, ...rest } = side.p;
    diag = { ...rest, id: `${side.p.id}_kosina`, x: origin[0], y: origin[1], angleDeg: Math.atan2(dd[1], dd[0]) * 180 / Math.PI, lengthMm: span + 2 * ext };
    // kosi profil ne izlazi van polja: vodoravno na vrhu, uspravno na ivici
    diag = clipProfileByLine(diag, side.shape, [0, H], [1, 0], [W / 2, 0]);
    const sb = partBounds(side.p, side.shape);
    diag = diag && clipProfileByLine(diag, side.shape, [g.right ? sb.x1 : sb.x0, 0], [0, 1], [W / 2, H / 2]);
    innerP = add(g.top, g.m, side.face);
  }
  const lineDir = g.dir;
  const keep: Pt = [W / 2, 0];

  let parts: CustomPart[] = [];
  for (const p of model.parts) {
    const shape = shapeOf(p);
    if (!shape) { parts.push(p); continue; }
    const l = lin(p);
    if (!l) {
      // okov, ploča, staklo: ostaje ako mu je bar deo ispod kosine
      if (corners(p, shape).some((q) => inside(q) > 0.5)) parts.push(p);
      continue;
    }
    if (side && p.id === side.p.id) { const c = clipProfileByLine(p, l.shape, g.top, lineDir, keep); if (c) parts.push(c); continue; }
    if (top && p.id === top.p.id) { const c = clipProfileByLine(p, l.shape, g.top, lineDir, keep); if (c) parts.push(c); continue; }
    // prečka koja ulazi u bočnu U vođicu ulazi isto toliko i u kosi profil
    let depth = 0;
    if (side) {
      // koordinata preko preseka bočnog profila; unutrašnja ivica je strana ka platnu
      const across = (q: Pt) => dot(sub(q, [side.p.x, side.p.y]), side.n);
      const inward = dot(side.n, sub([W / 2, H / 2], [side.p.x, side.p.y])) > 0 ? 1 : -1;
      const innerOff = inward > 0 ? side.u1 : side.u0;
      const b = partBounds(p, l.shape);
      const pen = Math.max(...([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] as Pt[]).map((q) => inward * (innerOff - across(q))));
      const sb = partBounds(side.p, side.shape);
      if (pen > 0 && b.y1 > sb.y0 && b.y0 < sb.y1) depth = Math.min(pen, side.face);
    }
    const P = side ? add(innerP, g.m, -depth) : g.top;
    const c = clipProfileByLine(p, l.shape, P, lineDir, keep);
    if (c) parts.push(c);
  }
  if (diag) {
    parts.push(diag);
    let m: CustomModel = { ...model, parts };
    for (const other of [side, top]) {
      if (!other) continue;
      const cur = m.parts.find((p) => p.id === other.p.id);
      if (!cur || !m.parts.some((p) => p.id === diag!.id)) continue;
      const r = fitProfileCorner(m, diag.id, other.p.id, materials);
      if (!('error' in r)) m = r.model;
      else {
        // spoj pod uglom nije moguć: bočni ili gornji profil se seče po unutrašnjoj ivici kosog profila
        const c = clipProfileByLine(cur, other.shape, innerP, lineDir, keep);
        m = { ...m, parts: m.parts.flatMap((p) => p.id !== cur.id ? [p] : c ? [c] : []) };
      }
    }
    parts = m.parts;
  }
  return { ...model, parts };
}

/** Parametri bez odsečenog ugla: kosina pripada samo polju na kome je zadata, ne prenosi se na nov, dupliran ni susedni element. */
export function withoutCornerCut<T extends { slats?: { cornerCut?: CornerCut } }>(params: T): T {
  if (!params.slats?.cornerCut) return params;
  const { cornerCut: _c, ...slats } = params.slats;
  return { ...params, slats: Object.keys(slats).length ? slats : undefined };
}

/** Kapija nema odsečen ugao (nudi se samo na polju ograde); kosina koju je kapija ranije preuzela od ograde se uklanja. */
export function stripGateCornerCuts<P extends { items: Item[] }, Item extends { kind: string }>(p: P): P {
  if (!p.items.some((it) => it.kind === 'gate' && (it as { params?: { slats?: { cornerCut?: CornerCut } } }).params?.slats?.cornerCut)) return p;
  return { ...p, items: p.items.map((it) => {
    const params = (it as { params?: { slats?: { cornerCut?: CornerCut } } }).params;
    return it.kind === 'gate' && params?.slats?.cornerCut ? { ...it, params: withoutCornerCut(params) } : it;
  }) };
}
