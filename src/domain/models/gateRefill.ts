import { partBounds, type CustomModel, type CustomPart } from './custom';
import { shapeLookup } from './guides';
import { innerRegion } from './reinforce';
import { capOn, capsOver, layoutVBars, vBarGroup, vLayoutInfo } from './vbars';
import type { Material } from './types';

/**
 * Model kapije u projektu: crtež modela se ne prenosi doslovno (kao slika fiksne širine), nego se ispuna preračunava za stvarnu
 * širinu krila, kao kod modela iz kataloga. Za sada samo uspravne letvice modela „Bela — uske vertikalne letvice“: broj letvica i
 * razmak između njih računaju se ponovo za širinu krila, tako da letvice ravnomerno popune celo krilo, sa jednakim razmakom.
 */

/**
 * Da li se model pri promeni veličine polja ili krila računa po pravilima (mere uz ivice, broj i razmak letvica i prečki), a ne razvlači
 * kao slika: svaki model osim modela za terase, bez obzira da li je nastao od modela iz kataloga, nacrtan ručno, kao ograda ili kao kapija.
 * Šta na crtežu postoji (ram, nosači, niz prečki, uspravne letvice) prepoznaje sam crtež: bez takvih delova ništa se ne menja.
 */
export const refillsVBars = (m: CustomModel): boolean => m.kind !== 'terrace';

const norm = (a: number): number => ((a % 360) + 360) % 360;
const isVertical = (p: CustomPart): boolean => norm(p.angleDeg) === 90 || norm(p.angleDeg) === 270;

export interface VBarFill { count: number; gap: number; left: number; right: number }

/**
 * Broj letvica i razmak za prostor širine `space`: letvice širine `bar`, odstojanja `left` i `right` od ivica prostora i
 * željeni razmak `gap` (razmak sa crteža). Broj je onaj pri kome je razmak najbliži željenom:
 *   n = zaokruženo((space − left − right + gap) / (bar + gap)),
 * pa se razmak izračuna tačno, da sve letvice popune prostor: razmak = (space − left − right − n · bar) / (n − 1).
 * Ako tačan razmak ne može da se dobije sa celim brojem letvica, razmak se malo poveća ili smanji (najviše pola koraka letvice).
 * Jedna letvica stoji na sredini. Kad letvice ne mogu da stanu ni bez razmaka, broj se smanjuje.
 */
export function vBarFill(space: number, bar: number, gap: number, left: number, right: number): VBarFill {
  const room = space - left - right;
  if (!(bar > 0) || room < bar) return { count: room >= bar ? 1 : 0, gap: 0, left: Math.max(0, (space - bar) / 2), right: Math.max(0, (space - bar) / 2) };
  const g = Math.max(0, gap);
  let n = Math.max(1, Math.round((room + g) / (bar + g)));
  while (n > 1 && room - n * bar < -1e-9) n--;
  if (n === 1) { const side = (space - bar) / 2; return { count: 1, gap: 0, left: side, right: side }; }
  return { count: n, gap: (room - n * bar) / (n - 1), left, right };
}

/**
 * Letvice crteža preračunate za model razvučen na drugu širinu. `original` je crtež modela, `scaled` isti crtež razvučen na
 * širinu krila (delovi imaju iste ID). Razmak sa crteža ostaje željeni razmak, odstojanje prve i poslednje letvice od ivice
 * ostaje kao na crtežu (najviše koliko i razmak), a broj letvica i tačan razmak se računaju za novu širinu (`vBarFill`).
 */
/** ručno zadate mere letvica na polju ili krilu (mm); mera bez vrednosti ostaje kakva je na crtežu modela */
export interface SlatOverride {
  /** uspravne letvice: odstojanje prve od levog i poslednje od desnog kraja, željeni razmak */
  leftMm?: number; rightMm?: number; gapMm?: number;
  /** vodoravne prečke koje se ponavljaju: odstojanje donje od dna, gornje od vrha ispune i željeni razmak */
  bottomMm?: number; topMm?: number; hGapMm?: number;
  /** vodoravne prečke: sa luftom (razmak 0 i više) ili bez lufta (razmak 0 i manje, prečke se uvlače); bez vrednosti važi tip iz crteža modela */
  lufta?: import('./custom').Lufta;
  /** ojačanje platna kvadratnim cevima (uspravne i vodoravne) */
  reinforce?: import('./reinforce').Reinforce;
  /** model sa vodoravnim ojačanjem: raspored prečki po poljima (odozdo naviše): odstojanje od donje i gornje granice polja (dno / ojačanje / vrh) i razmak */
  zones?: ({ bottomMm?: number; topMm?: number; hGapMm?: number } | undefined)[];
  /** nosači (vodoravni delovi koji se ne ponavljaju): odstojanje od bliže ivice ispune (dno ili vrh), po ID prvog dela nosača */
  rails?: Record<string, number>;
  /** ograda za terasu: položaji osa stubova u ovom polju (mm od levog kraja); računa se sam za celu ravnu liniju ograde */
  postXs?: number[];
  /** stepenište: za koliko je (mm) svaki stub duži naniže, do gazišta na kome stoji; i nagib polja (tangens) za ravnu flanšu */
  postDrops?: number[]; stairTan?: number;
  /** skretanje trase (stepeni) na levom i desnom kraju polja: prečke ispred stubova se na uglu produžavaju ili skraćuju da se sastave */
  cornerTurns?: [number, number];
  /** promena nagiba na krajevima polja (stepeni, 0 = nema): ravno polje uz stepenište i obrnuto; cevi se sastaju u istoj tački (zglob ili koleno) */
  cornerBends?: [number, number];
  /** stepenište kao krajnja tačka ograde: koji su krajevi slobodni (levo, desno) i rastojanje (mm) od krajnjeg stuba do kraja prečke i rukohvata; bez vrednosti kao na crtežu */
  freeEnds?: [boolean, boolean]; endOverhangMm?: number;
  /** spoj na uglu za ovaj projekat (podešavanje projekta): kuglasti zglob ili koleno, i krak kolena (mm); bez vrednosti važi izbor iz modela */
  cornerJoint?: 'ball' | 'elbow'; cornerArm?: number;
  /** stepenište: prvi stub stoji na podu (na početku stepeništa), a ne na prvom stepeniku; i broj stepenika na kome stoji poslednji stub */
  stairFirstFloor?: boolean; stairLastStep?: number;
  /** ograda za terasu, „Raspored stubova i razmaci“ ovog polja: najveći razmak stubova i odstojanje prvog / poslednjeg stuba od krajeva (mm); bez vrednosti važi model */
  /** ograda za terasu, „Raspored prečki“ ovog polja: broj prečki, osa najniže prečke od poda i osa najviše prečke od ose rukohvata (mm) */
  rodCount?: number; rodBottomMm?: number; rodTopMm?: number;
  /** razmak ose između susednih prečki (od donje): zadat razmak (mm) ili null = ravnomerno; ostali razmaci dele ono što preostane */
  rodGaps?: (number | null)[];
  postSpacingMm?: number; postLeftMm?: number; postRightMm?: number;
}

/** najveća grupa uspravnih letvica istog preseka (ram i U vođice nisu letvice); bar 3 letvice */
function slatGroupOf(model: CustomModel, materials: Material[]): CustomPart | null {
  const shapeOf = shapeLookup(materials);
  let best: { bar: CustomPart; n: number } | null = null;
  const seen = new Set<string>();
  for (const p of model.parts) {
    if (seen.has(p.id) || !isVertical(p) || p.cut45 || p.heightMm) continue;
    const sh = shapeOf(p);
    if (!sh || sh.type !== 'linear' || sh.u) continue;
    // uspravni ram uz ivicu polja nije letvica
    const b = partBounds(p, sh);
    if (b.x0 <= 1 || b.x1 >= model.widthMm - 1) continue;
    const g = vBarGroup(model, p, materials);
    if (!g) continue;
    g.bars.forEach((x) => seen.add(x.id));
    if (g.bars.length >= 3 && (!best || g.bars.length > best.n)) best = { bar: g.bars[0], n: g.bars.length };
  }
  return best ? best.bar : null;
}

/** ID-evi uspravnih letvica koje se preračunavaju za širinu krila (prazno kad model nema takve letvice ili se ne preračunava) */
export function slatIdsOf(model: CustomModel, materials: Material[]): Set<string> {
  if (!refillsVBars(model)) return new Set();
  const bar = slatGroupOf(model, materials);
  const g = bar && vBarGroup(model, bar, materials);
  if (g && g.bars.some((b) => b.fit?.repeat === 'off')) return new Set();
  // čep na vrhu letvice prati svoju letvicu, pa se broji kao i ona
  return new Set(g ? g.bars.flatMap((b) => [b.id, ...(capOn(model, b, materials) ? [capOn(model, b, materials)!.id] : [])]) : []);
}

/** Trenutni raspored letvica modela: broj, odstojanje prve i poslednje od ivica i razmak (null kad model nema uspravne letvice). */
export function slatLayoutOf(model: CustomModel, materials: Material[]): { count: number; left: number; right: number; gap: number } | null {
  const bar = slatGroupOf(model, materials);
  const info = bar && vLayoutInfo(model, bar, materials);
  if (!info || info.mixed) return null;
  return { count: info.count, left: info.top, right: info.bottom, gap: info.gap ?? 0 };
}

export function refillVBars(original: CustomModel, scaled: CustomModel, materials: Material[], fill?: SlatOverride): CustomModel {
  const bar0 = slatGroupOf(original, materials);
  if (!bar0) return scaled;
  const info = vLayoutInfo(original, bar0, materials);
  const sBar = scaled.parts.find((p) => p.id === bar0.id);
  const sGroup = sBar && vBarGroup(scaled, sBar, materials);
  if (!info || !sBar || !sGroup || info.mixed || info.gap === null) return scaled;
  // radnik je isključio preračunavanje: broj letvica ostaje kao na crtežu
  if (vBarGroup(original, bar0, materials)?.bars.some((b) => b.fit?.repeat === 'off')) return scaled;
  const bar = info.h;
  const gap = Math.max(0, fill?.gapMm ?? info.gap);
  const edge = (v: number) => Math.min(Math.max(0, v), Math.max(0, gap));
  const space = sGroup.xRight - sGroup.xLeft;
  // odstojanja od ivica koja je radnik zadao važe tačno; ostala ostaju kao na crtežu (najviše koliko i razmak)
  const left = fill?.leftMm !== undefined ? Math.max(0, fill.leftMm) : edge(info.top);
  const right = fill?.rightMm !== undefined ? Math.max(0, fill.rightMm) : edge(info.bottom);
  const f = vBarFill(space, bar, gap, left, right);
  if (f.count < 1) return scaled;
  const r = layoutVBars(scaled, sBar.id, materials, { count: f.count, top: f.left, bottom: f.right, gap: f.gap, auto: f.count === 1 ? 'bottom' : 'gap' });
  return 'error' in r ? scaled : r.model;
}

/**
 * Slobodne vodoravne prečke složene jedna iznad druge sa jednakim razmakom (daske, letvice, lamele, naizmenične široke i uske
 * letvice, segmenti panela sa linijama u razmacima): za novu visinu se računa broj prečki i jednak razmak između svih, kao za
 * uspravne letvice po širini. Redosled debljina se ponavlja (npr. uska, široka, uska, široka), a prva i poslednja prečka ostaju
 * iste vrste kao na crtežu. Nosači koji se ne ponavljaju (npr. dva nosača letvica) i ram ne ulaze u niz i ostaju vezani za svoju
 * ivicu. Nagnute lamele koje se uvlače jedna u drugu (negativan razmak) ostaju uvučene za isto.
 */
export function planPattern(original: CustomModel, heightMm: number, materials: Material[], fill?: SlatOverride): PatternPlan | null {
  const shapeOf = shapeLookup(materials);
  const W0 = original.widthMm; const H0 = original.heightMm;
  type Cand = { p: CustomPart; y0: number; y1: number; sig: string; edge: 'lo' | 'hi' | null };
  const all: Cand[] = [];
  for (const p of original.parts) {
    if (p.heightMm || (norm(p.angleDeg) !== 0 && norm(p.angleDeg) !== 180)) continue;
    const sh = shapeOf(p);
    if (!sh || sh.type !== 'linear') continue;
    const b = partBounds(p, sh);
    if (b.x1 - b.x0 < 0.6 * W0) continue;
    all.push({ p, y0: b.y0, y1: b.y1, edge: b.y0 <= 1 ? 'lo' : b.y1 >= H0 - 1 ? 'hi' : null, sig: `${p.materialId}|${p.rot}|${p.tiltDeg ?? 0}|${Math.round((b.y1 - b.y0) * 10)}|${Math.round(p.lengthMm)}` });
  }
  // deo uz ivicu je ram, osim ako liči na (bar dve) prečke u unutrašnjosti polja
  const sigCount = new Map<string, number>();
  for (const c of all) if (!c.edge && !c.p.cut45) sigCount.set(c.sig, (sigCount.get(c.sig) ?? 0) + 1);
  const cands = all.filter((c) => !c.p.cut45 && (!c.edge || (sigCount.get(c.sig) ?? 0) >= 2));
  const inPattern = new Set(cands.map((c) => c.p.id));
  let lowFrame = 0; let topFrame = H0;
  for (const c of all) {
    if (inPattern.has(c.p.id) || !c.edge) continue;
    if (c.edge === 'lo') lowFrame = Math.max(lowFrame, c.y1); else topFrame = Math.min(topFrame, c.y0);
  }
  const n = cands.length;
  if (n < 3 || cands.some((c) => c.p.fit?.repeat === 'off')) return null;
  cands.sort((a, b) => a.y0 - b.y0);
  // razmak između susednih prečki mora da bude isti (sa odstupanjem 1,5 mm); prva ili poslednja prečka može biti pomerena zbog ivice
  const gaps = cands.slice(1).map((c, i) => c.y0 - cands[i].y1);
  const g = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (gaps.some((x, i) => Math.abs(x - g) > 1.5 && i !== 0 && i !== gaps.length - 1)) return null;
  // najmanji niz od k vrsta prečki koji se ponavlja
  let k = n;
  for (let kk = 1; kk < n; kk++) if (cands.every((c, i) => c.sig === cands[i % kk].sig)) { k = kk; break; }
  if (k >= n) return null;
  const edge = (v: number) => Math.min(Math.max(0, v), Math.max(0, g));
  // odstojanja od dna i vrha koja je radnik zadao važe tačno; ostala ostaju kao na crtežu (najviše koliko i razmak)
  const e0 = fill?.bottomMm !== undefined ? Math.max(0, fill.bottomMm) : edge(cands[0].y0 - lowFrame);
  const e1 = fill?.topMm !== undefined ? Math.max(0, fill.topMm) : edge(topFrame - cands[n - 1].y1);
  const yBot = lowFrame; const yTop = topFrame + (heightMm - H0);
  const room = yTop - yBot - e0 - e1;
  const hOf = (t: number): number => cands[t % k].y1 - cands[t % k].y0;
  // poslednja (gornja) prečka je one vrste kojom se crtež završava (npr. gore je uvek široka letvica, a dole uska).
  // Razmak nikad nije manji od onog sa crteža: staje najviše prečki pri kojima je razmak bar toliki, a ostatak se ravnomerno deli
  // na sve razmake. Nagnute lamele koje se uvlače jedna u drugu (negativan razmak) zadržavaju uvlačenje blisko onom sa crteža.
  // željeni razmak: zadat ručno ili sa crteža
  const gT = fill?.hGapMm !== undefined ? fill.hGapMm : g;
  const okEnd = (t: number): boolean => cands[(t - 1) % k].sig === cands[n - 1].sig;
  let best: { t: number; gap: number } | null = null;
  for (let t = 1; t <= 400; t++) {
    let sum = 0; for (let s = 0; s < t; s++) sum += hOf(s);
    if (t === 1) { if (gT >= 0 && sum <= room && okEnd(t)) best = { t, gap: 0 }; continue; }
    const gp = (room - sum) / (t - 1);
    // uvučene lamele: bira se broj kod koga je uvlačenje najbliže onom sa crteža (najviše 15 mm veće)
    if (gT < 0) { if (gp < gT - 15) break; if (okEnd(t) && (!best || Math.abs(gp - gT) < Math.abs(best.gap - gT))) best = { t, gap: gp }; continue; }
    if (gp < gT - 1e-9) break;
    if (okEnd(t)) best = { t, gap: gp };
  }
  if (!best) {
    // ni najmanji niz ne staje sa razmakom sa crteža: uzima se najmanji broj prečki koji staje
    for (let t = 2; t <= n; t++) {
      let sum = 0; for (let s = 0; s < t; s++) sum += hOf(s);
      if (okEnd(t) && room >= sum) { best = { t, gap: (room - sum) / (t - 1) }; break; }
    }
  }
  if (!best) return null;
  return { cands: cands.map((c) => ({ p: c.p, y0: c.y0, y1: c.y1 })), k, t: best.t, gap: best.gap, yBot, e0, e1, hOf };
}

/** broj prečki vrste j (0 … k−1) u nizu od t prečki */
const countOfKind = (t: number, k: number, j: number): number => (t > j ? Math.floor((t - 1 - j) / k) + 1 : 0);

/**
 * Količine za specifikaciju: vrsta (0 … k−1) svakog dela koji pripada nizu (ID dela → vrsta) i broj prečki svake vrste u nizu za
 * visinu `heightMm`. null kad model nema niz prečki koji se preračunava.
 */
export function patternCounts(original: CustomModel, heightMm: number, materials: Material[], fill?: SlatOverride): { kinds: Map<string, number>; counts: number[] } | null {
  // vodoravno ojačanje: svako polje ima svoj niz prečki; vrste prečki se broje redom (polje ispod, pa polje iznad)
  if (original.parts.some((p) => p.divider)) {
    const z = zonePlans(original, heightMm, materials, fill);
    if (!z) return null;
    const kinds = new Map<string, number>(); const counts: number[] = [];
    for (const plan of z.plans) {
      if (!plan) continue;
      const off = counts.length;
      plan.cands.forEach((c, i) => kinds.set(c.p.id, off + (i % plan.k)));
      for (let j = 0; j < plan.k; j++) counts.push(countOfKind(plan.t, plan.k, j));
    }
    return counts.length ? { kinds, counts } : null;
  }
  const plan = planPattern(original, heightMm, materials, fill);
  if (!plan) return null;
  return { kinds: new Map(plan.cands.map((c, i) => [c.p.id, i % plan.k])), counts: Array.from({ length: plan.k }, (_, j) => countOfKind(plan.t, plan.k, j)) };
}

export interface PatternPlan { cands: { p: CustomPart; y0: number; y1: number }[]; k: number; t: number; gap: number; yBot: number; e0: number; e1: number; hOf: (t: number) => number }

/* ---------- vodoravno ojačanje: prečke se preračunavaju posebno u svakom polju ---------- */

interface ZoneSpan { lo: number; hi: number }
interface ZoneLayout {
  /** polja na crtežu modela (ispod, između i iznad ojačanja) i ista polja na traženoj visini */
  zonesO: ZoneSpan[];
  zonesN: ZoneSpan[];
  /** ojačanja: ID, donja i gornja ivica na traženoj visini */
  dividers: { id: string; y0: number; y1: number }[];
}

/**
 * Polja koja vodoravna ojačanja prave u modelu i njihove mere na novoj visini: visina koja se dodaje (ili oduzima) deli se na polja
 * srazmerno njihovoj visini, a ojačanja i ram zadržavaju debljinu. Null kad model nema ojačanja ili nema mesta.
 */
function zoneLayout(original: CustomModel, heightMm: number, materials: Material[]): ZoneLayout | null {
  const shapeOf = shapeLookup(materials);
  const divs = original.parts.filter((p) => p.divider).map((p) => { const s = shapeOf(p); return s && s.type === 'linear' ? { id: p.id, b: partBounds(p, s) } : null; }).filter((d): d is { id: string; b: { x0: number; y0: number; x1: number; y1: number } } => !!d).sort((a, b) => a.b.y0 - b.b.y0);
  if (!divs.length) return null;
  const inner = innerRegion(original, materials);
  const zonesO: ZoneSpan[] = []; const thick: { id: string; t: number }[] = [];
  let lo = inner.y0;
  for (const d of divs) {
    if (d.b.y0 > lo + 1) { zonesO.push({ lo, hi: d.b.y0 }); thick.push({ id: d.id, t: d.b.y1 - d.b.y0 }); lo = d.b.y1; }
  }
  zonesO.push({ lo, hi: inner.y1 });
  if (zonesO.length !== thick.length + 1) return null;
  const sumZ = zonesO.reduce((a, z) => a + (z.hi - z.lo), 0);
  const dH = heightMm - original.heightMm;
  if (sumZ <= 0) return null;
  const zonesN: ZoneSpan[] = []; const dividers: ZoneLayout['dividers'] = [];
  let y = inner.y0;
  zonesO.forEach((z, i) => {
    const h = (z.hi - z.lo) + (dH * (z.hi - z.lo)) / sumZ;
    zonesN.push({ lo: y, hi: y + h });
    y += h;
    if (thick[i]) { dividers.push({ id: thick[i].id, y0: y, y1: y + thick[i].t }); y += thick[i].t; }
  });
  if (zonesN.some((z) => z.hi - z.lo < 20)) return null;
  return { zonesO, zonesN, dividers };
}

/** crtež jednog polja (prečke u njemu, počevši od donje ivice polja): isto što i ceo model, samo niži */
function zoneModel(original: CustomModel, z: ZoneSpan, materials: Material[]): CustomModel {
  const shapeOf = shapeLookup(materials);
  const parts = original.parts.filter((p) => {
    if (p.divider) return false;
    const s = shapeOf(p);
    if (!s || s.type !== 'linear') return false;
    const b = partBounds(p, s);
    const c = (b.y0 + b.y1) / 2;
    return c > z.lo && c < z.hi;
  }).map((p) => ({ ...p, y: p.y - z.lo }));
  return { ...original, heightMm: z.hi - z.lo, parts };
}

/** planovi prečki po poljima (za polje bez niza prečki plana nema) */
function zonePlans(original: CustomModel, heightMm: number, materials: Material[], fill?: SlatOverride): { layout: ZoneLayout; plans: (PatternPlan | null)[]; exact: boolean } | null {
  const layout = zoneLayout(original, heightMm, materials);
  if (!layout) return null;
  // na visini na kojoj je model nacrtan (bez ručno zadatih mera) prečke ostaju tačno kako su nacrtane
  const exact = Math.abs(heightMm - original.heightMm) < 0.01 && fill?.hGapMm === undefined && !fill?.zones?.some(Boolean);
  const plans = layout.zonesO.map((zo, i) => {
    // ručno zadate mere polja (odstojanja od granica i razmak); razmak za ceo model važi za polja bez svoje mere
    const zf = fill?.zones?.[i];
    const f: SlatOverride = {};
    const gap = zf?.hGapMm ?? fill?.hGapMm;
    if (gap !== undefined) f.hGapMm = gap;
    if (zf?.bottomMm !== undefined) f.bottomMm = zf.bottomMm;
    if (zf?.topMm !== undefined) f.topMm = zf.topMm;
    const plan = planPattern(zoneModel(original, zo, materials), layout.zonesN[i].hi - layout.zonesN[i].lo, materials, Object.keys(f).length ? f : undefined);
    return plan && exact ? { ...plan, t: plan.cands.length } : plan;
  });
  return { layout, plans, exact };
}

/** Raspored prečki svakog polja modela sa ojačanjem (broj, odstojanja od granica polja i razmak) na traženoj visini; null kad model nema ojačanje. */
export function patternZoneInfo(original: CustomModel, heightMm: number, materials: Material[], fill?: SlatOverride): { index: number; count: number; bottom: number; top: number; gap: number; first: boolean; last: boolean }[] | null {
  const z = zonePlans(original, heightMm, materials, fill);
  if (!z) return null;
  const out: { index: number; count: number; bottom: number; top: number; gap: number; first: boolean; last: boolean }[] = [];
  z.plans.forEach((plan, i) => { if (plan) out.push({ index: i, count: plan.t, bottom: plan.e0, top: plan.e1, gap: plan.gap, first: i === 0, last: i === z.plans.length - 1 }); });
  return out;
}

/** ID-evi prečki svih nizova (po poljima) modela sa ojačanjem */
export function zonePatternIds(original: CustomModel, heightMm: number, materials: Material[]): Set<string> | null {
  const z = zonePlans(original, heightMm, materials);
  return z ? new Set(z.plans.flatMap((p) => p?.cands.map((c) => c.p.id) ?? [])) : null;
}

function refillZones(original: CustomModel, scaled: CustomModel, materials: Material[], fill?: SlatOverride): CustomModel {
  const z = zonePlans(original, scaled.heightMm, materials, fill);
  if (!z) return scaled;
  // ista visina kao na crtežu: prikaz je tačno crtež
  if (z.exact) return scaled;
  const shapeOf = shapeLookup(materials);
  const byId = new Map(scaled.parts.map((p) => [p.id, p]));
  const drop = new Set<string>();
  const made: CustomPart[] = [];
  z.plans.forEach((plan, zi) => {
    if (!plan) return;
    const zo = z.layout.zonesO[zi]; const zn = z.layout.zonesN[zi];
    const { cands, k, hOf } = plan; const n = cands.length;
    let y0 = plan.yBot + plan.e0;
    for (let t = 0; t < plan.t; t++) {
      const c = t < n ? cands[t] : cands[n - k + ((t - n) % k)];
      const src = byId.get(c.p.id);
      // c.p.y i c.y0 su u koordinatama polja (od donje ivice polja): y dela u celom crtežu je c.p.y + zo.lo, a nova donja ivica se prevodi na visinu u celom crtežu
      if (src) made.push({ ...src, id: t < n ? c.p.id : `${c.p.id}_r${zi}_${t}`, y: c.p.y + zo.lo + (zn.lo + y0 - (c.y0 + zo.lo)) });
      y0 += hOf(t) + plan.gap;
    }
    for (const c of cands) drop.add(c.p.id);
  });
  const placedDiv = new Map(z.layout.dividers.map((d) => [d.id, d]));
  const parts: CustomPart[] = [];
  let inserted = false;
  for (const p of scaled.parts) {
    const d = placedDiv.get(p.id);
    if (d) { const s = shapeOf(p); const b = s && s.type === 'linear' ? partBounds(p, s) : null; parts.push(b ? { ...p, y: p.y + (d.y0 - b.y0) } : p); continue; }
    if (!drop.has(p.id)) { parts.push(p); continue; }
    if (!inserted) { parts.push(...made); inserted = true; }
  }
  return { ...scaled, parts };
}
export function refillPattern(original: CustomModel, scaled: CustomModel, materials: Material[], fill?: SlatOverride): CustomModel {
  if (original.parts.some((p) => p.divider)) return refillZones(original, scaled, materials, fill);
  const plan = planPattern(original, scaled.heightMm, materials, fill);
  if (!plan) return scaled;
  const { cands, k, hOf } = plan;
  const n = cands.length;
  const best = { t: plan.t, gap: plan.gap };
  const yBot = plan.yBot; const e0 = plan.e0;
  const byId = new Map(scaled.parts.map((p) => [p.id, p]));
  const made: CustomPart[] = [];
  let y0 = yBot + e0;
  for (let t = 0; t < best.t; t++) {
    // prečke sa crteža zadržavaju svoja svojstva (npr. druga boja jedne daske); dodate prečke nastavljaju poslednji niz
    const c = t < n ? cands[t] : cands[n - k + ((t - n) % k)];
    const src = byId.get(c.p.id);
    if (src) made.push({ ...src, id: t < n ? c.p.id : `${c.p.id}_r${t}`, y: c.p.y + (y0 - c.y0) });
    y0 += hOf(t) + best.gap;
  }
  const drop = new Set(cands.map((c) => c.p.id));
  const parts: CustomPart[] = [];
  let inserted = false;
  for (const p of scaled.parts) {
    if (!drop.has(p.id)) { parts.push(p); continue; }
    if (!inserted) { parts.push(...made); inserted = true; }
  }
  return { ...scaled, parts };
}

/* ---------- nosači ---------- */

export interface RailGroup {
  /** ID prvog dela nosača (ključ za ručno zadato odstojanje) */
  key: string;
  /** delovi nosača: delovi koji se dodiruju po visini (npr. U vođica i prečka uz nju) pomeraju se zajedno */
  ids: string[];
  /** ivica za koju je nosač vezan i odstojanje od nje na crtežu (mm) */
  edge: 'bottom' | 'top';
  offsetMm: number;
  /** visina nosača (mm) */
  heightMm: number;
}

/**
 * Nosači modela: vodoravni delovi preko (skoro) cele širine koji nisu ram uz ivicu i ne pripadaju nizu prečki koje se ponavljaju.
 * Nosač ispod sredine je vezan za dno, iznad sredine za vrh (kao pri promeni veličine polja).
 */
export function railGroups(original: CustomModel, materials: Material[]): RailGroup[] {
  const shapeOf = shapeLookup(materials);
  const W0 = original.widthMm; const H0 = original.heightMm;
  const inPattern = original.parts.some((p) => p.divider) ? (zonePatternIds(withoutRepeatOff(original), H0, materials) ?? new Set<string>()) : new Set(planPattern(withoutRepeatOff(original), H0, materials)?.cands.map((c) => c.p.id) ?? []);
  const items: { id: string; y0: number; y1: number }[] = [];
  for (const p of original.parts) {
    if (inPattern.has(p.id) || p.cut45 || p.heightMm || (norm(p.angleDeg) !== 0 && norm(p.angleDeg) !== 180)) continue;
    const sh = shapeOf(p);
    if (!sh || sh.type !== 'linear') continue;
    const b = partBounds(p, sh);
    if (b.x1 - b.x0 < 0.6 * W0 || b.y0 <= 1 || b.y1 >= H0 - 1) continue;
    items.push({ id: p.id, y0: b.y0, y1: b.y1 });
  }
  items.sort((a, b) => a.y0 - b.y0);
  const groups: { ids: string[]; y0: number; y1: number }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && it.y0 <= last.y1 + 1) { last.ids.push(it.id); last.y1 = Math.max(last.y1, it.y1); }
    else groups.push({ ids: [it.id], y0: it.y0, y1: it.y1 });
  }
  return groups.map((g) => {
    const bottom = (g.y0 + g.y1) / 2 < H0 / 2;
    return { key: g.ids[0], ids: g.ids, edge: bottom ? 'bottom' : 'top', offsetMm: bottom ? g.y0 : H0 - g.y1, heightMm: g.y1 - g.y0 };
  });
}

/** Nosači pomereni na ručno zadato odstojanje od svoje ivice (dno ili vrh ispune); ostali ostaju gde jesu. */
export function applyRails(original: CustomModel, model: CustomModel, materials: Material[], rails: Record<string, number> | undefined): CustomModel {
  if (!rails || !Object.keys(rails).length) return model;
  const shapeOf = shapeLookup(materials);
  const shift = new Map<string, number>();
  for (const g of railGroups(original, materials)) {
    const v = rails[g.key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const bs = g.ids.map((id) => model.parts.find((p) => p.id === id)).flatMap((p) => { const sh = p && shapeOf(p); return p && sh ? [partBounds(p, sh)] : []; });
    if (!bs.length) continue;
    const y0 = Math.min(...bs.map((b) => b.y0)); const y1 = Math.max(...bs.map((b) => b.y1));
    const want = Math.max(0, Math.min(v, model.heightMm - (y1 - y0)));
    const d = g.edge === 'bottom' ? want - y0 : model.heightMm - want - y1;
    for (const id of g.ids) shift.set(id, d);
  }
  if (!shift.size) return model;
  return { ...model, parts: model.parts.map((p) => (shift.has(p.id) ? { ...p, y: p.y + shift.get(p.id)! } : p)) };
}

/** Da li deo pripada nizu letvica ili prečki čiji se broj i razmak preračunavaju za veličinu polja (za izbor pravila u crtanju modela). */
/** model sa uključenim preračunom nizova (kao da nijedan deo nema „ne preračunavaj“): za prepoznavanje delova koji pripadaju nizu */
const withoutRepeatOff = (model: CustomModel): CustomModel => (model.parts.some((p) => p.fit?.repeat) ? { ...model, parts: model.parts.map((p) => (p.fit?.repeat ? { ...p, fit: { ...p.fit, repeat: undefined } } : p)) } : model);

/** uspravne letvice glavnog niza modela, sleva udesno (prazno kad ih nema) */
export function slatGroupBars(model: CustomModel, materials: Material[]): CustomPart[] {
  const bar = slatGroupOf(model, materials);
  return (bar && vBarGroup(model, bar, materials)?.bars) || [];
}

/**
 * Delovi koji čine isti niz kao deo `id`: sve uspravne letvice niza sa svojim čepovima ili sve vodoravne prečke koje se ponavljaju.
 * Isključivanje preračuna broja i razmaka važi za ceo niz (letvice i čepovi na njima), ne za jedan deo. Deo koji nije u nizu: samo on.
 */
export function groupMembers(model: CustomModel, materials: Material[], id: string): string[] {
  const on = withoutRepeatOff(model);
  const bars = slatGroupBars(on, materials);
  const caps = bars.flatMap((b) => capsOver(on, b, materials).map((c) => c.id));
  if (bars.some((b) => b.id === id) || caps.includes(id)) return [...bars.map((b) => b.id), ...caps];
  const plan = planPattern(on, on.heightMm, materials);
  if (plan?.cands.some((c) => c.p.id === id)) return plan.cands.map((c) => c.p.id);
  return [id];
}

/** Delovi nizova iz kojih je radnik isključio preračun (bar jedan deo niza ima „ne preračunavaj“): važi za ceo niz. */
export function repeatOffIds(model: CustomModel, materials: Material[]): Set<string> {
  const out = new Set<string>();
  for (const p of model.parts) if (p.fit?.repeat === 'off') for (const id of groupMembers(model, materials, p.id)) out.add(id);
  return out;
}

/** Da li deo pripada nizu letvica ili prečki čiji se broj i razmak preračunavaju za veličinu polja (za izbor pravila u crtanju modela). */
export function isRepeating(model: CustomModel, materials: Material[], id: string): boolean {
  return groupMembers(model, materials, id).length > 1;
}
