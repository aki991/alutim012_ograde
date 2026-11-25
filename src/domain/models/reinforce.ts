import { partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape, sectionFace } from './materialShape';
import { suggestFrameMaterial } from './gateFrame';
import type { Material } from './types';

/**
 * Ojačanje platna kvadratnim cevima: uspravne cevi dele široko platno na više manjih (automatski na svakih 2,5 m širine), a vodoravna
 * cev deli platno po visini i spaja se sa bočnim stranama (ramom ili U vođicama). Važi za polje ograde i krilo kapije nacrtanog modela.
 */
export interface Reinforce {
  /** broj uspravnih cevi; bez vrednosti automatski (jedna manje od broja delova širine do 2,5 m), 0 = bez uspravnih cevi */
  vCount?: number;
  /** visine osa vodoravnih cevi od dna ispune (mm); bez vrednosti nema vodoravnih cevi */
  hYs?: number[];
  /** materijal cevi (kvadratna cev iz cenovnika); bez izbora program predlaže cev po dubini modela */
  materialId?: string;
}

/** najveća širina platna bez uspravne cevi (mm) */
export const MAX_SPAN_MM = 2500;

export const autoVerticalCount = (widthMm: number): number => (widthMm > MAX_SPAN_MM ? Math.ceil(widthMm / MAX_SPAN_MM) - 1 : 0);

export interface ReinforceRow { key: string; name: string; materialId: string; qty: number; lengthMm: number; role: string }

export interface ReinforcePlan {
  parts: CustomPart[]; rows: ReinforceRow[]; inner: { x0: number; y0: number; x1: number; y1: number }; materialId: string | null; vCount: number;
  /** širina uspravne cevi u prednjem pogledu (mm) */ tubeW: number;
  /** koliko dužine prečke odnosi jedna uspravna cev sa svojim U profilima (širina cevi + oba U profila − ulazak prečke u njih) */ gapW: number;
  /** ID-ovi vodoravnih delova koje uspravne cevi seku i njihovi komadi (početak, kraj ose) */ cuts: Map<string, [number, number][]>;
  /** U vođice svakog komada prečke (leva, desna), kad platno ima bočne U profile */ pieceGuides: Map<string, [string, string][]>;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Unutrašnjost platna: ono što ostane kad se oduzmu ram ili bočne U vođice (uz levu i desnu ivicu) i ram uz gornju i donju ivicu. */
export function innerRegion(m: Pick<CustomModel, 'parts' | 'widthMm' | 'heightMm'>, materials: Material[]): { x0: number; y0: number; x1: number; y1: number } {
  const W = m.widthMm; const H = m.heightMm;
  let x0 = 0; let x1 = W; let y0 = 0; let y1 = H;
  for (const p of m.parts) {
    const mat = materials.find((x) => x.id === p.materialId);
    const sh = mat ? materialShape(mat) : null;
    if (!sh || sh.type !== 'linear') continue;
    const a = ((p.angleDeg % 180) + 180) % 180;
    const b = partBounds(p, sh);
    if (Math.abs(a - 90) < 0.5 && p.lengthMm >= H * 0.9) {
      if (b.x0 <= 1) x0 = Math.max(x0, b.x1); else if (b.x1 >= W - 1) x1 = Math.min(x1, b.x0);
    } else if ((a < 0.5 || a > 179.5) && p.lengthMm >= W * 0.9 && !p.guides?.length) {
      if (b.y0 <= 1) y0 = Math.max(y0, b.y1); else if (b.y1 >= H - 1) y1 = Math.min(y1, b.y0);
    }
  }
  return { x0, y0, x1: Math.max(x1, x0), y1: Math.max(y1, y0) };
}

/**
 * Crtež bez ojačanja koje je program ugradio u crtež kapije (cevi `rf_…` i prečke presečene na njima, `…_c1`, `…_c2` …): cevi se uklanjaju,
 * a komadi iste prečke se ponovo spajaju u celu prečku vezanu za svoje U vođice. Projekat zatim cevi računa za stvarnu širinu krila
 * (crtež nacrtan na 3 m sa jednom cevi na krilu od 10 m dobija tri cevi). Isti crtež kad u njemu nema ugrađenog ojačanja.
 */
export function unbakeReinforce(m: CustomModel): CustomModel {
  if (!m.parts?.some((p) => p.id.startsWith('rf_') || /_c\d+$/.test(p.id))) return m;
  const groups = new Map<string, CustomPart[]>();
  for (const p of m.parts) {
    const k = /^(.*)_c\d+$/.exec(p.id)?.[1];
    if (k && Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) < 0.01) groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const merged = new Map<string, CustomPart>();
  for (const [k, ps] of groups) {
    const sorted = [...ps].sort((a, b) => a.x - b.x);
    const first = sorted[0]; const last = sorted[sorted.length - 1];
    const guides = first.nests && last.nests && first.nests[0] !== last.nests[last.nests.length - 1] ? [first.nests[0], last.nests[last.nests.length - 1]] as [string, string] : undefined;
    const { nests: _n, ...rest } = first;
    merged.set(first.id, { ...rest, id: k, lengthMm: r1(last.x + last.lengthMm - first.x), ...(guides ? { guides } : {}) });
  }
  const parts: CustomPart[] = [];
  for (const p of m.parts) {
    if (p.id.startsWith('rf_')) continue;
    const k = /^(.*)_c\d+$/.exec(p.id)?.[1];
    if (k && groups.has(k)) { const mp = merged.get(p.id); if (mp) parts.push(mp); continue; }
    parts.push(p);
  }
  return { ...m, parts };
}

/**
 * Plan ojačanja za već razvučen crtež `scaled`: delovi (uspravne cevi celom unutrašnjom visinom, vodoravne između njih i bočnih strana)
 * i redovi za krojnu listu. Kvadratna cev se bira iz `cfg.materialId`, inače po dubini modela.
 */
export function planReinforce(scaled: CustomModel, cfg: Reinforce | undefined, materials: Material[]): ReinforcePlan | null {
  // crtež još ima ugrađeno ojačanje (crtanje kapije): ne dodaje se drugo preko njega (u projektu se ugrađeno prvo ukloni, unbakeReinforce)
  if (scaled.parts.some((p) => p.id.startsWith('rf_'))) return null;
  const inner = innerRegion(scaled, materials);
  const vCount = Math.max(0, Math.round(cfg?.vCount ?? autoVerticalCount(scaled.widthMm)));
  const ys = cfg?.hYs ?? [];
  if (!vCount && !ys.length) return null;
  const mat = (cfg?.materialId ? materials.find((m) => m.id === cfg.materialId) : undefined) ?? suggestFrameMaterial(scaled, materials);
  const shape = mat ? materialShape(mat) : null;
  if (!mat || shape?.type !== 'linear') return null;
  const e = sectionFace(shape.section, 0);
  const fw = e.face; const mid = (e.u0 + e.u1) / 2;
  const parts: CustomPart[] = [];
  const rows: ReinforceRow[] = [];
  const iw = inner.x1 - inner.x0; const ih = inner.y1 - inner.y0;
  if (iw <= 0 || ih <= 0) return null;
  // vodoravni delovi koje uspravne cevi seku (ispuna koja prolazi kroz platno, ne ram uz ivicu)
  const cross = scaled.parts.filter((p) => {
    const sh = materialShape(materials.find((x) => x.id === p.materialId) ?? mat);
    if (sh.type !== 'linear' || p.cut45) return false;
    const a = ((p.angleDeg % 180) + 180) % 180;
    if (a > 0.5 && a < 179.5) return false;
    const b = partBounds(p, sh);
    return b.x1 - b.x0 > iw * 0.5 && b.y0 > 1 && b.y1 < scaled.heightMm - 1;
  });
  // cevi dele raspon prečki na jednake delove (prečke ulaze u bočne U vođice, pa je raspon prečke veći od unutrašnjosti)
  const ref = cross.reduce<{ x0: number; x1: number } | null>((best, p) => {
    const sh = materialShape(materials.find((x) => x.id === p.materialId) ?? mat);
    if (sh.type !== 'linear') return best;
    const b = partBounds(p, sh);
    return !best || b.x1 - b.x0 > best.x1 - best.x0 ? { x0: b.x0, x1: b.x1 } : best;
  }, null);
  const sx0 = ref?.x0 ?? inner.x0; const sx1 = ref?.x1 ?? inner.x1;
  const centers = Array.from({ length: vCount }, (_, i) => sx0 + ((sx1 - sx0) * (i + 1)) / (vCount + 1));
  centers.forEach((xc, i) => parts.push({ id: `rf_v${i + 1}`, materialId: mat.id, x: r1(xc + mid), y: r1(inner.y0), lengthMm: r1(ih), angleDeg: 90, rot: 0, z: 0 }));
  if (vCount) rows.push({ key: 'v', name: 'Ojačanje — uspravna cev', materialId: mat.id, qty: vCount, lengthMm: r1(ih), role: 'Ojačanje — uspravna cev' });
  // Uspravna cev pravi dva platna: sa obe njene strane stoji isti U profil kao bočne vođice platna (levo kopija desne, desno kopija leve),
  // a prečke u njih ulaze isto koliko i u bočne.
  const boundsOf = (p: CustomPart) => { const sh = materialShape(materials.find((x) => x.id === p.materialId) ?? mat); return sh.type === 'linear' ? partBounds(p, sh) : null; };
  // vođice prečke: zapisane (`guides`) ili uspravni profil u koji prečka ulazi krajem
  // (samo U profili: prečka u njih ulazi ili do njih dolazi; ram i druge cevi nisu vođice platna)
  const isU = (p: CustomPart) => { const m = materials.find((x) => x.id === p.materialId); const sh = m ? materialShape(m) : null; return !!sh && sh.type === 'linear' && !!sh.u; };
  const verticals = scaled.parts.filter((p) => !p.cut45 && !p.id.startsWith('rf_') && Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.99 && isU(p));
  const guidesOf = (p: CustomPart): [string, string] | null => {
    if (p.guides?.length === 2) return p.guides;
    const b = boundsOf(p); if (!b) return null;
    const hit = (x: number, left: boolean) => verticals.find((v) => { const q = boundsOf(v); return !!q && q.y0 < b.y1 - 0.5 && q.y1 > b.y0 + 0.5 && (left ? x >= q.x0 - 0.01 && x <= q.x1 + 0.5 : x >= q.x0 - 0.5 && x <= q.x1 + 0.01); });
    const l = hit(b.x0, true); const r = hit(b.x1, false);
    return l && r && l.id !== r.id ? [l.id, r.id] : null;
  };
  const sideIds = new Map(cross.map((p) => [p.id, guidesOf(p)]));
  const pairs = new Map<string, number>();
  for (const g of sideIds.values()) if (g) pairs.set(g.join('|'), (pairs.get(g.join('|')) ?? 0) + 1);
  const pair = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0].split('|');
  const sideL = pair ? scaled.parts.find((p) => p.id === pair[0]) : undefined;
  const sideR = pair ? scaled.parts.find((p) => p.id === pair[1]) : undefined;
  const Lb = sideL ? boundsOf(sideL) : null; const Rb = sideR ? boundsOf(sideR) : null;
  const guided = !!(vCount && sideL && sideR && Lb && Rb && Lb.x1 <= Rb.x0);
  const Lw = guided ? Lb!.x1 - Lb!.x0 : 0; const Rw = guided ? Rb!.x1 - Rb!.x0 : 0;
  if (guided) {
    // ceo stub vođica (i komadi presečeni vodoravnim ojačanjem) se kopira
    const column = (side: CustomPart, b: { x0: number; x1: number }) => scaled.parts.filter((p) => {
      if (p.materialId !== side.materialId || Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) < 0.99) return false;
      const q = boundsOf(p); return !!q && Math.abs(q.x0 - b.x0) < 0.5 && Math.abs(q.x1 - b.x1) < 0.5;
    });
    const copy = (p: CustomPart, id: string, dx: number): CustomPart => {
      const { guides: _g, nests: _n, splitOf: _s, fit: _f, autoGuides: _a, ...rest } = p;
      return { ...rest, id, x: r1(p.x + dx) };
    };
    const len = new Map<number, number>();
    centers.forEach((xc, i) => {
      column(sideR!, Rb!).forEach((p, k) => { parts.push(copy(p, `rf_u${i + 1}_l${k ? k + 1 : ''}`, xc - fw / 2 - Rb!.x1)); len.set(p.lengthMm, (len.get(p.lengthMm) ?? 0) + 1); });
      column(sideL!, Lb!).forEach((p, k) => { parts.push(copy(p, `rf_u${i + 1}_r${k ? k + 1 : ''}`, xc + fw / 2 - Lb!.x0)); len.set(p.lengthMm, (len.get(p.lengthMm) ?? 0) + 1); });
    });
    [...len.entries()].forEach(([l, n], i) => rows.push({ key: `u${i}`, name: 'Bočni U profil uz uspravnu cev', materialId: sideR!.materialId, qty: n, lengthMm: r1(l), role: 'Bočni U profil uz uspravnu cev' }));
  }
  // vodoravne cevi: komad između dve uspravne cevi, odnosno između uspravne cevi i bočne strane
  const edges: [number, number][] = [];
  let from = inner.x0;
  for (const xc of centers) { edges.push([from, xc - fw / 2 - Rw]); from = xc + fw / 2 + Lw; }
  edges.push([from, inner.x1]);
  const segs = edges.filter(([a, b]) => b - a > 1);
  ys.forEach((yc, j) => {
    const y = Math.min(Math.max(yc, inner.y0 + fw / 2), inner.y1 - fw / 2);
    segs.forEach(([a, b], k) => parts.push({ id: `rf_h${j + 1}_${k + 1}`, materialId: mat.id, x: r1(a), y: r1(y - mid), lengthMm: r1(b - a), angleDeg: 0, rot: 0, z: 0 }));
  });
  // krojna lista: komadi iste dužine su jedna stavka
  const lens = new Map<number, number>();
  for (const p of parts.filter((q) => q.id.startsWith('rf_h'))) lens.set(p.lengthMm, (lens.get(p.lengthMm) ?? 0) + 1);
  [...lens.entries()].forEach(([len, n], i) => rows.push({ key: `h${i}`, name: 'Ojačanje — vodoravna cev', materialId: mat.id, qty: n, lengthMm: len, role: 'Ojačanje — vodoravna cev' }));
  // komadi prečki koje cevi seku
  const cuts = new Map<string, [number, number][]>();
  const pieceGuides = new Map<string, [string, string][]>();
  let gapW = fw;
  if (vCount) {
    for (const p of cross) {
      const sh = materialShape(materials.find((x) => x.id === p.materialId) ?? mat);
      if (sh.type !== 'linear') continue;
      const b = partBounds(p, sh);
      const pieces: [number, number][] = [];
      const sides = sideIds.get(p.id);
      const inGuides = guided && sides?.[0] === sideL!.id && sides?.[1] === sideR!.id;
      // prečka ulazi u U profil uz cev isto koliko i u bočni: u levi (kopija desne vođice) koliko u desnu, u desni koliko u levu
      const insL = inGuides ? Lb!.x1 - b.x0 : 0; const insR = inGuides ? b.x1 - Rb!.x0 : 0;
      const before = inGuides ? Rw - insR : 0; const after = inGuides ? Lw - insL : 0;
      const ids: [string, string][] = [];
      let s = b.x0; let left = sides?.[0] ?? '';
      centers.forEach((xc, i) => {
        if (xc - fw / 2 - before > s + 0.5 && xc + fw / 2 + after < b.x1 - 0.5) {
          pieces.push([s, xc - fw / 2 - before]); ids.push([left, `rf_u${i + 1}_l`]);
          s = xc + fw / 2 + after; left = `rf_u${i + 1}_r`;
        }
      });
      pieces.push([s, b.x1]); ids.push([left, sides?.[1] ?? '']);
      if (pieces.length > 1) { cuts.set(p.id, pieces); if (inGuides) { pieceGuides.set(p.id, ids); gapW = fw + before + after; } }
    }
  }
  return { parts, rows, inner, materialId: mat.id, vCount, tubeW: fw, gapW, cuts, pieceGuides };
}

/** crtež sa ojačanjem (isti crtež kad ga nema) */
export function withReinforce(scaled: CustomModel, cfg: Reinforce | undefined, materials: Material[]): CustomModel {
  const plan = planReinforce(scaled, cfg, materials);
  if (!plan) return scaled;
  // prečke koje uspravne cevi seku postaju komadi između cevi (i bočnih U vođica)
  const base = scaled.parts.flatMap((p) => {
    const pieces = plan.cuts.get(p.id);
    if (!pieces) return [p];
    const sh = materials.find((x) => x.id === p.materialId);
    const s = sh ? materialShape(sh) : null;
    const b0 = s && s.type === 'linear' ? partBounds(p, s).x0 : p.x;
    // krajnji komadi ulaze u bočne U vođice (ne razvlače se do njih, ali im ne smetaju); uz U profile cevi svaki komad je prečka svog platna
    const g = plan.pieceGuides.get(p.id);
    return pieces.map(([a, b], i) => ({ ...p, id: `${p.id}_c${i + 1}`, x: Math.ceil((p.x + (a - b0)) * 10) / 10, lengthMm: Math.floor((b - a - 0.1) * 10) / 10, guides: g?.[i], fit: undefined, nests: i === 0 || i === pieces.length - 1 ? p.guides : undefined }));
  });
  return { ...scaled, parts: [...base, ...plan.parts] };
}

/**
 * Dugme „Dodaj ojačanje“ u crtanju: vodoravna cev koja deli platno po visini. Spaja se sa bočnim stranama (unutrašnje ivice bočnih U profila,
 * bez njih ram ili ivica platna), osa je na zadatoj visini (podrazumevano sredina prostora za prečke). Prečke koje bi cev prekrila se
 * uklanjaju; one iznad i ispod nje se zatim raspoređuju svaka u svom polju („Raspored prečki“). Cev je obeležena kao ojačanje (`divider`).
 */
export function addDivider(model: CustomModel, materials: Material[], opts: { materialId?: string; yMm?: number; id: string }): { model: CustomModel; id: string } | { error: string } {
  const shapeOfP = (p: CustomPart) => { const mt = materials.find((x) => x.id === p.materialId); const s = mt ? materialShape(mt) : null; return s && s.type === 'linear' ? s : null; };
  const mat = (opts.materialId ? materials.find((m) => m.id === opts.materialId) : undefined) ?? suggestFrameMaterial(model, materials);
  const shape = mat ? materialShape(mat) : null;
  if (!mat || shape?.type !== 'linear') return { error: 'U cenovniku nema kvadratne cevi za ojačanje.' };
  // bočne strane: U profili u koje ulaze prečke; bez njih unutrašnjost platna (ram ili ivica)
  let x0: number; let x1: number; let y0: number; let y1: number; let z = 0;
  const bar = model.parts.find((p) => p.guides && !p.divider);
  const gl = bar && model.parts.find((p) => p.id === bar.guides![0]); const gr = bar && model.parts.find((p) => p.id === bar.guides![1]);
  const sl = gl && shapeOfP(gl); const sr = gr && shapeOfP(gr);
  if (bar && gl && gr && sl && sr) {
    const bl = partBounds(gl, sl); const br = partBounds(gr, sr);
    x0 = Math.min(bl.x1, br.x1); x1 = Math.max(bl.x0, br.x0);
    y0 = Math.max(bl.y0, br.y0); y1 = Math.min(bl.y1, br.y1);
    z = bar.z;
    // sa ramom: ojačanje ide od rama do rama i seče bočne U profile (oni postaju dva komada, ispod i iznad cevi)
    const frameV = model.parts.filter((p) => p.cut45 && p.miter && Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.99).map((p) => { const s = shapeOfP(p); return s ? partBounds(p, s) : null; }).filter((b): b is NonNullable<typeof b> => !!b);
    const left = frameV.filter((b) => b.x1 <= x0 + 1).sort((a, b) => b.x1 - a.x1)[0];
    const right = frameV.filter((b) => b.x0 >= x1 - 1).sort((a, b) => a.x0 - b.x0)[0];
    if (left && right) { x0 = left.x1; x1 = right.x0; }
  } else {
    const inner = innerRegion(model, materials);
    ({ x0, x1, y0, y1 } = inner);
    const any = model.parts.find((p) => !p.cut45 && norm180(p.angleDeg) === 0 && shapeOfP(p));
    if (any) z = any.z;
  }
  if (x1 - x0 < 50 || y1 - y0 < 100) return { error: 'Nema dovoljno mesta za ojačanje između bočnih strana.' };
  const e = sectionFace(shape.section, 0);
  const half = e.face / 2;
  const yc = Math.min(Math.max(opts.yMm ?? (y0 + y1) / 2, y0 + half), y1 - half);
  const lo = yc - half; const hi = yc + half;
  // prečke (vodoravne, u unutrašnjosti) koje bi cev prekrila se uklanjaju
  const covered = (p: CustomPart): boolean => {
    if (p.divider || p.cut45 || norm180(p.angleDeg) !== 0) return false;
    const s = shapeOfP(p);
    if (!s || s.u) return false;
    const b = partBounds(p, s);
    if (b.x1 - b.x0 < (x1 - x0) * 0.5) return false;
    return Math.min(b.y1, hi) - Math.max(b.y0, lo) > 0.5;
  };
  const tube: CustomPart = { id: opts.id, materialId: mat.id, x: r1(x0), y: r1(yc - (e.u0 + e.u1) / 2), lengthMm: r1(x1 - x0), angleDeg: 0, rot: 0, z, divider: true };
  return { model: cutGuidesAtDividers({ ...model, parts: [...model.parts.filter((p) => !covered(p)), tube] }, materials), id: tube.id };
}

/**
 * Bočni U profili koje vodoravno ojačanje preseca (ojačanje ide od rama do rama) se seku na komade: donji zadržava svoj ID, gornji je
 * nov deo sa oznakom `splitOf`. Prečke iznad ojačanja ulaze u gornje komade. Pre sečenja se ranije presečeni komadi spajaju, pa sečenje
 * prati ojačanje kad se ono pomeri ili obriše. Isti model kad nema šta da se menja.
 */
export function cutGuidesAtDividers(model: CustomModel, materials: Material[]): CustomModel {
  if (!model.parts.some((p) => p.divider || p.splitOf)) return model;
  const shapeOfP = (p: CustomPart) => { const mt = materials.find((x) => x.id === p.materialId); const s = mt ? materialShape(mt) : null; return s && s.type === 'linear' ? s : null; };
  const vertical = (p: CustomPart) => Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.99;
  // 0) ojačanje ide od rama do rama (i ono dodato pre ove izmene, koje je stajalo uz U profile)
  const frameV = model.parts.filter((p) => p.cut45 && p.miter && vertical(p)).map((p) => { const s = shapeOfP(p); return s ? partBounds(p, s) : null; }).filter((b): b is NonNullable<typeof b> => !!b);
  const stretched = model.parts.map((p) => {
    if (!p.divider || frameV.length < 2 || Math.abs(Math.sin((p.angleDeg * Math.PI) / 180)) > 0.01) return p;
    const s = shapeOfP(p);
    if (!s) return p;
    const b = partBounds(p, s);
    const left = frameV.filter((f) => f.x1 <= b.x0 + 1 && f.y0 <= b.y0 && f.y1 >= b.y1).sort((a, c) => c.x1 - a.x1)[0];
    const right = frameV.filter((f) => f.x0 >= b.x1 - 1 && f.y0 <= b.y0 && f.y1 >= b.y1).sort((a, c) => a.x0 - c.x0)[0];
    if (!left || !right || (Math.abs(b.x0 - left.x1) < 0.05 && Math.abs(b.x1 - right.x0) < 0.05)) return p;
    return { ...p, x: r1(p.x + (left.x1 - b.x0)), lengthMm: r1(right.x0 - left.x1) };
  });
  if (stretched.some((p, i) => p !== model.parts[i])) model = { ...model, parts: stretched };
  // 1) spajanje: gornji komad se vraća u donji (dužina do kraja gornjeg), veze prečki na gornji idu na donji
  const tops = model.parts.filter((p) => p.splitOf && model.parts.some((q) => q.id === p.splitOf));
  const back = new Map(tops.map((p) => [p.id, p.splitOf!]));
  let parts = model.parts.filter((p) => !back.has(p.id)).map((p) => {
    const top = tops.find((t) => t.splitOf === p.id);
    const out = top ? { ...p, lengthMm: r1(top.y + top.lengthMm - p.y) } : p;
    return out.guides && out.guides.some((g) => back.has(g)) ? { ...out, guides: out.guides.map((g) => back.get(g) ?? g) as [string, string] } : out;
  });
  // 2) sečenje na svakom ojačanju koje prolazi kroz uspravni U profil
  const divs = parts.filter((p) => p.divider).map((p) => { const s = shapeOfP(p); return s ? partBounds(p, s) : null; }).filter((b): b is NonNullable<typeof b> => !!b).sort((a, b) => a.y0 - b.y0);
  for (const d of divs) {
    const next: CustomPart[] = [];
    const remap = new Map<string, string>();
    for (const p of parts) {
      const s = shapeOfP(p);
      if (!s || !s.u || !vertical(p) || p.divider) { next.push(p); continue; }
      const b = partBounds(p, s);
      // ojačanje mora da prolazi kroz profil (po širini) i da bude unutar njegove visine
      if (Math.min(b.x1, d.x1) - Math.max(b.x0, d.x0) < 1 || d.y0 <= b.y0 + 1 || d.y1 >= b.y1 - 1) { next.push(p); continue; }
      const topId = `${p.id}s${Math.round(d.y1)}`;
      next.push({ ...p, lengthMm: r1(d.y0 - p.y) });
      next.push({ ...p, id: topId, y: r1(d.y1), lengthMm: r1(p.y + p.lengthMm - d.y1), splitOf: p.splitOf ?? p.id });
      remap.set(p.id, topId);
    }
    if (!remap.size) continue;
    // prečke iznad ojačanja ulaze u gornje komade
    parts = next.map((p) => {
      if (!p.guides || !p.guides.some((g) => remap.has(g))) return p;
      const s = shapeOfP(p);
      const c = s ? (partBounds(p, s).y0 + partBounds(p, s).y1) / 2 : p.y;
      return c > d.y1 ? { ...p, guides: p.guides.map((g) => remap.get(g) ?? g) as [string, string] } : p;
    });
  }
  return { ...model, parts };
}

const norm180 = (a: number): number => ((Math.round(a * 1000) / 1000) % 180 + 180) % 180;
