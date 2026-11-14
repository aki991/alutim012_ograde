import { partAngle, scaleModel, type CustomModel, type CustomPart, type Lufta } from './custom';
import { materialShape, sectionFace, type MatShape, type Section } from './materialShape';
import { uid } from '../../utils/id';
import { minVerticalPitch } from './overlap';
import type { Material } from './types';

/**
 * Prečke u bočnim U profilima (vođicama). Bočna strana je uspravan U profil čiji je kanal okrenut ka ispuni; prečka ulazi
 * krajevima u kanal i ne sme da izađe van njega: ni po dužini (kraj je između otvora i dna kanala), ni po dubini (presek
 * prečke, i kad je nagnut, mora da stane u unutrašnji otvor U profila, npr. 60 − 2 × 2 = 56 mm), ni iznad ili ispod vođice.
 */

const norm = (deg: number): number => ((Math.round(deg * 1e6) / 1e6 % 360) + 360) % 360;

export interface GuideInfo {
  id: string;
  /** smer otvora kanala po x: +1 kanal gleda udesno (leva bočna strana), −1 ulevo (desna) */
  dirX: 1 | -1;
  /** x otvora kanala (ivica stranica) i unutrašnjeg dna kanala */
  mouthX: number;
  backX: number;
  /** sredina i pola unutrašnjeg otvora po dubini (z) */
  zc: number;
  half: number;
  /** visina vođice */
  y0: number;
  y1: number;
  /** mere U profila */
  u: { a: number; b: number; c: number };
}

/** Uspravan U profil kao vođica (kanal okrenut levo ili desno); null ako deo nije takav. */
export function guideInfo(p: CustomPart, shape: MatShape): GuideInfo | null {
  if (shape.type !== 'linear' || !shape.u) return null;
  const a = norm(p.angleDeg);
  const t = norm(partAngle(p));
  if ((a !== 90 && a !== 270) || (t !== 90 && t !== 270)) return null;
  // normala ose u ravni crteža n = (−sin a, cos a); otvor U preseka (pre okretanja na strani −v) posle okretanja gleda u smer sin t po u
  const nx = a === 90 ? -1 : 1;
  const dirX = (nx * (t === 90 ? 1 : -1)) as 1 | -1;
  const { a: A, b: B, c: C } = shape.u;
  const y0 = a === 90 ? p.y : p.y - p.lengthMm;
  return { id: p.id, dirX, mouthX: p.x + (dirX * B) / 2, backX: p.x - dirX * (B / 2 - C), zc: p.z, half: A / 2 - C, y0, y1: y0 + p.lengthMm, u: shape.u };
}

/** Uspravan U profil koji može da postane vođica (kanal mu se okreće ka prečki pri uklapanju). */
const isGuideCandidate = (p: CustomPart, shape: MatShape): boolean => shape.type === 'linear' && !!shape.u && (norm(p.angleDeg) === 90 || norm(p.angleDeg) === 270) && !p.tiltDeg;

export interface TiltFit {
  /** osnovno okretanje (0/90/180/270) u kome prečka ima najmanju dubinu (stoji u ravni ograde) */
  rot: number;
  /** najveći nagib (stepeni) u + i − smeru pri kome presek još staje u otvor; pri tom nagibu prečka dodiruje obe stranice */
  plus: number;
  minus: number;
}

/** Najveći nagib preseka koji staje u otvor širine `opening` (mm), od osnovnog okretanja `rot`. null = ne staje ni bez nagiba. */
export function tiltLimits(section: Section, rot: number, opening: number): { plus: number; minus: number } | null {
  const depth = (t: number) => sectionFace(section, rot + t).depth;
  if (depth(0) > opening + 1e-6) return null;
  const limit = (sign: 1 | -1): number => {
    let lo = 0;
    for (let t = 0.25; t <= 90; t += 0.25) {
      if (depth(sign * t) > opening) {
        let hi = t;
        for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (depth(sign * m) > opening) hi = m; else lo = m; }
        return Math.floor(lo * 100) / 100; // zaokruženo naniže, da prečka sigurno stane
      }
      lo = t;
    }
    return 90;
  };
  return { plus: limit(1), minus: limit(-1) };
}

/** Okretanje u kome prečka staje u otvor (najmanja dubina) i dozvoljeni nagib; null ako ne staje ni u jednom. */
export function tiltFit(section: Section, rot: number, opening: number): TiltFit | null {
  const order = [rot, rot + 90, rot + 180, rot + 270].map(norm).sort((p, q) => sectionFace(section, p).depth - sectionFace(section, q).depth || (p === norm(rot) ? -1 : q === norm(rot) ? 1 : 0));
  for (const r of order) { const l = tiltLimits(section, r, opening); if (l) return { rot: r, ...l }; }
  return null;
}

/** Unutrašnji otvor po dubini zajednički za obe vođice. */
function channel(L: GuideInfo, R: GuideInfo): { zLo: number; zHi: number } {
  return { zLo: Math.max(L.zc - L.half, R.zc - R.half), zHi: Math.min(L.zc + L.half, R.zc + R.half) };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type ShapeOf = (p: CustomPart) => MatShape | null;
const shapeLookup = (materials: Material[]): ShapeOf => {
  const byId = new Map(materials.map((m) => [m.id, m]));
  return (p) => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
};

/** Vođice prečke (leva, desna) ako i dalje postoje i ispravne su. */
export function guidesOf(model: CustomModel, bar: CustomPart, materials: Material[]): [GuideInfo, GuideInfo] | null {
  if (!bar.guides) return null;
  const shapeOf = shapeLookup(materials);
  const info = (id: string) => { const p = model.parts.find((x) => x.id === id); const s = p && shapeOf(p); return p && s ? guideInfo(p, s) : null; };
  const L = info(bar.guides[0]); const R = info(bar.guides[1]);
  return L && R && L.dirX === 1 && R.dirX === -1 && L.mouthX < R.mouthX ? [L, R] : null;
}

/** Prečka zadovoljava ograničenja svojih vođica (položaj, dužina, dubina, nagib, visina); bez važećih vođica se odvaja. */
function constrainBar(model: CustomModel, bar: CustomPart, shape: MatShape | null, materials: Material[]): CustomPart {
  const g = guidesOf(model, bar, materials);
  if (!g || !shape || shape.type !== 'linear' || norm(bar.angleDeg) !== 0) { const { guides: _drop, ...free } = bar; return free; }
  const [L, R] = g;
  const { zLo, zHi } = channel(L, R);
  const fit = tiltFit(shape.section, bar.rot, zHi - zLo);
  if (!fit) { const { guides: _drop, ...free } = bar; return free; }
  const rot = fit.rot;
  const tilt = clamp(norm(bar.rot) === rot ? bar.tiltDeg ?? 0 : 0, -fit.minus, fit.plus);
  const ext = sectionFace(shape.section, rot + tilt);
  // dužina: kraj u kanalu levo (između dna i otvora) i desno; pomeranje zadržava dužinu dok je moguće
  const xLo = Math.max(L.backX, R.mouthX - bar.lengthMm);
  const xHi = Math.min(L.mouthX, R.backX - bar.lengthMm);
  let x: number; let len: number;
  if (xLo <= xHi + 1e-9) { x = clamp(bar.x, xLo, xHi); len = bar.lengthMm; }
  else { x = clamp(bar.x, L.backX, L.mouthX); len = clamp(bar.x + bar.lengthMm, R.mouthX, R.backX) - x; }
  const y = clamp(bar.y, Math.max(L.y0, R.y0) - ext.u0, Math.min(L.y1, R.y1) - ext.u1);
  const z = (zLo + zHi) / 2 - (ext.v0 + ext.v1) / 2;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { ...bar, x: r(x), y: r(y), z: r(z), lengthMm: r(len), rot, tiltDeg: tilt || undefined };
}

/** Sve uklopljene prečke se vraćaju unutar svojih U profila (posle svake izmene crteža). */
export function applyGuides(model: CustomModel, materials: Material[]): CustomModel {
  if (!model.parts.some((p) => p.guides)) return model;
  const shapeOf = shapeLookup(materials);
  let changed = false;
  const parts = model.parts.map((p) => {
    if (!p.guides) return p;
    const q = constrainBar(model, p, shapeOf(p), materials);
    if (q.x !== p.x || q.y !== p.y || q.z !== p.z || q.lengthMm !== p.lengthMm || q.rot !== p.rot || q.tiltDeg !== p.tiltDeg || q.guides !== p.guides) changed = true;
    return q;
  });
  return changed ? { ...model, parts } : model;
}

/**
 * Bočni U profili su uvek okrenuti ka unutra (kanal ka ispuni): levi pod 270°, desni pod 90° (za uspravan profil nacrtan
 * odozdo naviše). Strana se određuje po položaju u odnosu na sredinu modela. Nagnut U profil se ne dira.
 */
export function orientGuides(model: CustomModel, materials: Material[]): CustomModel {
  const shapeOf = shapeLookup(materials);
  let changed = false;
  const parts = model.parts.map((p) => {
    const s = shapeOf(p);
    if (!s || !isGuideCandidate(p, s)) return p;
    const dirX: 1 | -1 = p.x < model.widthMm / 2 ? 1 : -1;
    const rot = (norm(p.angleDeg) === 90) === (dirX === 1) ? 270 : 90;
    if (p.rot === rot) return p;
    changed = true;
    return { ...p, rot };
  });
  return changed ? { ...model, parts } : model;
}

/**
 * Vodoravna prečka čiji krajevi su uz dva bočna U profila sama se uklapa u njih (ulazi u kanal do dna), kao da je uklopljena
 * dugmetom. Prečka koja ne staje u otvor U profila ostaje gde je.
 */
export function autoAttachBars(model: CustomModel, materials: Material[]): CustomModel {
  const shapeOf = shapeLookup(materials);
  if (!model.parts.some((p) => { const s = shapeOf(p); return !!s && isGuideCandidate(p, s); })) return model;
  let out = model;
  for (const p of model.parts) {
    if (p.guides || (norm(p.angleDeg) !== 0 && norm(p.angleDeg) !== 180)) continue;
    const s = shapeOf(p);
    if (!s || s.type !== 'linear' || s.u) continue;
    const r = attachToGuides(out, p.id, materials);
    if (!('error' in r)) out = r.model;
  }
  return out;
}

export type AttachResult = { model: CustomModel; fit: TiltFit } | { error: string };

/**
 * Uklapanje prečke u bočne U profile: levo i desno od krajeva prečke traže se uspravni U profili, kanali im se okreću ka prečki,
 * a prečka ulazi do dna kanala, na sredinu otvora po dubini. Ako presek ne staje uspravno, prečka se postavlja pod uglom uklapanja.
 */
export function attachToGuides(model: CustomModel, barId: string, materials: Material[]): AttachResult {
  const shapeOf = shapeLookup(materials);
  let bar = model.parts.find((p) => p.id === barId);
  const shape = bar && shapeOf(bar);
  if (!bar || !shape || shape.type !== 'linear') return { error: 'U U profile se uklapaju samo profili (prečke).' };
  if (norm(bar.angleDeg) === 180) bar = { ...bar, x: bar.x - bar.lengthMm, angleDeg: 0, rot: norm(bar.rot + 180) };
  if (norm(bar.angleDeg) !== 0) return { error: 'Prečka mora biti vodoravna da bi ušla u bočne U profile.' };
  const b = bar;
  const near = (end: number, side: 'L' | 'R') => model.parts
    .filter((p) => p.id !== b.id && isGuideCandidate(p, shapeOf(p)!))
    .map((p) => {
      const s = shapeOf(p)!;
      const u = (s as Extract<MatShape, { type: 'linear' }>).u!;
      const y0 = norm(p.angleDeg) === 90 ? p.y : p.y - p.lengthMm;
      return { p, u, d: Math.abs(p.x - end), y0, y1: y0 + p.lengthMm };
    })
    .filter((c) => c.d <= Math.max(c.u.a, c.u.b) / 2 + 60 && b.y >= c.y0 - 50 && b.y <= c.y1 + 50 && (side === 'L' ? c.p.x < b.x + b.lengthMm / 2 : c.p.x > b.x + b.lengthMm / 2))
    .sort((p, q) => p.d - q.d)[0];
  const l = near(b.x, 'L'); const r = near(b.x + b.lengthMm, 'R');
  if (!l || !r || l.p.id === r.p.id) return { error: 'Nisu pronađena dva uspravna U profila uz krajeve prečke. Nacrtajte bočne U profile i prečku između njih.' };
  // kanal leve vođice gleda udesno, desne ulevo: za ugao ose 90° to je okretanje 270° (levo) i 90° (desno), za 270° obrnuto
  const face = (p: CustomPart, dirX: 1 | -1) => ({ ...p, tiltDeg: undefined, rot: (norm(p.angleDeg) === 90) === (dirX === 1) ? 270 : 90 });
  let next: CustomModel = { ...model, parts: model.parts.map((p) => (p.id === l.p.id ? face(p, 1) : p.id === r.p.id ? face(p, -1) : p.id === b.id ? { ...b, guides: [l.p.id, r.p.id] as [string, string] } : p)) };
  const placed = next.parts.find((p) => p.id === b.id)!;
  const g = guidesOf(next, placed, materials);
  if (!g) return { error: 'Bočni U profili su preblizu jedan drugom.' };
  const { zLo, zHi } = channel(g[0], g[1]);
  const fit = tiltFit(shape.section, placed.rot, zHi - zLo);
  if (!fit) return { error: `Presek prečke ne staje u otvor U profila (${Math.round((zHi - zLo) * 10) / 10} mm) ni pod jednim uglom.` };
  // do dna oba kanala; ako uspravno ne staje, prečka se postavlja pod uglom uklapanja
  const upright = sectionFace(shape.section, placed.rot).depth <= zHi - zLo;
  next = { ...next, parts: next.parts.map((p) => (p.id === b.id ? { ...p, x: g[0].backX, lengthMm: g[1].backX - g[0].backX, rot: fit.rot, tiltDeg: upright && norm(placed.rot) === fit.rot ? p.tiltDeg : fit.plus } : p)) };
  return { model: applyGuides(next, materials), fit };
}

/** Podaci za prikaz uklopljene prečke: otvor, ugao uklapanja i trenutni nagib. */
export function guideReport(model: CustomModel, bar: CustomPart, materials: Material[]): { L: GuideInfo; R: GuideInfo; opening: number; zLo: number; zHi: number; fit: TiltFit; section: Section } | null {
  const g = guidesOf(model, bar, materials);
  const shape = shapeLookup(materials)(bar);
  if (!g || !shape || shape.type !== 'linear') return null;
  const { zLo, zHi } = channel(g[0], g[1]);
  const fit = tiltFit(shape.section, bar.rot, zHi - zLo);
  return fit ? { L: g[0], R: g[1], opening: zHi - zLo, zLo, zHi, fit, section: shape.section } : null;
}

/**
 * Razvlačenje modela na polje druge veličine sa vođicama: uklopljene prečke zadržavaju dubinu ulaska u kanal,
 * pa im dužina raste tačno koliko se razmaknu ose bočnih U profila.
 */
export function scaleWithGuides(model: CustomModel, widthMm: number, heightMm: number, materials: Material[]): CustomModel {
  const scaled = scaleModel(model, widthMm, heightMm);
  if (scaled === model || !model.parts.some((p) => p.guides)) return applyGuides(scaled, materials);
  const parts = scaled.parts.map((p) => {
    const orig = model.parts.find((x) => x.id === p.id)!;
    const g0 = guidesOf(model, orig, materials); const g1 = guidesOf(scaled, p, materials);
    if (!g0 || !g1) return p;
    const inL = g0[0].mouthX - orig.x; const inR = orig.x + orig.lengthMm - g0[1].mouthX;
    const x = g1[0].mouthX - inL;
    return { ...p, x, lengthMm: g1[1].mouthX + inR - x };
  });
  return applyGuides({ ...scaled, parts }, materials);
}

/* ---------- raspored prečki između bočnih U profila ---------- */

export interface BarGroup {
  /** prečke grupe odozgo naniže (isti materijal i iste dve vođice) */
  bars: CustomPart[];
  /** visina prečke spreda (sa nagibom) i položaj njenih ivica u odnosu na y dela: u0 (donja) … u1 (gornja) */
  h: number;
  u0: number;
  u1: number;
  /** vodoravni opseg vođica po visini: gornja i donja ivica prostora za prečke */
  yTop: number;
  yBot: number;
  /** grupa nije uklopljena u U profile: prostor je visina modela između ramova */
  free?: boolean;
  /** najmanji razmak između dve susedne prečke (mm): 0 za uspravan presek, negativan kad se nagnute prečke uvlače jedna u drugu */
  gapMin: number;
}

/**
 * Najmanji razmak između dve susedne prečke istog preseka (mm). Prečke su nagnute pa im se preseci uvlače jedan u drugi;
 * zato prečka sme da ode „u minus“ dok se ne dodirne sa gornjom: razmak = najmanji vertikalni korak − vidljiva visina.
 * Zaokruženo tako da se prečke sigurno ne preklapaju (npr. 80 × 20 pod 28,73°: korak 41,62, visina 79,72 → −38,1 mm).
 */
export function minGap(section: Section, deg: number, face: number): number {
  const g = minVerticalPitch(section, deg) - face;
  return Math.min(0, Math.ceil(g * 100 - 1e-6) / 100) + 0;
}

export function barGroup(model: CustomModel, bar: CustomPart, materials: Material[]): BarGroup | null {
  const shape = shapeLookup(materials)(bar);
  if (!bar.guides) return freeBarGroup(model, bar, shape, materials);
  const g = guidesOf(model, bar, materials);
  if (!g || !shape || shape.type !== 'linear') return null;
  const sec = shape.section;
  const e = sectionFace(sec, partAngle(bar));
  const top = (p: CustomPart) => p.y + sectionFace(sec, partAngle(p)).u1;
  const bars = model.parts
    .filter((p) => p.guides && p.guides[0] === bar.guides![0] && p.guides[1] === bar.guides![1] && p.materialId === bar.materialId)
    .sort((a, b) => top(b) - top(a));
  return { bars, h: e.face, u0: e.u0, u1: e.u1, yTop: Math.min(g[0].y1, g[1].y1), yBot: Math.max(g[0].y0, g[1].y0), gapMin: minGap(sec, partAngle(bar), e.face) };
}

/**
 * Prečke koje nisu u bočnim U profilima (nacrtane ili dorađene): grupa su vodoravne prečke istog materijala, preseka i nagiba,
 * jedna iznad druge (isti početak i dužina). Prostor za raspored je visina modela između ramova uz donju i gornju ivicu.
 */
function freeBarGroup(model: CustomModel, bar: CustomPart, shape: MatShape | null, materials: Material[]): BarGroup | null {
  if (!shape || shape.type !== 'linear' || (norm(bar.angleDeg) !== 0 && norm(bar.angleDeg) !== 180)) return null;
  const sec = shape.section;
  const e = sectionFace(sec, partAngle(bar));
  const top = (p: CustomPart) => p.y + sectionFace(sec, partAngle(p)).u1;
  const same = (p: CustomPart) => !p.guides && p.materialId === bar.materialId && norm(p.angleDeg) === norm(bar.angleDeg) && Math.abs(partAngle(p) - partAngle(bar)) < 1e-6
    && Math.abs(p.x - bar.x) < 1 && Math.abs(p.lengthMm - bar.lengthMm) < 1;
  const bars = model.parts.filter(same).sort((a, b) => top(b) - top(a));
  // ramovi uz ivice (vodoravni delovi koji nisu u grupi i dodiruju donju ili gornju ivicu) ograničavaju prostor za prečke
  const shapeOf = shapeLookup(materials);
  let yBot = 0; let yTop = model.heightMm;
  for (const p of model.parts) {
    if (same(p) || (norm(p.angleDeg) !== 0 && norm(p.angleDeg) !== 180)) continue;
    const s = shapeOf(p);
    if (!s || s.type !== 'linear') continue;
    const x = sectionFace(s.section, partAngle(p));
    const lo = p.y + x.u0; const hi = p.y + x.u1;
    if (lo < 1) yBot = Math.max(yBot, hi);
    if (hi > model.heightMm - 1) yTop = Math.min(yTop, lo);
  }
  return { bars, h: e.face, u0: e.u0, u1: e.u1, yTop, yBot, gapMin: minGap(sec, partAngle(bar), e.face), free: true };
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const f = (n: number): string => String(r2(n)).replace('.', ',');

export interface BarLayoutValues { count: number; top: number; bottom: number; gap: number }
export type LayoutAuto = 'gap' | 'bottom' | 'top';

/** Trenutni raspored grupe prečki: broj, odstojanje prve od vrha, poslednje od dna i prosečan razmak (bez vrednosti za jednu prečku). */
export function barLayoutInfo(model: CustomModel, bar: CustomPart, materials: Material[]): (Omit<BarLayoutValues, 'gap'> & { H: number; h: number; gap: number | null; gapMin: number; lufta: Lufta; free: boolean }) | null {
  const grp = barGroup(model, bar, materials);
  if (!grp) return null;
  const sec = (shapeLookup(materials)(bar) as Extract<MatShape, { type: 'linear' }>).section;
  const edge = (p: CustomPart) => ({ t: p.y + sectionFace(sec, partAngle(p)).u1, b: p.y + sectionFace(sec, partAngle(p)).u0 });
  const first = edge(grp.bars[0]); const last = edge(grp.bars[grp.bars.length - 1]);
  const n = grp.bars.length;
  const gap = n >= 2 ? r2((first.t - last.b - n * grp.h) / (n - 1)) : null;
  return {
    H: r2(grp.yTop - grp.yBot), h: r2(grp.h), gapMin: grp.gapMin, count: n, top: r2(grp.yTop - first.t), bottom: r2(last.b - grp.yBot), gap,
    lufta: bar.lufta ?? (gap !== null && gap < 0 ? 'bez' : 'sa'), free: Boolean(grp.free),
  };
}

/**
 * Dozvoljen razmak između prečki za tip ograde. Sa luftom: od 0 do najviše koliko staje (zavisi od broja prečki i zadatih odstojanja).
 * Bez lufta: od najmanjeg mogućeg (negativan kod nagnutih prečki) do 0. Kad se razmak računa sam, vrednost je jedna (min = max).
 */
export function gapRange(info: { H: number; h: number; count: number; top: number; bottom: number; gapMin: number }, auto: LayoutAuto, lufta: Lufta): { min: number; max: number } {
  const n = info.count;
  if (n < 2) return { min: 0, max: 0 };
  const free = info.H - n * info.h;
  const exact = (free - info.top - info.bottom) / (n - 1);
  if (auto === 'gap') return { min: r2(exact), max: r2(exact) };
  const maxFit = (free - (auto === 'top' ? 0 : info.top) - (auto === 'bottom' ? 0 : info.bottom)) / (n - 1);
  return lufta === 'bez' ? { min: info.gapMin, max: 0 } : { min: 0, max: Math.max(0, Math.floor(maxFit * 100) / 100) };
}

export type LayoutResult = { model: CustomModel; values: BarLayoutValues } | { error: string };

/**
 * Raspored n prečki po visini bočnih U profila: odstojanje prve od vrha, poslednje od dna i razmak između prečki.
 * Sve tri mere ne mogu da se zadaju istovremeno (zbir mora da bude jednak visini), pa se jedna računa (`auto`).
 * Ako prečke sa zadatim merama ne staju u visinu bočnih strana, ništa se ne menja i vraća se razlog.
 */
export function layoutBars(model: CustomModel, barId: string, materials: Material[], p: BarLayoutValues & { auto: LayoutAuto; lufta?: Lufta }): LayoutResult {
  const sel = model.parts.find((x) => x.id === barId);
  const grp = sel && barGroup(model, sel, materials);
  if (!sel || !grp) return { error: 'Raspored prečki važi za prečke uklopljene u bočne U profile.' };
  const n = Math.round(p.count);
  if (!(n >= 1)) return { error: 'Broj prečki mora biti najmanje 1.' };
  if (n > 200) return { error: 'Najviše 200 prečki.' };
  const H = grp.yTop - grp.yBot; const h = grp.h;
  const auto: LayoutAuto = n === 1 && p.auto === 'gap' ? 'bottom' : p.auto;
  let { top, bottom, gap } = p;
  if (n === 1) gap = 0;
  const gapMin = grp.gapMin;
  const lufta: Lufta = p.lufta ?? sel.lufta ?? 'sa';
  // sa luftom: razmak 0 … koliko staje; bez lufta: najmanji mogući (negativan) … 0
  const gLo = lufta === 'bez' ? gapMin : 0;
  const deg = Math.abs(sel.tiltDeg ?? 0);
  if (top < 0 || bottom < 0) return { error: 'Odstojanja od vrha i od dna ne mogu biti negativna.' };
  const tooClose = (g: number) => `razmak ${f(g)} mm nije moguć: ${gapMin < 0 ? `pri nagibu od ${f(deg)}° prečke se dodiruju već kad im je razmak ${f(gapMin)} mm, a dalje bi jedna prodrla u drugu` : 'uspravne prečke (bez nagiba) ne mogu da se preklope, najmanji razmak je 0 mm; za negativan razmak nagnite prečke'}.`;
  if (n > 1 && auto !== 'gap' && lufta === 'sa' && gap < -1e-6) return { error: `Operacija nije izvršena: razmak ${f(gap)} mm nije moguć: sa luftom razmak ne može biti negativan (najmanji je 0 mm). Negativan razmak imaju prečke „bez lufta“.` };
  if (n > 1 && auto !== 'gap' && lufta === 'bez' && gap > 1e-6) return { error: `Operacija nije izvršena: razmak ${f(gap)} mm nije moguć: bez lufta razmak ne može biti veći od 0 mm (ostao bi procep između prečki). Za razmak veći od 0 izaberite „Sa luftom“.` };
  if (n > 1 && auto !== 'gap' && lufta === 'bez' && gap < gapMin - 1e-6) return { error: `Operacija nije izvršena: ${tooClose(gap)}` };
  const gaps = Math.max(0, n - 1);
  if (auto === 'gap') gap = (H - top - bottom - n * h) / gaps;
  else if (auto === 'bottom') bottom = H - top - n * h - gaps * gap;
  else top = H - bottom - n * h - gaps * gap;
  if (auto === 'gap' && lufta === 'bez' && gap > 1e-6) {
    const nMin = Math.ceil((H - top - bottom) / h - 1e-9);
    return { error: `Operacija nije izvršena: bez lufta prečke ne smeju da ostave procep, a ${n} prečki sa odstojanjem od vrha ${f(top)} mm i od dna ${f(bottom)} mm ostavlja razmak od ${f(gap)} mm. Potrebno je najmanje ${nMin} prečki (ili manja odstojanja), ili izaberite „Sa luftom“.` };
  }
  const computed = auto === 'gap' ? gap - gLo : auto === 'bottom' ? bottom : top;
  if (computed < -1e-6) {
    const parts = [`${n} × prečka visine ${f(h)} mm (${f(n * h)} mm)`];
    if (auto !== 'top') parts.push(`odstojanje od vrha ${f(top)} mm`);
    if (auto !== 'bottom') parts.push(`odstojanje od dna ${f(bottom)} mm`);
    if (auto !== 'gap' && gaps > 0) parts.push(`${gaps} ${gaps === 1 ? 'razmak' : 'razmaka'} po ${f(gap)} mm (${f(gaps * gap)} mm)`);
    const need = n * h + (auto !== 'top' ? top : 0) + (auto !== 'bottom' ? bottom : 0) + (auto !== 'gap' ? gaps * gap : gaps * gLo);
    return { error: `Operacija nije izvršena: prečke ne staju u visinu bočnih strana. ${parts.join(' + ')}${auto === 'gap' && gaps > 0 ? (gLo < 0 ? ` (sa najmanjim mogućim razmakom ${f(gLo)} mm)` : ' (bez razmaka između prečki)') : ''} zahtevaju ${f(need)} mm, a visina bočnih strana je ${f(H)} mm (nedostaje ${f(need - H)} mm).` };
  }
  // koje prečke ostaju: pri smanjenju broja skidaju se one pri dnu, a izabrana prečka se zadržava
  let keep = grp.bars;
  if (n < keep.length) {
    let drop = keep.length - n;
    const dropIds = new Set<string>();
    for (const b of [...keep].reverse()) { if (drop === 0) break; if (b.id !== sel.id) { dropIds.add(b.id); drop--; } }
    keep = keep.filter((b) => !dropIds.has(b.id));
  }
  const slots: CustomPart[] = [...keep];
  while (slots.length < n) slots.push({ ...sel, id: uid('part') });
  const step = grp.h + gap;
  const placed = new Map<string, CustomPart>();
  slots.forEach((b, i) => {
    const y = grp.yTop - top - i * step - grp.u1;
    placed.set(b.id, { ...b, x: sel.x, lengthMm: sel.lengthMm, rot: sel.rot, tiltDeg: sel.tiltDeg, z: sel.z, lufta, y: Math.round(y * 1000) / 1000 });
  });
  const removed = new Set(grp.bars.filter((b) => !placed.has(b.id)).map((b) => b.id));
  const parts = [...model.parts.filter((x) => !removed.has(x.id)).map((x) => placed.get(x.id) ?? x), ...slots.filter((b) => !model.parts.some((x) => x.id === b.id)).map((b) => placed.get(b.id)!)];
  return { model: applyGuides({ ...model, parts }, materials), values: { count: n, top: r2(top), bottom: r2(bottom), gap: n === 1 ? 0 : r2(gap) } };
}
