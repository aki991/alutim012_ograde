import { partAngle, partBounds, type CustomModel, type CustomPart } from './custom';
import { barLayoutInfo, guideReport, type BarLayoutValues } from './guides';
import { materialShape, rotateDeg, type MatShape } from './materialShape';
import type { Material } from './types';

/**
 * Podaci za skicu sa kotama: šta majstor treba da vidi da ništa ne meri ručno. Delovi iste vrste dobijaju istu poziciju (boju i broj),
 * a kote su lanci mera: odstojanje prve prečke od vrha, visine, razmaci između prečki (i negativni kad se nagnute prečke uvlače
 * jedna u drugu), odstojanje poslednje od poda; isto po širini za uspravne delove. Sve mere su u mm, y raste nagore od poda.
 */

export const POSITION_COLORS = ['#fca5a5', '#93c5fd', '#86efac', '#fcd34d', '#c4b5fd', '#fdba74', '#67e8f9', '#f9a8d4', '#bef264', '#a5b4fc'];

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;
export const fmtNum = (n: number, d = 1): string => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',').replace(/^-/, '−');

export interface ChainDim { a: number; b: number; value: number; kind: 'offset' | 'gap' }
export interface RowDim { x0: number; x1: number; value: number; row: number }
export interface ColDim { y0: number; y1: number; value: number; col: number }

export interface SketchPosition {
  no: number;
  color: string;
  materialId: string;
  name: string;
  sku: string;
  kind: MatShape['type'];
  /** presek profila (npr. 80 × 20) ili mere ploče */
  section: string;
  /** dužina profila (mm) ili širina × visina ploče */
  length: string;
  /** ugao ose (ako nije vodoravno ni uspravno) i nagib preseka */
  angle: string;
  count: number;
  firstId: string;
  partIds: string[];
}

export interface SketchGroup {
  bar: CustomPart;
  lufta: 'sa' | 'bez';
  material: string;
  section: string;
  count: number;
  values: BarLayoutValues & { H: number; h: number };
  /** korak osa–osa susednih prečki (visina + razmak) */
  pitch: number | null;
  opening: number;
  fitDeg: number;
  tiltDeg: number;
}

export interface Sketch {
  widthMm: number;
  heightMm: number;
  positions: SketchPosition[];
  noOf: Map<string, number>;
  left: ChainDim[];
  bottom: ChainDim[];
  top: RowDim[];
  right: ColDim[];
  oblique: { id: string; x: number; y: number; angleDeg: number; text: string }[];
  groups: SketchGroup[];
  /** mesta zavarivanja: visina od poda do gornje linije naleganja svake prečke uklopljene u bočni U profil, odozgo naniže */
  welds: { id: string; y: number; value: number }[];
  /** delovi čiji je materijal obrisan iz cenovnika */
  missing: number;
}

interface Item { p: CustomPart; shape: MatShape; mat: Material | undefined; b: { x0: number; y0: number; x1: number; y1: number }; orient: 'h' | 'v' | 'o' | 'sheet' | 'piece' }

const mod180 = (d: number): number => ((d % 180) + 180) % 180;

/** Raspoređuje intervale u redove (kolone) tako da se u istom redu ne preklapaju. */
function allocate<T extends { lo: number; hi: number }>(items: T[], gap = 0): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].lo - items[b].lo);
  const ends: number[] = [];
  const out = new Array<number>(items.length).fill(0);
  for (const i of order) {
    let r = 0;
    while (r < ends.length && items[i].lo < ends[r] + gap) r += 1;
    ends[r] = items[i].hi;
    out[i] = r;
  }
  return out;
}

const unique = <T,>(items: T[], key: (t: T) => string): T[] => { const seen = new Set<string>(); return items.filter((t) => { const k = key(t); if (seen.has(k)) return false; seen.add(k); return true; }); };

/** Lanac mera po jednoj osi: odstojanje od početka, razmaci između susednih delova (i negativni kad se preklapaju), odstojanje od kraja. */
function chain(intervals: { lo: number; hi: number }[], total: number, topDown: boolean): ChainDim[] {
  const iv = unique(intervals.map((i) => ({ lo: r1(i.lo), hi: r1(i.hi) })), (i) => `${i.lo}|${i.hi}`);
  if (!iv.length) return [];
  const out: ChainDim[] = [];
  // od početka (vrh odozgo / levo): sortirano po početku; razmak = početak sledećeg − kraj prethodnog
  const sorted = [...iv].sort((p, q) => (topDown ? q.hi - p.hi : p.lo - q.lo));
  const first = topDown ? total - sorted[0].hi : sorted[0].lo;
  const minLo = Math.min(...iv.map((i) => i.lo)); const maxHi = Math.max(...iv.map((i) => i.hi));
  const last = topDown ? minLo : total - maxHi;
  const push = (a: number, b: number, value: number, kind: ChainDim['kind']) => { if (Math.abs(value) >= 0.05) out.push({ a: Math.min(a, b), b: Math.max(a, b), value: r1(value), kind }); };
  if (topDown) {
    push(sorted[0].hi, total, first, 'offset');
    for (let i = 1; i < sorted.length; i++) push(sorted[i - 1].lo, sorted[i].hi, sorted[i - 1].lo - sorted[i].hi, 'gap');
    push(0, minLo, last, 'offset');
  } else {
    push(0, sorted[0].lo, first, 'offset');
    for (let i = 1; i < sorted.length; i++) push(sorted[i - 1].hi, sorted[i].lo, sorted[i].lo - sorted[i - 1].hi, 'gap');
    push(maxHi, total, last, 'offset');
  }
  return out;
}

/**
 * Gornja unutrašnja linija preseka prečke u pogledu spreda — druga po visini među uglovima preseka. Kod nagnutog preseka
 * najviši ugao viri iznad ivice U profila, a prečka naleže (i vari se) na liniju ispod njega, koja je na crtežu tanka linija
 * unutar prečke. Kod uspravnog preseka (bez nagiba) nema takve linije, pa je to gornja ivica. `top` je najviša tačka preseka.
 */
export function contactTopY(p: CustomPart, shape: MatShape, top: number): number {
  if (shape.type !== 'linear') return top;
  const c = Math.cos((p.angleDeg * Math.PI) / 180);
  const ys = [...new Set(shape.section.polys.flatMap((poly) => poly.outline.map((pt) => Math.round((p.y + rotateDeg(pt, partAngle(p))[0] * c) * 1000) / 1000)))].sort((a, b) => b - a);
  return ys.length >= 4 ? ys[1] : top;
}

export function buildSketch(model: CustomModel, materials: Material[]): Sketch {
  const byId = new Map(materials.map((m) => [m.id, m]));
  let missing = 0;
  const items: Item[] = model.parts.map((p) => {
    const mat = byId.get(p.materialId);
    if (!mat) missing += 1;
    const shape = mat ? materialShape(mat) : materialShape({ sku: '', name: p.heightMm ? 'ploča' : 'profil 40x20', unit: p.heightMm ? 'm2' : 'm', category: 'ostalo' });
    const b = partBounds(p, shape);
    const a = mod180(p.angleDeg);
    const orient: Item['orient'] = shape.type === 'sheet' ? 'sheet' : shape.type === 'piece' ? 'piece' : a < 1e-6 || Math.abs(a - 180) < 1e-6 ? 'h' : Math.abs(a - 90) < 1e-6 ? 'v' : 'o';
    return { p, shape, mat, b, orient };
  });

  // redosled pozicija: uspravni delovi sleva nadesno, vodoravni odozgo naniže, ploče, komadni delovi, kosi delovi
  const rank = (i: Item) => (i.orient === 'v' ? 0 : i.orient === 'h' ? 1 : i.orient === 'sheet' ? 2 : i.orient === 'piece' ? 3 : 4);
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || (a.orient === 'v' ? a.b.x0 - b.b.x0 : b.b.y1 - a.b.y1 || a.b.x0 - b.b.x0));

  const positions: SketchPosition[] = [];
  const noOf = new Map<string, number>();
  const keyOf = new Map<string, SketchPosition>();
  for (const it of sorted) {
    const { p, shape, mat } = it;
    const key = [p.materialId, r1(p.lengthMm), r1(p.angleDeg), p.rot % 180, p.tiltDeg ?? 0, p.heightMm ?? '', p.cut45 ? 45 : 0].join('|');
    let pos = keyOf.get(key);
    if (!pos) {
      const tilt = p.tiltDeg ? `nagib ${fmtNum(Math.abs(p.tiltDeg), 2)}°` : '';
      const axis = it.orient === 'o' ? `ugao ${fmtNum(p.angleDeg, 1)}°` : '';
      pos = {
        no: positions.length + 1, color: POSITION_COLORS[positions.length % POSITION_COLORS.length], materialId: p.materialId,
        name: mat?.name ?? 'Materijal je obrisan iz cenovnika', sku: mat?.sku ?? '—', kind: shape.type,
        section: shape.type === 'linear' ? `${fmtNum(shape.section.w, 1)} × ${fmtNum(shape.section.h, 1)}` : shape.type === 'sheet' ? `debljina ${fmtNum(shape.thick, 0)}` : '—',
        length: shape.type === 'linear' ? fmtNum(p.lengthMm, 1) : shape.type === 'sheet' ? `${fmtNum(p.lengthMm, 0)} × ${fmtNum(p.heightMm ?? 0, 0)}` : '—',
        angle: [axis, tilt, p.cut45 && shape.type === 'linear' ? 'rez 45°' : ''].filter(Boolean).join(', ') || '—', count: 0, firstId: p.id, partIds: [],
      };
      keyOf.set(key, pos); positions.push(pos);
    }
    pos.count += 1; pos.partIds.push(p.id); noOf.set(p.id, pos.no);
  }

  const H = model.heightMm; const W = model.widthMm;
  const hor = items.filter((i) => i.orient === 'h' || i.orient === 'sheet');
  const ver = items.filter((i) => i.orient === 'v' || i.orient === 'sheet');
  const left = chain(hor.map((i) => ({ lo: i.b.y0, hi: i.b.y1 })), H, true);
  const bottom = chain(ver.map((i) => ({ lo: i.b.x0, hi: i.b.x1 })), W, false);

  // gornje kote: dužine vodoravnih delova i širine uspravnih (po jedna za svaku različitu meru)
  const topRaw = [
    ...unique(items.filter((i) => i.orient === 'h'), (i) => `${r1(i.b.x0)}|${r1(i.b.x1)}`).map((i) => ({ lo: i.b.x0, hi: i.b.x1, value: r1(i.b.x1 - i.b.x0) })),
    ...unique(items.filter((i) => i.orient === 'v'), (i) => String(r1(i.b.x1 - i.b.x0))).map((i) => ({ lo: i.b.x0, hi: i.b.x1, value: r1(i.b.x1 - i.b.x0) })),
  ];
  const topRows = allocate(topRaw);
  const top: RowDim[] = topRaw.map((t, i) => ({ x0: t.lo, x1: t.hi, value: t.value, row: topRows[i] }));

  // desne kote: dužine uspravnih delova i vidljive visine vodoravnih (po jedna za svaku različitu meru)
  const rightRaw = [
    ...unique(items.filter((i) => i.orient === 'v'), (i) => `${r1(i.b.y0)}|${r1(i.b.y1)}`).map((i) => ({ lo: i.b.y0, hi: i.b.y1, value: r1(i.b.y1 - i.b.y0) })),
    ...unique(items.filter((i) => i.orient === 'h'), (i) => String(r1(i.b.y1 - i.b.y0))).map((i) => ({ lo: i.b.y0, hi: i.b.y1, value: r1(i.b.y1 - i.b.y0) })),
  ];
  const rightCols = allocate(rightRaw);
  const right: ColDim[] = rightRaw.map((t, i) => ({ y0: t.lo, y1: t.hi, value: t.value, col: rightCols[i] }));

  const oblique = items.filter((i) => i.orient === 'o').map((i) => ({ id: i.p.id, x: (i.b.x0 + i.b.x1) / 2, y: (i.b.y0 + i.b.y1) / 2, angleDeg: i.p.angleDeg, text: `${fmtNum(i.p.lengthMm, 1)} mm · ${fmtNum(i.p.angleDeg, 1)}°` }));

  // prečke u bočnim U profilima: raspored, korak, ugao uklapanja
  const groups: SketchGroup[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const g = it.p.guides;
    if (!g || it.shape.type !== 'linear') continue;
    const key = `${g[0]}|${g[1]}|${it.p.materialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = barLayoutInfo(model, it.p, materials); const rep = guideReport(model, it.p, materials);
    if (!info || !rep) continue;
    const gap = info.gap ?? 0;
    groups.push({
      bar: it.p, lufta: info.lufta, material: it.mat?.name ?? '—', section: `${fmtNum(it.shape.section.w, 1)} × ${fmtNum(it.shape.section.h, 1)}`, count: info.count,
      values: { count: info.count, top: info.top, bottom: info.bottom, gap, H: info.H, h: info.h },
      pitch: info.count >= 2 ? r2(info.h + gap) : null, opening: r2(rep.opening), fitDeg: r2(rep.fit.plus), tiltDeg: r2(Math.abs(it.p.tiltDeg ?? 0)),
    });
  }
  // gornja linija na kojoj prečka naleže na ivicu bočnog U profila, merena od poda: tu se prečka vari
  const welds = items.filter((i) => i.p.guides && i.shape.type === 'linear').map((i) => { const y = contactTopY(i.p, i.shape, i.b.y1); return { id: i.p.id, y, value: r1(y) }; }).sort((a, b) => b.y - a.y);
  return { widthMm: W, heightMm: H, positions, noOf, left, bottom, top, right, oblique, groups, welds, missing };
}
