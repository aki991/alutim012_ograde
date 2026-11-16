import { partBounds, type CustomModel, type CustomPart } from './custom';
import { hGuidesOf, shapeLookup as shapeLookupFor, type LayoutAuto, type LayoutResult } from './guides';
import { materialShape, type MatShape } from './materialShape';
import { depthRange } from './overlap';
import type { Material } from './types';
import { uid } from '../../utils/id';

/**
 * Raspored uspravnih letvica (tarabica, vertikalne letvice) po širini polja: broj, odstojanje prve od leve ivice, poslednje od desne
 * i razmak između svih letvica (i uskih i širokih). Isto što „Raspored prečki“ radi za vodoravne prečke, samo po vodoravnoj osi.
 * Čepovi tarabica (komadni delovi na vrhu letvice) prate svoju letvicu.
 */

const norm = (a: number): number => ((a % 360) + 360) % 360;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const f = (n: number): string => String(r2(n)).replace('.', ',');

const isVertical = (p: CustomPart): boolean => norm(p.angleDeg) === 90 || norm(p.angleDeg) === 270;

export interface VGroup {
  /** letvice sleva udesno */
  bars: CustomPart[];
  /** širina (vidljiva spreda) svake letvice, istim redom */
  widths: number[];
  /** leva ivica svake letvice */
  lefts: number[];
  /** prostor za letvice: od leve do desne ivice (uspravni ramovi uz ivice ga sužavaju) */
  xLeft: number;
  xRight: number;
}

export function vBarGroup(model: CustomModel, bar: CustomPart, materials: Material[]): VGroup | null {
  const shapeOf = shapeLookupFor(materials);
  const lin = (p: CustomPart): MatShape | null => { const s = shapeOf(p); return s && s.type === 'linear' ? s : null; };
  if (!isVertical(bar) || !lin(bar)) return null;
  const span = (p: CustomPart): [number, number] => [Math.min(p.y, p.y + p.lengthMm), Math.max(p.y, p.y + p.lengthMm)];
  const [b0, b1] = span(bar);
  const bounds = (p: CustomPart) => partBounds(p, lin(p)!);
  const inner = (p: CustomPart): boolean => { const b = bounds(p); return b.x0 > 1 && b.x1 < model.widthMm - 1; };
  // samo letvice u istoj ravni (po dubini): cevi iza ili ispred njih (drugi sloj) ne računaju se
  const myDepth = depthRange(bar, materials);
  const sameLayer = (p: CustomPart): boolean => { const d = depthRange(p, materials); return !myDepth || !d || Math.min(d.z1, myDepth.z1) - Math.max(d.z0, myDepth.z0) > 0.5 * Math.min(d.z1 - d.z0, myDepth.z1 - myDepth.z0); };
  const member = (p: CustomPart): boolean => {
    if (!isVertical(p) || !sameLayer(p) || !lin(p) || norm(p.angleDeg) !== norm(bar.angleDeg)) return false;
    if ((p.guides?.join('|') ?? '') !== (bar.guides?.join('|') ?? '')) return false; // uklopljene u iste vođice, ili sve slobodne
    if (p.materialId === bar.materialId) return Math.abs(p.y - bar.y) < 1 && Math.abs(p.lengthMm - bar.lengthMm) < 1;
    const [a0, a1] = span(p);
    return inner(p) && Math.min(a1, b1) - Math.max(a0, b0) >= 0.7 * Math.min(a1 - a0, b1 - b0);
  };
  const bars = model.parts.filter(member).sort((a, b) => bounds(a).x0 - bounds(b).x0);
  let xLeft = 0; let xRight = model.widthMm;
  // letvice u vodoravnim U profilima: prostor je dužina vođica
  const hg = bar.guides ? hGuidesOf(model, bar, materials) : null;
  if (hg) { xLeft = Math.max(hg[0].x0, hg[1].x0); xRight = Math.min(hg[0].x1, hg[1].x1); }
  for (const p of model.parts) {
    if (member(p) || !isVertical(p) || !lin(p) || !sameLayer(p)) continue;
    const b = bounds(p);
    if (b.x0 < 1) xLeft = Math.max(xLeft, b.x1);
    if (b.x1 > model.widthMm - 1) xRight = Math.min(xRight, b.x0);
  }
  const bs = bars.map(bounds);
  return { bars, widths: bs.map((b) => b.x1 - b.x0), lefts: bs.map((b) => b.x0), xLeft, xRight };
}

export interface VLayoutInfo { H: number; h: number; gapMin: number; count: number; top: number; bottom: number; gap: number | null; lufta: 'sa'; free: true; mixed: boolean }

/** Trenutni raspored: top = odstojanje prve letvice od leve ivice, bottom = poslednje od desne (isti nazivi kao kod prečki). */
export function vLayoutInfo(model: CustomModel, bar: CustomPart, materials: Material[]): VLayoutInfo | null {
  const g = vBarGroup(model, bar, materials);
  if (!g || !g.bars.length) return null;
  const n = g.bars.length;
  const sum = g.widths.reduce((a, b) => a + b, 0);
  const rights = g.lefts.map((l, i) => l + g.widths[i]);
  // razmak = (levi rub poslednje − desni rub prve − širine letvica između) / (n − 1)
  const between = sum - g.widths[0] - g.widths[n - 1];
  const gapExact = n >= 2 ? r2((g.lefts[n - 1] - rights[0] - between) / (n - 1)) : null;
  return {
    H: r2(g.xRight - g.xLeft), h: r2(sum / n), gapMin: 0, count: n, top: r2(g.lefts[0] - g.xLeft), bottom: r2(g.xRight - rights[n - 1]), gap: gapExact,
    lufta: 'sa', free: true, mixed: g.widths.some((w) => Math.abs(w - g.widths[0]) > 1e-6),
  };
}

/* ---------- čepovi tarabica ---------- */

const isCapShape = (s: MatShape | null): boolean => !!s && s.type === 'piece' && s.solids.some((x) => x.prim === 'dome');

/** čep koji stoji na vrhu letvice (komadni deo čepa sa sredinom ispod nje) */
function capOn(model: CustomModel, bar: CustomPart, materials: Material[]): CustomPart | undefined {
  const shapeOf = shapeLookupFor(materials);
  const b = partBounds(bar, shapeOf(bar) as Extract<MatShape, { type: 'linear' }>);
  const cx = (b.x0 + b.x1) / 2;
  return model.parts.find((p) => isCapShape(shapeOf(p)) && Math.abs(p.x - cx) < 2 && Math.abs(p.y - b.y1) < 3);
}

/** Čep tarabice iz cenovnika čija kupola je najbliža širini letvice; null ako takvog materijala nema. */
export function picketCapMaterial(materials: Material[], width: number): Material | null {
  let best: Material | null = null; let bestD = Infinity;
  for (const m of materials) {
    const s = materialShape(m);
    if (!isCapShape(s)) continue;
    const dome = (s as Extract<MatShape, { type: 'piece' }>).solids.find((x) => x.prim === 'dome') as { w: number };
    const d = Math.abs(dome.w - width);
    if (d < bestD) { best = m; bestD = d; }
  }
  return best;
}

/** Da li svaka letvica grupe ima čep na vrhu. */
export function groupHasCaps(model: CustomModel, bar: CustomPart, materials: Material[]): boolean {
  const g = vBarGroup(model, bar, materials);
  return !!g && g.bars.length > 0 && g.bars.every((b) => capOn(model, b, materials));
}

/** Stavlja čep na vrh svake letvice grupe ili ga skida. */
export function setGroupCaps(model: CustomModel, bar: CustomPart, materials: Material[], on: boolean): { model: CustomModel } | { error: string } {
  const g = vBarGroup(model, bar, materials);
  if (!g) return { error: 'Čepovi važe za uspravne letvice.' };
  const shapeOf = shapeLookupFor(materials);
  if (!on) {
    const rm = new Set(g.bars.map((b) => capOn(model, b, materials)?.id).filter((x): x is string => !!x));
    return { model: { ...model, parts: model.parts.filter((p) => !rm.has(p.id)) } };
  }
  const add: CustomPart[] = [];
  for (let i = 0; i < g.bars.length; i++) {
    const b = g.bars[i];
    if (capOn(model, b, materials)) continue;
    const mat = picketCapMaterial(materials, g.widths[i]);
    if (!mat) return { error: 'U cenovniku nema čepa za tarabice (npr. „Čep tarabice pun 80×20 mm“). Dodajte ga u Materijali i cene.' };
    const bb = partBounds(b, shapeOf(b) as Extract<MatShape, { type: 'linear' }>);
    add.push({ id: uid('part'), materialId: mat.id, x: (bb.x0 + bb.x1) / 2, y: bb.y1, lengthMm: 0, angleDeg: 0, rot: 0, z: b.z });
  }
  return { model: { ...model, parts: [...model.parts, ...add] } };
}

/* ---------- raspored ---------- */

export function layoutVBars(model: CustomModel, barId: string, materials: Material[], p: { count: number; top: number; bottom: number; gap: number; auto: LayoutAuto; countChange?: boolean }): LayoutResult {
  const sel = model.parts.find((x) => x.id === barId);
  const grp = sel && vBarGroup(model, sel, materials);
  if (!sel || !grp) return { error: 'Raspored važi za uspravne letvice.' };
  const n = Math.round(p.count);
  if (!(n >= 1)) return { error: 'Broj letvica mora biti najmanje 1.' };
  if (n > 200) return { error: 'Najviše 200 letvica.' };
  const len = grp.bars.length;
  const sum = grp.widths.reduce((a, b) => a + b, 0);
  const mixed = grp.widths.some((w) => Math.abs(w - grp.widths[0]) > 1e-6);
  if (mixed && n !== len) return { error: 'Broj letvica ne može da se menja kad su letvice različite širine. Razmak i odstojanja se zadaju za sve letvice zajedno.' };
  const h = sum / len;
  const stack = n === len ? sum : n * h;
  const H = grp.xRight - grp.xLeft;
  const gaps = Math.max(0, n - 1);
  let auto: LayoutAuto = n === 1 && p.auto === 'gap' ? 'bottom' : p.auto;
  let { top, bottom, gap } = p;
  if (n === 1) gap = 0;
  if (p.countChange && n > 1) {
    const maxCount = Math.max(1, Math.floor(H / h + 1e-9));
    if (n > maxCount) return { error: `Operacija nije izvršena: ${n} letvica ne staje u širinu polja (${f(H)} mm), čak ni bez razmaka. Najviše letvica: ${maxCount}.` };
    gap = Math.max(0, gap); if (top < 0) top = 0;
    if (stack + top + gaps * gap > H + 1e-6) {
      const g = (H - top - stack) / gaps;
      if (g >= -1e-6) gap = Math.max(0, g); else { gap = 0; top = Math.max(0, H - stack); }
    }
    auto = 'bottom';
  }
  if (top < 0 || bottom < 0) return { error: 'Odstojanja od leve i desne ivice ne mogu biti negativna.' };
  if (n > 1 && auto !== 'gap' && gap < -1e-6) return { error: `Operacija nije izvršena: razmak ${f(gap)} mm nije moguć, najmanji je 0 mm.` };
  if (auto === 'gap') gap = (H - top - bottom - stack) / Math.max(1, gaps);
  else if (auto === 'bottom') bottom = H - top - stack - gaps * gap;
  else top = H - bottom - stack - gaps * gap;
  const computed = auto === 'gap' ? gap : auto === 'bottom' ? bottom : top;
  if (computed < -1e-6) {
    const need = stack + (auto !== 'top' ? top : 0) + (auto !== 'bottom' ? bottom : 0) + (auto !== 'gap' ? gaps * gap : 0);
    return { error: `Operacija nije izvršena: letvice ne staju u širinu polja. Potrebno je ${f(need)} mm, a širina polja je ${f(H)} mm (nedostaje ${f(need - H)} mm).` };
  }

  // koje letvice ostaju: pri smanjenju broja skidaju se one sa desne strane, izabrana se zadržava
  let keep = grp.bars;
  if (n < keep.length) {
    let drop = keep.length - n;
    const dropIds = new Set<string>();
    for (const b of [...keep].reverse()) { if (drop === 0) break; if (b.id !== sel.id) { dropIds.add(b.id); drop--; } }
    keep = keep.filter((b) => !dropIds.has(b.id));
  }
  const selI = Math.max(0, grp.bars.findIndex((x) => x.id === sel.id));
  const slots: { part: CustomPart; src: CustomPart; w: number; left: number; fresh: boolean }[] = keep.map((b) => ({ part: b, src: b, w: grp.widths[grp.bars.indexOf(b)], left: grp.lefts[grp.bars.indexOf(b)], fresh: false }));
  while (slots.length < n) slots.push({ part: { ...sel, id: uid('part') }, src: sel, w: grp.widths[selI], left: grp.lefts[selI], fresh: true });

  let acc = 0;
  const moved = new Map<string, CustomPart>();
  const capMoves = new Map<string, number>(); // ID čepa → pomeraj po x
  const newCaps: CustomPart[] = [];
  const goneCaps = new Set<string>();
  slots.forEach((s, i) => {
    const left = grp.xLeft + top + acc + i * gap;
    const dx = left - s.left;
    moved.set(s.part.id, { ...s.part, x: Math.round((s.src.x + dx) * 1000) / 1000, ...(s.fresh ? { y: sel.y, lengthMm: sel.lengthMm } : {}) });
    acc += s.w;
    const cap = capOn(model, s.src, materials);
    if (cap) {
      if (s.fresh) newCaps.push({ ...cap, id: uid('part'), x: Math.round((cap.x + dx) * 1000) / 1000 });
      else capMoves.set(cap.id, dx);
    }
  });
  const kept = new Set(keep.map((b) => b.id));
  for (const b of grp.bars) if (!kept.has(b.id)) { const cap = capOn(model, b, materials); if (cap) goneCaps.add(cap.id); }
  const removed = new Set(grp.bars.filter((b) => !kept.has(b.id)).map((b) => b.id));
  const parts = [
    ...model.parts.filter((x) => !removed.has(x.id) && !goneCaps.has(x.id)).map((x) => moved.get(x.id) ?? (capMoves.has(x.id) ? { ...x, x: Math.round((x.x + capMoves.get(x.id)!) * 1000) / 1000 } : x)),
    ...slots.filter((s) => s.fresh).map((s) => moved.get(s.part.id)!),
    ...newCaps,
  ];
  return { model: { ...model, parts }, values: { count: n, top: r2(top), bottom: r2(bottom), gap: n === 1 ? 0 : r2(gap) } };
}
