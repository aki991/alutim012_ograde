import { contentBounds, partAngle, scaleModel, type CustomModel, type CustomPart, type Lufta } from './custom';
import { materialShape, sectionFace, type MatShape, type Section } from './materialShape';
import { uid } from '../../utils/id';
import { depthRange, minVerticalPitch } from './overlap';
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

/**
 * Vodoravna vođica: U profil (gore ili dole) u čiji kanal ulaze krajevi uspravnih prečki (tarabica). Isto što i `GuideInfo`, samo po
 * visini: kanal donje vođice gleda nagore (dirY = +1), gornje nadole (−1).
 */
export interface HGuideInfo {
  id: string;
  dirY: 1 | -1;
  /** y otvora kanala (ivica stranica) i unutrašnjeg dna kanala */
  mouthY: number;
  backY: number;
  /** sredina i pola unutrašnjeg otvora po dubini (z) */
  zc: number;
  half: number;
  /** dužina vođice po x */
  x0: number;
  x1: number;
  u: { a: number; b: number; c: number };
}

export function hGuideInfo(p: CustomPart, shape: MatShape): HGuideInfo | null {
  if (shape.type !== 'linear' || !shape.u) return null;
  const a = norm(p.angleDeg);
  const t = norm(partAngle(p));
  if ((a !== 0 && a !== 180) || (t !== 90 && t !== 270)) return null;
  // otvor U preseka gleda u smer sin t po normali ose n = (−sin a, cos a) = (0, ±1)
  const ny = a === 0 ? 1 : -1;
  const dirY = (ny * (t === 90 ? 1 : -1)) as 1 | -1;
  const { a: A, b: B, c: C } = shape.u;
  const x0 = a === 0 ? p.x : p.x - p.lengthMm;
  return { id: p.id, dirY, mouthY: p.y + (dirY * B) / 2, backY: p.y - dirY * (B / 2 - C), zc: p.z, half: A / 2 - C, x0, x1: x0 + p.lengthMm, u: shape.u };
}

/** Vodoravan U profil koji može da postane vođica uspravnih prečki (kanal mu se okreće ka prečkama pri uklapanju). */
const isHGuideCandidate = (p: CustomPart, shape: MatShape): boolean => shape.type === 'linear' && !!shape.u && (norm(p.angleDeg) === 0 || norm(p.angleDeg) === 180) && !p.tiltDeg;
const isVerticalBar = (p: CustomPart): boolean => norm(p.angleDeg) === 90 || norm(p.angleDeg) === 270;

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
/** Tolerancija prečki u kanalu (mm) koja se oduzima od otvora U profila. */
export const clearanceOf = (m: CustomModel): number => Math.max(0, m.barClearance ?? 0);

function channel(L: GuideInfo, R: GuideInfo): { zLo: number; zHi: number } {
  return { zLo: Math.max(L.zc - L.half, R.zc - R.half), zHi: Math.min(L.zc + L.half, R.zc + R.half) };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type ShapeOf = (p: CustomPart) => MatShape | null;
export const shapeLookup = (materials: Material[]): ShapeOf => {
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

/** Vođice uspravne prečke (donja, gornja) ako i dalje postoje i ispravne su. */
export function hGuidesOf(model: CustomModel, bar: CustomPart, materials: Material[]): [HGuideInfo, HGuideInfo] | null {
  if (!bar.guides) return null;
  const shapeOf = shapeLookup(materials);
  const info = (id: string) => { const p = model.parts.find((x) => x.id === id); const s = p && shapeOf(p); return p && s ? hGuideInfo(p, s) : null; };
  const B = info(bar.guides[0]); const T = info(bar.guides[1]);
  return B && T && B.dirY === 1 && T.dirY === -1 && B.mouthY < T.mouthY ? [B, T] : null;
}

/** Uspravna prečka u vodoravnim U profilima: dužina (do dna oba kanala), visina, dubina i nagib se ograničavaju na kanale. */
function constrainVBar(model: CustomModel, bar: CustomPart, shape: MatShape | null, materials: Material[]): CustomPart {
  const g = hGuidesOf(model, bar, materials);
  if (!g || !shape || shape.type !== 'linear' || norm(bar.angleDeg) !== 90) { const { guides: _drop, ...free } = bar; return free; }
  const [B, T] = g;
  const zLo = Math.max(B.zc - B.half, T.zc - T.half); const zHi = Math.min(B.zc + B.half, T.zc + T.half);
  const fit = tiltFit(shape.section, bar.rot, zHi - zLo - clearanceOf(model));
  if (!fit) { const { guides: _drop, ...free } = bar; return free; }
  const rot = fit.rot;
  const tilt = clamp(norm(bar.rot) === rot ? bar.tiltDeg ?? 0 : 0, -fit.minus, fit.plus);
  const ext = sectionFace(shape.section, rot + tilt);
  const yLo = Math.max(B.backY, T.mouthY - bar.lengthMm);
  const yHi = Math.min(B.mouthY, T.backY - bar.lengthMm);
  let y: number; let len: number;
  if (yLo <= yHi + 1e-9) { y = clamp(bar.y, yLo, yHi); len = bar.lengthMm; }
  else { y = clamp(bar.y, B.backY, B.mouthY); len = clamp(bar.y + bar.lengthMm, T.mouthY, T.backY) - y; }
  // uspravan profil (ugao 90°): presek se širi ulevo od ose (normala ose je (−1, 0)), pa je x − u1 … x − u0 unutar vođica
  const xLo = Math.max(B.x0, T.x0) + ext.u1; const xHi = Math.min(B.x1, T.x1) + ext.u0;
  const x = xLo <= xHi ? clamp(bar.x, xLo, xHi) : (xLo + xHi) / 2;
  const z = (zLo + zHi) / 2 - (ext.v0 + ext.v1) / 2;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { ...bar, x: r(x), y: r(y), z: r(z), lengthMm: r(len), rot, tiltDeg: tilt || undefined };
}

/** Prečka zadovoljava ograničenja svojih vođica (položaj, dužina, dubina, nagib, visina); bez važećih vođica se odvaja. */
function constrainBar(model: CustomModel, bar: CustomPart, shape: MatShape | null, materials: Material[]): CustomPart {
  if (isVerticalBar(bar)) return constrainVBar(model, bar, shape, materials);
  const g = guidesOf(model, bar, materials);
  if (!g || !shape || shape.type !== 'linear' || norm(bar.angleDeg) !== 0) { const { guides: _drop, ...free } = bar; return free; }
  const [L, R] = g;
  const { zLo, zHi } = channel(L, R);
  const fit = tiltFit(shape.section, bar.rot, zHi - zLo - clearanceOf(model));
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
 * odozdo naviše). Strana se određuje po prečkama koje su u njega uklopljene (leva vođica prečke gleda udesno, desna ulevo), pa model
 * sa više polja (svako ima svoje dve vođice) ostaje ispravan; vođica bez prečke ide po položaju u odnosu na sredinu modela.
 * Nagnut U profil se ne dira.
 */
export function orientGuides(model: CustomModel, materials: Material[]): CustomModel {
  const shapeOf = shapeLookup(materials);
  // sredina crteža (okvir svih delova): model nema unapred zadatu širinu
  const bounds = contentBounds(model, shapeOf);
  const cx = bounds ? (bounds.x0 + bounds.x1) / 2 : model.widthMm / 2;
  // uloga vođice po prečkama: leva (1) ili desna (−1); ako je ista vođica i leva i desna, uloga je nejasna pa važi položaj
  const role = new Map<string, 1 | -1 | 0>();
  for (const q of model.parts) {
    if (!q.guides) continue;
    for (const [id, r] of [[q.guides[0], 1], [q.guides[1], -1]] as [string, 1 | -1][]) role.set(id, role.has(id) && role.get(id) !== r ? 0 : r);
  }
  let changed = false;
  const parts = model.parts.map((p) => {
    const s = shapeOf(p);
    // vodoravni U profil je vođica samo ako je neka uspravna prečka uklopljena u njega: donja gleda nagore, gornja nadole
    if (p.rotLocked) return p; // ručno okrenut profil ostaje kako je okrenut
    if (s && isHGuideCandidate(p, s) && role.has(p.id)) {
      const dirY = role.get(p.id) === 1 ? 1 : -1;
      const rotH = (norm(p.angleDeg) === 0) === (dirY === 1) ? 90 : 270;
      if (p.rot === rotH) return p;
      changed = true;
      return { ...p, rot: rotH };
    }
    if (!s || !isGuideCandidate(p, s)) return p;
    const byBar = role.get(p.id);
    const dirX: 1 | -1 = byBar ? byBar : p.x < cx ? 1 : -1;
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
  if (!model.parts.some((p) => { const s = shapeOf(p); return !!s && (isGuideCandidate(p, s) || isHGuideCandidate(p, s)); })) return model;
  let out = model;
  for (const p of model.parts) {
    // deo rama (dodat dugmetom „Dodaj ram“) nije prečka: ne uklapa se samo u bočne U profile
    if (p.cut45 && p.miter) continue;
    // vodoravno ojačanje se spaja sa bočnim stranama, ne ulazi u U profile kao prečka
    if (p.divider) continue;
    if (p.guides || norm(p.angleDeg) % 90 !== 0) continue;
    const s = shapeOf(p);
    if (!s || s.type !== 'linear' || s.u) continue;
    const r = attachToGuides(out, p.id, materials);
    // bočni U profil koji je ručno okrenut (ravna strana ka ispuni) se ne okreće samo ka prečki: prečka ostaje slobodna
    if ('error' in r) continue;
    const turned = r.model.parts.some((q) => { const o = out.parts.find((x) => x.id === q.id); return !!o && !!o.rotLocked && norm(o.rot) !== norm(q.rot); });
    if (!turned) out = r.model;
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
  if (isVerticalBar(bar)) return attachVBarToGuides(model, bar, shape, materials);
  if (norm(bar.angleDeg) === 180) bar = { ...bar, x: bar.x - bar.lengthMm, angleDeg: 0, rot: norm(bar.rot + 180) };
  if (norm(bar.angleDeg) !== 0) return { error: 'Prečka mora biti vodoravna ili uspravna da bi ušla u U profile.' };
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
  const face = (p: CustomPart, dirX: 1 | -1) => ({ ...p, tiltDeg: undefined, rotLocked: undefined, rot: (norm(p.angleDeg) === 90) === (dirX === 1) ? 270 : 90 });
  let next: CustomModel = { ...model, parts: model.parts.map((p) => (p.id === l.p.id ? face(p, 1) : p.id === r.p.id ? face(p, -1) : p.id === b.id ? { ...b, guides: [l.p.id, r.p.id] as [string, string] } : p)) };
  const placed = next.parts.find((p) => p.id === b.id)!;
  const g = guidesOf(next, placed, materials);
  if (!g) return { error: 'Bočni U profili su preblizu jedan drugom.' };
  const { zLo, zHi } = channel(g[0], g[1]);
  const fit = tiltFit(shape.section, placed.rot, zHi - zLo - clearanceOf(next));
  if (!fit) return { error: `Presek prečke ne staje u otvor U profila (${Math.round((zHi - zLo - clearanceOf(next)) * 10) / 10} mm, uz toleranciju ${clearanceOf(next)} mm) ni pod jednim uglom.` };
  // do dna oba kanala; ako uspravno ne staje, prečka se postavlja pod uglom uklapanja
  const upright = sectionFace(shape.section, placed.rot).depth <= zHi - zLo - clearanceOf(next);
  next = { ...next, parts: next.parts.map((p) => (p.id === b.id ? { ...p, x: g[0].backX, lengthMm: g[1].backX - g[0].backX, rot: fit.rot, tiltDeg: upright && norm(placed.rot) === fit.rot ? p.tiltDeg : -fit.minus } : p)) };
  return { model: applyGuides(next, materials), fit };
}

/**
 * Uklapanje uspravne prečke (tarabice) u vodoravne U profile: ispod donjeg i iznad gornjeg kraja traže se vodoravni U profili,
 * kanali im se okreću ka prečki (donji nagore, gornji nadole), a prečka ulazi do dna oba kanala, na sredinu otvora po dubini.
 */
function attachVBarToGuides(model: CustomModel, input: CustomPart, shape: Extract<MatShape, { type: 'linear' }>, materials: Material[]): AttachResult {
  const shapeOf = shapeLookup(materials);
  let bar = input;
  if (norm(bar.angleDeg) === 270) bar = { ...bar, y: bar.y - bar.lengthMm, angleDeg: 90, rot: norm(bar.rot + 180) };
  const b = bar;
  const barX0 = b.x - sectionFace(shape.section, partAngle(b)).u1; const barX1 = b.x - sectionFace(shape.section, partAngle(b)).u0;
  const near = (end: number, side: 'B' | 'T') => model.parts
    .filter((p) => p.id !== b.id && isHGuideCandidate(p, shapeOf(p)!))
    .map((p) => {
      const u = (shapeOf(p) as Extract<MatShape, { type: 'linear' }>).u!;
      const x0 = norm(p.angleDeg) === 0 ? p.x : p.x - p.lengthMm;
      return { p, u, d: Math.abs(p.y - end), x0, x1: x0 + p.lengthMm };
    })
    .filter((c) => c.d <= Math.max(c.u.a, c.u.b) / 2 + 60 && barX1 >= c.x0 - 50 && barX0 <= c.x1 + 50 && (side === 'B' ? c.p.y < b.y + b.lengthMm / 2 : c.p.y > b.y + b.lengthMm / 2))
    .sort((p, q) => p.d - q.d)[0];
  const lo = near(b.y, 'B'); const hi = near(b.y + b.lengthMm, 'T');
  if (!lo || !hi || lo.p.id === hi.p.id) return { error: 'Nisu pronađena dva vodoravna U profila uz krajeve prečke (gore i dole). Nacrtajte U profile i uspravnu prečku između njih.' };
  // kanal donje vođice gleda nagore, gornje nadole
  const face = (p: CustomPart, dirY: 1 | -1) => ({ ...p, tiltDeg: undefined, rotLocked: undefined, rot: (norm(p.angleDeg) === 0) === (dirY === 1) ? 90 : 270 });
  let next: CustomModel = { ...model, parts: model.parts.map((p) => (p.id === lo.p.id ? face(p, 1) : p.id === hi.p.id ? face(p, -1) : p.id === b.id ? { ...b, guides: [lo.p.id, hi.p.id] as [string, string] } : p)) };
  const placed = next.parts.find((p) => p.id === b.id)!;
  const g = hGuidesOf(next, placed, materials);
  if (!g) return { error: 'U profili su preblizu jedan drugom.' };
  const zLo = Math.max(g[0].zc - g[0].half, g[1].zc - g[1].half); const zHi = Math.min(g[0].zc + g[0].half, g[1].zc + g[1].half);
  const fit = tiltFit(shape.section, placed.rot, zHi - zLo - clearanceOf(next));
  if (!fit) return { error: `Presek prečke ne staje u otvor U profila (${Math.round((zHi - zLo - clearanceOf(next)) * 10) / 10} mm, uz toleranciju ${clearanceOf(next)} mm) ni pod jednim uglom.` };
  const upright = sectionFace(shape.section, placed.rot).depth <= zHi - zLo - clearanceOf(next);
  next = { ...next, parts: next.parts.map((p) => (p.id === b.id ? { ...p, y: g[0].backY, lengthMm: g[1].backY - g[0].backY, rot: fit.rot, tiltDeg: upright && norm(placed.rot) === fit.rot ? p.tiltDeg : -fit.minus } : p)) };
  return { model: applyGuides(next, materials), fit };
}

/** Podaci za prikaz uklopljene prečke: otvor, ugao uklapanja i trenutni nagib. */
export function guideReport(model: CustomModel, bar: CustomPart, materials: Material[]): { L: GuideInfo; R: GuideInfo; opening: number; zLo: number; zHi: number; fit: TiltFit; section: Section } | null {
  const g = guidesOf(model, bar, materials);
  const shape = shapeLookup(materials)(bar);
  if (!g || !shape || shape.type !== 'linear') return null;
  const { zLo, zHi } = channel(g[0], g[1]);
  const fit = tiltFit(shape.section, bar.rot, zHi - zLo - clearanceOf(model));
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
  /** slobodna grupa sa prečkama različite debljine: visina spreda i položaj gornje ivice (u1) svake prečke, istim redom kao `bars`; bez toga sve prečke imaju h i u1 */
  hs?: number[];
  u1s?: number[];
  /** najmanji razmak između dve susedne prečke (mm): 0 za uspravan presek, negativan kad se nagnute prečke uvlače jedna u drugu */
  gapMin: number;
  /** najveće uvlačenje prečki (mm) ako je razmak ograničen pravilom za ovaj profil (Z profil, cev 80 × 20); bez vrednosti važi samo presek */
  gapCap?: number;
}

/**
 * Najmanji razmak između dve susedne prečke istog preseka (mm). Prečke su nagnute pa im se preseci uvlače jedan u drugi;
 * zato prečka sme da ode „u minus“ dok se ne dodirne sa gornjom: razmak = najmanji vertikalni korak − vidljiva visina.
 * Zaokruženo tako da se prečke sigurno ne preklapaju (npr. 80 × 20 pod 28,73°: korak 41,62, visina 79,72 → −38,1 mm).
 */
export interface GapLimit { mm: number; /** true: najmanji razmak je tačno −mm (Z profil); false: najviše −mm (ograničenje) */ exact: boolean }

/**
 * Najveće uvlačenje prečki jedna u drugu bez lufta (mm): Z profili tačno 20 mm (razmak −20), a kvadratna cev 80 × 20 u bočnim U profilima
 * najviše 15 mm (razmak najmanje −15). Ostali profili: samo ono što dozvoljava presek.
 */
export function gapLimitOf(shape: MatShape | null | undefined): GapLimit | undefined {
  if (!shape || shape.type !== 'linear') return undefined;
  if (shape.group === 'z') return { mm: Z_MAX_OVERLAP_MM, exact: true };
  const { w, h } = shape.section;
  if (shape.group === 'kv' && ((Math.abs(w - 80) < 0.5 && Math.abs(h - 20) < 0.5) || (Math.abs(w - 20) < 0.5 && Math.abs(h - 80) < 0.5))) return { mm: 15, exact: false };
  return undefined;
}

/** ograničenje razmaka grupe prečki: najstrože (najmanje uvlačenje) među njenim profilima */
const capOf = (shapes: (MatShape | null | undefined)[]): number | undefined => { const l = shapes.map(gapLimitOf).filter((x): x is GapLimit => !!x); return l.length ? Math.min(...l.map((x) => x.mm)) : undefined; };

export function minGap(section: Section, deg: number, face: number, limit?: GapLimit): number {
  const g = minVerticalPitch(section, deg) - face;
  const calc = Math.min(0, Math.ceil(g * 100 - 1e-6) / 100) + 0;
  if (!limit) return calc;
  return (limit.exact ? -limit.mm : Math.max(calc, -limit.mm)) + 0;
}

/** koliko se Z profili (bez lufta) najviše uvlače jedan u drugi: razmak −20 mm */
export const Z_MAX_OVERLAP_MM = 20;

/**
 * Polja koja vodoravna ojačanja (`divider`) prave u prostoru za prečke [yBot, yTop]: odozdo naviše, svako sa donjom i gornjom granicom i
 * oznakom da li je granica ojačanje. Bez ojačanja jedno polje (ceo prostor).
 */
export function dividerZones(model: CustomModel, yBot: number, yTop: number, materials: Material[]): { y0: number; y1: number; lowDiv: boolean; highDiv: boolean }[] {
  const shapeOf = shapeLookup(materials);
  const divs = model.parts.filter((p) => p.divider && norm(p.angleDeg) % 180 === 0).map((p) => {
    const s = shapeOf(p);
    if (!s || s.type !== 'linear') return null;
    const x = sectionFace(s.section, partAngle(p));
    return { lo: p.y + x.u0, hi: p.y + x.u1 };
  }).filter((d): d is { lo: number; hi: number } => !!d && d.lo > yBot + 1 && d.hi < yTop - 1).sort((a, b) => a.lo - b.lo);
  const zones: { y0: number; y1: number; lowDiv: boolean; highDiv: boolean }[] = [];
  let y0 = yBot; let lowDiv = false;
  for (const d of divs) { zones.push({ y0, y1: d.lo, lowDiv, highDiv: true }); y0 = d.hi; lowDiv = true; }
  zones.push({ y0, y1: yTop, lowDiv, highDiv: false });
  return zones;
}

/** polje u kome je sredina prečke; prečke iz drugih polja ne pripadaju njenoj grupi */
function zoneOf(model: CustomModel, bar: CustomPart, yBot: number, yTop: number, materials: Material[]) {
  const s = shapeLookup(materials)(bar);
  const x = s && s.type === 'linear' ? sectionFace(s.section, partAngle(bar)) : { u0: 0, u1: 0 };
  const c = bar.y + (x.u0 + x.u1) / 2;
  const zones = dividerZones(model, yBot, yTop, materials);
  return zones.find((z) => c >= z.y0 - 1e-6 && c <= z.y1 + 1e-6) ?? zones[0];
}

export function barGroup(model: CustomModel, bar: CustomPart, materials: Material[]): BarGroup | null {
  const shape = shapeLookup(materials)(bar);
  if (!bar.guides) return freeBarGroup(model, bar, shape, materials);
  const g = guidesOf(model, bar, materials);
  if (!g || !shape || shape.type !== 'linear') return null;
  const sec = shape.section;
  const e = sectionFace(sec, partAngle(bar));
  const shapeOf = shapeLookup(materials);
  const linear = (p: CustomPart) => { const s = shapeOf(p); return s && s.type === 'linear' ? s : null; };
  // prečke različite debljine (drugi materijal) u istim vođicama čine jednu grupu: razmak se zadaje za sve zajedno
  const face = (p: CustomPart) => sectionFace(linear(p)!.section, partAngle(p));
  // vodoravno ojačanje deli visinu bočnih strana na polja: grupa su prečke u polju izabrane prečke, a prostor je to polje
  const gyTop = Math.min(g[0].y1, g[1].y1); const gyBot = Math.max(g[0].y0, g[1].y0);
  const zone = zoneOf(model, bar, gyBot, gyTop, materials);
  const inZone = (p: CustomPart) => { const x = face(p); const c = p.y + (x.u0 + x.u1) / 2; return c >= zone.y0 - 1e-6 && c <= zone.y1 + 1e-6; };
  const members = model.parts.filter((p) => p.guides && p.guides[0] === bar.guides![0] && p.guides[1] === bar.guides![1] && linear(p) && inZone(p));
  const bars = members.sort((a, b) => (b.y + face(b).u1) - (a.y + face(a).u1));
  const faces = bars.map(face);
  const hs = faces.map((x) => x.face);
  const mixed = hs.some((x) => Math.abs(x - hs[0]) > 1e-6) || bars.some((b) => b.materialId !== bar.materialId);
  const gapMin = mixed ? Math.max(...bars.map((b, i) => minGap(linear(b)!.section, partAngle(b), faces[i].face, gapLimitOf(linear(b))))) : minGap(sec, partAngle(bar), e.face, gapLimitOf(shape));
  return { bars, h: e.face, u0: e.u0, u1: e.u1, yTop: zone.y1, yBot: zone.y0, gapMin, gapCap: capOf(bars.map((b) => linear(b))), ...(mixed ? { hs, u1s: faces.map((x) => x.u1) } : {}) };
}

/**
 * Prečke koje nisu u bočnim U profilima (nacrtane ili dorađene): grupa su vodoravne prečke istog materijala, preseka i nagiba,
 * jedna iznad druge (isti početak i dužina). Prostor za raspored je visina modela između ramova uz donju i gornju ivicu.
 */
function freeBarGroup(model: CustomModel, bar: CustomPart, shape: MatShape | null, materials: Material[]): BarGroup | null {
  // vodoravno ojačanje nije prečka: nema svoj raspored
  if (bar.divider) return null;
  if (!shape || shape.type !== 'linear' || (norm(bar.angleDeg) !== 0 && norm(bar.angleDeg) !== 180)) return null;
  const sec = shape.section;
  const e = sectionFace(sec, partAngle(bar));
  const shapeOf = shapeLookup(materials);
  const top = (p: CustomPart) => p.y + sectionFace(sec, partAngle(p)).u1;
  const span = (p: CustomPart): [number, number] => [Math.min(p.x, p.x + p.lengthMm), Math.max(p.x, p.x + p.lengthMm)];
  /** prečke istog materijala moraju imati isti početak i dužinu; drugog materijala (druga debljina) dovoljno je da leže u istom polju */
  const overlaps = (p: CustomPart): boolean => { const [a0, a1] = span(p); const [b0, b1] = span(bar); return Math.min(a1, b1) - Math.max(a0, b0) >= 0.7 * Math.min(a1 - a0, b1 - b0); };
  const geom = (p: CustomPart) => !p.guides && norm(p.angleDeg) === norm(bar.angleDeg) && Math.abs(partAngle(p) - partAngle(bar)) < 1e-6
    && (p.materialId === bar.materialId ? Math.abs(p.x - bar.x) < 1 && Math.abs(p.lengthMm - bar.lengthMm) < 1 : overlaps(p));
  // prečke druge debljine (drugi materijal) koje stoje između ramova ulaze u istu grupu: razmak se zadaje za sve prečke zajedno
  const inner = (p: CustomPart): boolean => {
    const s = shapeOf(p);
    if (!s || s.type !== 'linear') return false;
    const x = sectionFace(s.section, partAngle(p));
    return p.y + x.u0 > 1 && p.y + x.u1 < model.heightMm - 1;
  };
  // grupa su samo prečke u istoj ravni (po dubini): delovi iza ili ispred njih (drugi sloj) ne ulaze u raspored
  const myDepth = depthRange(bar, materials);
  const sameLayer = (p: CustomPart): boolean => { const d = depthRange(p, materials); return !myDepth || !d || Math.min(d.z1, myDepth.z1) - Math.max(d.z0, myDepth.z0) > 0.5 * Math.min(d.z1 - d.z0, myDepth.z1 - myDepth.z0); };
  const same = (p: CustomPart) => !p.divider && geom(p) && sameLayer(p) && (p.materialId === bar.materialId || inner(p));
  const edgeOf = (p: CustomPart) => { const s = shapeOf(p) as Extract<MatShape, { type: 'linear' }>; return sectionFace(s.section, partAngle(p)); };
  const topOf = (p: CustomPart) => p.y + edgeOf(p).u1;
  const all = model.parts.filter(same);
  void top;
  // ramovi uz ivice (vodoravni delovi koji nisu u grupi i dodiruju donju ili gornju ivicu) ograničavaju prostor za prečke
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
  // vodoravno ojačanje deli prostor na polja: grupa su prečke u polju izabrane prečke
  const zone = zoneOf(model, bar, yBot, yTop, materials);
  yBot = zone.y0; yTop = zone.y1;
  const bars = all.filter((p) => { const x = edgeOf(p); const c = p.y + (x.u0 + x.u1) / 2; return c >= yBot - 1e-6 && c <= yTop + 1e-6; }).sort((a, b) => topOf(b) - topOf(a));
  const faces = bars.map(edgeOf);
  const hs = faces.map((x) => x.face);
  const mixed = hs.some((x) => Math.abs(x - hs[0]) > 1e-6);
  // najmanji razmak: za prečke različitih preseka uzima se najstroži (najbliži nuli)
  const gapMin = Math.max(...bars.map((b) => { const x = edgeOf(b); const s = shapeOf(b) as Extract<MatShape, { type: 'linear' }>; return minGap(s.section, partAngle(b), x.face, gapLimitOf(s)); }));
  return { bars, h: e.face, u0: e.u0, u1: e.u1, yTop, yBot, gapCap: capOf(bars.map((b) => shapeOf(b))), gapMin: mixed ? gapMin : minGap(sec, partAngle(bar), e.face, gapLimitOf(shapeOf(bar))), free: true, ...(mixed ? { hs, u1s: faces.map((x) => x.u1) } : {}) };
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const f = (n: number): string => String(r2(n)).replace('.', ',');

export interface BarLayoutValues { count: number; top: number; bottom: number; gap: number }
export type LayoutAuto = 'gap' | 'bottom' | 'top';

/** Trenutni raspored grupe prečki: broj, odstojanje prve od vrha, poslednje od dna i prosečan razmak (bez vrednosti za jednu prečku). */
export function barLayoutInfo(model: CustomModel, bar: CustomPart, materials: Material[]): (Omit<BarLayoutValues, 'gap'> & { H: number; h: number; gap: number | null; gapMin: number; lufta: Lufta; free: boolean; mixed: boolean }) | null {
  const grp = barGroup(model, bar, materials);
  if (!grp) return null;
  const shapeOf = shapeLookup(materials);
  const edge = (p: CustomPart) => { const x = sectionFace((shapeOf(p) as Extract<MatShape, { type: 'linear' }>).section, partAngle(p)); return { t: p.y + x.u1, b: p.y + x.u0 }; };
  const sumH = grp.hs ? grp.hs.reduce((a, b) => a + b, 0) : grp.bars.length * grp.h;
  const first = edge(grp.bars[0]); const last = edge(grp.bars[grp.bars.length - 1]);
  const n = grp.bars.length;
  const gap = n >= 2 ? r2((first.t - last.b - sumH) / (n - 1)) : null;
  return {
    H: r2(grp.yTop - grp.yBot), h: r2(sumH / n), gapMin: grp.gapMin, count: n, top: r2(grp.yTop - first.t), bottom: r2(last.b - grp.yBot), gap,
    lufta: bar.lufta ?? (gap !== null && gap < 0 ? 'bez' : 'sa'), free: Boolean(grp.free), mixed: Boolean(grp.hs),
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
export function layoutBars(model: CustomModel, barId: string, materials: Material[], p: BarLayoutValues & { auto: LayoutAuto; lufta?: Lufta; countChange?: boolean }): LayoutResult {
  const sel = model.parts.find((x) => x.id === barId);
  const grp = sel && barGroup(model, sel, materials);
  if (!sel || !grp) return { error: 'Raspored prečki važi za prečke uklopljene u bočne U profile.' };
  const n = Math.round(p.count);
  if (!(n >= 1)) return { error: 'Broj prečki mora biti najmanje 1.' };
  if (n > 200) return { error: 'Najviše 200 prečki.' };
  const H = grp.yTop - grp.yBot;
  const hsOf = grp.hs ?? grp.bars.map(() => grp.h);
  const u1sOf = grp.u1s ?? grp.bars.map(() => grp.u1);
  const sumH = hsOf.reduce((a, b) => a + b, 0);
  const mixed = hsOf.some((x) => Math.abs(x - hsOf[0]) > 1e-6);
  if (mixed && n !== grp.bars.length) return { error: 'Broj prečki ne može da se menja kad su prečke različite debljine. Razmak i odstojanja se zadaju za sve prečke zajedno.' };
  const h = sumH / grp.bars.length;
  /** ukupna visina n prečki */
  const stack = (cnt: number) => (cnt === grp.bars.length ? sumH : cnt * h);
  let auto: LayoutAuto = n === 1 && p.auto === 'gap' ? 'bottom' : p.auto;
  let { top, bottom, gap } = p;
  if (n === 1) gap = 0;
  const gapMin = grp.gapMin;
  const lufta: Lufta = p.lufta ?? sel.lufta ?? 'sa';
  // sa luftom: razmak 0 … koliko staje; bez lufta: najmanji mogući (negativan) … 0
  const gLo = lufta === 'bez' ? gapMin : 0;
  const deg = Math.abs(sel.tiltDeg ?? 0);
  // najveći broj prečki koji staje (odstojanje od vrha 0, najmanji mogući razmak)
  const maxCount = Math.max(1, Math.floor((H + gLo) / (h + gLo) + 1e-9));
  if (p.countChange && n > 1) {
    // broj prečki ima prioritet: razmak (pa odstojanje od vrha) se prilagođava dok god prečke fizički staju
    if (n > maxCount) return { error: `Operacija nije izvršena: ${n} prečki ne staje u visinu bočnih strana (${f(H)} mm), čak ni sa najmanjim mogućim razmakom${gLo < 0 ? ` od ${f(gLo)} mm` : ' (prečke se dodiruju)'}. Najviše prečki koje može da se postavi: ${maxCount}.` };
    const gp = n - 1;
    gap = lufta === 'bez' ? Math.min(0, Math.max(gLo, gap)) : Math.max(0, gap);
    if (top < 0) top = 0;
    if (stack(n) + top + gp * gap > H + 1e-6) {
      const g = (H - top - stack(n)) / gp;
      if (g >= gLo - 1e-6) gap = Math.max(gLo, g);
      else { gap = gLo; top = Math.max(0, H - stack(n) - gp * gLo); }
    }
    auto = 'bottom';
  }
  if (top < 0 || bottom < 0) return { error: 'Odstojanja od vrha i od dna ne mogu biti negativna.' };
  const capped = grp.gapCap !== undefined && gapMin < 0 && gapMin >= -grp.gapCap - 1e-6;
  const tooClose = (g: number) => `razmak ${f(g)} mm nije moguć: ${capped ? `za ovu ogradu je najmanji razmak ${f(gapMin)} mm (prečke se uvlače jedna u drugu najviše ${f(-gapMin)} mm)` : gapMin < 0 ? `pri nagibu od ${f(deg)}° prečke se dodiruju već kad im je razmak ${f(gapMin)} mm, a dalje bi jedna prodrla u drugu` : 'uspravne prečke (bez nagiba) ne mogu da se preklope, najmanji razmak je 0 mm; za negativan razmak nagnite prečke'}.`;
  if (n > 1 && auto !== 'gap' && lufta === 'sa' && gap < -1e-6) return { error: `Operacija nije izvršena: razmak ${f(gap)} mm nije moguć: sa luftom razmak ne može biti negativan (najmanji je 0 mm). Negativan razmak imaju prečke „bez lufta“.` };
  if (n > 1 && auto !== 'gap' && lufta === 'bez' && gap > 1e-6) return { error: `Operacija nije izvršena: razmak ${f(gap)} mm nije moguć: bez lufta razmak ne može biti veći od 0 mm (ostao bi procep između prečki). Za razmak veći od 0 izaberite „Sa luftom“.` };
  if (n > 1 && auto !== 'gap' && lufta === 'bez' && gap < gapMin - 1e-6) return { error: `Operacija nije izvršena: ${tooClose(gap)}` };
  const gaps = Math.max(0, n - 1);
  if (auto === 'gap') gap = (H - top - bottom - stack(n)) / gaps;
  else if (auto === 'bottom') bottom = H - top - stack(n) - gaps * gap;
  else top = H - bottom - stack(n) - gaps * gap;
  if (auto === 'gap' && lufta === 'bez' && gap > 1e-6) {
    const nMin = Math.ceil((H - top - bottom) / h - 1e-9);
    return { error: `Operacija nije izvršena: bez lufta prečke ne smeju da ostave procep, a ${n} prečki sa odstojanjem od vrha ${f(top)} mm i od dna ${f(bottom)} mm ostavlja razmak od ${f(gap)} mm. Potrebno je najmanje ${nMin} prečki (ili manja odstojanja), ili izaberite „Sa luftom“.` };
  }
  const computed = auto === 'gap' ? gap - gLo : auto === 'bottom' ? bottom : top;
  if (computed < -1e-6) {
    const parts = [`${n} × prečka visine ${f(h)} mm (${f(stack(n))} mm)`];
    if (auto !== 'top') parts.push(`odstojanje od vrha ${f(top)} mm`);
    if (auto !== 'bottom') parts.push(`odstojanje od dna ${f(bottom)} mm`);
    if (auto !== 'gap' && gaps > 0) parts.push(`${gaps} ${gaps === 1 ? 'razmak' : 'razmaka'} po ${f(gap)} mm (${f(gaps * gap)} mm)`);
    const need = stack(n) + (auto !== 'top' ? top : 0) + (auto !== 'bottom' ? bottom : 0) + (auto !== 'gap' ? gaps * gap : gaps * gLo);
    return { error: `Operacija nije izvršena: prečke ne staju u visinu bočnih strana. ${parts.join(' + ')}${auto === 'gap' && gaps > 0 ? (gLo < 0 ? ` (sa najmanjim mogućim razmakom ${f(gLo)} mm)` : ' (bez razmaka između prečki)') : ''} zahtevaju ${f(need)} mm, a visina bočnih strana je ${f(H)} mm (nedostaje ${f(need - H)} mm). Najviše prečki koje staje (uz najmanji razmak i bez odstojanja od vrha): ${maxCount}.` };
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
  const placed = new Map<string, CustomPart>();
  const selIdx = Math.max(0, grp.bars.findIndex((x) => x.id === sel.id));
  let acc = 0;
  slots.forEach((b, i) => {
    const bi = grp.bars.findIndex((x) => x.id === b.id);
    const hb = bi >= 0 ? hsOf[bi] : hsOf[selIdx];
    const u1b = bi >= 0 ? u1sOf[bi] : u1sOf[selIdx];
    const y = grp.yTop - top - acc - i * gap - u1b;
    acc += hb;
    // prečka drugog materijala zadržava svoju okrenutost i dubinu
    const own = b.materialId === sel.materialId;
    placed.set(b.id, { ...b, x: own ? sel.x : b.x, lengthMm: own ? sel.lengthMm : b.lengthMm, rot: own ? sel.rot : b.rot, tiltDeg: sel.tiltDeg, z: own ? sel.z : b.z, lufta, y: Math.round(y * 1000) / 1000 });
  });
  const removed = new Set(grp.bars.filter((b) => !placed.has(b.id)).map((b) => b.id));
  const parts = [...model.parts.filter((x) => !removed.has(x.id)).map((x) => placed.get(x.id) ?? x), ...slots.filter((b) => !model.parts.some((x) => x.id === b.id)).map((b) => placed.get(b.id)!)];
  return { model: applyGuides({ ...model, parts }, materials), values: { count: n, top: r2(top), bottom: r2(bottom), gap: n === 1 ? 0 : r2(gap) } };
}
