import type { DrawnKind, DrawnSection } from './types';

/**
 * Ručno nacrtan presek profila (strana Materijali i cene → „Nacrtaj element“).
 * Korisnik crta liniju zida (sredinu zida) i zadaje debljinu zida; presek je ta linija podebljana za debljinu zida.
 * Otvorena linija daje profil sa krakovima (U, C, L, Z, traka), zatvorena daje cev (spoljna ivica i otvor).
 */

type P = [number, number];

export interface DrawnPoly { outline: P[]; holes: P[][] }

export const DRAWN_KIND_LABELS: Record<DrawnKind, string> = {
  u: 'U profil', c: 'C profil', l: 'L profil', z: 'Z profil', kv: 'Kvadratna / pravougaona cev', traka: 'Traka (pun presek)', ostalo: 'Ostalo',
};

/** Polazni oblici: A je širina, B visina (spoljne mere, mm), t debljina zida. */
export function drawnPreset(kind: DrawnKind, a: number, b: number, t: number): DrawnSection {
  const h = t / 2;
  switch (kind) {
    // U profil: leđa gore (kao U profili iz cenovnika), krakovi nadole
    case 'u': return { kind, wall: t, closed: false, pts: [[h, 0], [h, b - h], [a - h, b - h], [a - h, 0]] };
    // C profil: U sa ivicama savijenim ka unutra (otvor na donjoj strani)
    case 'c': { const lip = Math.max(t * 2, a / 4); return { kind, wall: t, closed: false, pts: [[lip, h], [h, h], [h, b - h], [a - h, b - h], [a - h, h], [a - lip, h]] }; }
    case 'l': return { kind, wall: t, closed: false, pts: [[h, b], [h, h], [a, h]] };
    case 'z': return { kind, wall: t, closed: false, pts: [[0, h], [a / 2, h], [a / 2, b - h], [a, b - h]] };
    case 'kv': return { kind, wall: t, closed: true, pts: [[h, h], [a - h, h], [a - h, b - h], [h, b - h]] };
    // traka: jedna linija debljine B
    case 'traka': return { kind, wall: b, closed: false, pts: [[0, 0], [a, 0]] };
    default: return { kind, wall: t, closed: false, pts: [[0, 0], [a, 0], [a, b]] };
  }
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (v: P): number => Math.hypot(v[0], v[1]);
const area = (pts: P[]): number => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** Tačke bez ponavljanja (uzastopne iste tačke i, kod zatvorene linije, poslednja = prva). */
export function cleanPts(pts: P[], closed: boolean): P[] {
  const out: P[] = [];
  for (const p of pts) if (Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!out.length || len(sub(p, out[out.length - 1])) > 1e-6)) out.push([p[0], p[1]]);
  if (closed && out.length > 2 && len(sub(out[0], out[out.length - 1])) <= 1e-6) out.pop();
  return out;
}

/** Linija pomerena za d (levo od smera kretanja) sa spojenim uglovima (presek susednih pomerenih duži). */
function offsetLine(pts: P[], d: number, closed: boolean): P[] {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const normal = (i: number): P => { const a = pts[i]; const b = pts[(i + 1) % n]; const v = sub(b, a); const l = len(v); return [-v[1] / l, v[0] / l]; };
  const normals = Array.from({ length: segs }, (_, i) => normal(i));
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? (i - 1 + segs) % segs : i - 1;
    const next = closed ? i % segs : i;
    if (prev < 0 || next >= segs) { const nn = normals[prev < 0 ? next : prev]; out.push([pts[i][0] + nn[0] * d, pts[i][1] + nn[1] * d]); continue; }
    const n1 = normals[prev]; const n2 = normals[next];
    // simetrala uglova: pomeraj d / cos(pola ugla), ograničen da oštri uglovi ne bi dali predugačak vrh
    const bis: P = [n1[0] + n2[0], n1[1] + n2[1]];
    const bl = len(bis);
    if (bl < 1e-9) { out.push([pts[i][0] + n1[0] * d, pts[i][1] + n1[1] * d]); continue; }
    const cosHalf = bl / 2;
    const k = d / Math.max(cosHalf, 0.25);
    out.push([pts[i][0] + (bis[0] / bl) * k, pts[i][1] + (bis[1] / bl) * k]);
  }
  return out;
}

/** Poligoni preseka (pre centriranja); prazno kad linija nema bar dve tačke (zatvorena tri) ili zid nije pozitivan. */
export function drawnPolys(d: Pick<DrawnSection, 'pts' | 'wall' | 'closed'>): DrawnPoly[] {
  const pts = cleanPts(d.pts, d.closed);
  const t = d.wall;
  if (!(t > 0) || pts.length < (d.closed ? 3 : 2)) return [];
  const h = t / 2;
  if (d.closed) {
    const a = offsetLine(pts, h, true); const b = offsetLine(pts, -h, true);
    const [outer, inner] = Math.abs(area(a)) >= Math.abs(area(b)) ? [a, b] : [b, a];
    // otvor postoji samo ako je zid tanji od pola manje mere cevi (unutrašnja linija ne prelazi preko sebe)
    const ok = Math.sign(area(inner)) === Math.sign(area(outer)) && Math.abs(area(inner)) > 1e-6;
    return [{ outline: outer, holes: ok ? [inner] : [] }];
  }
  const left = offsetLine(pts, h, false); const right = offsetLine(pts, -h, false);
  return [{ outline: [...left, ...right.reverse()], holes: [] }];
}

/** Ispravan nacrtan presek (može da se sačuva): bar dve tačke (zatvoren bar tri) i zid > 0. */
export const drawnValid = (d: DrawnSection | undefined): d is DrawnSection => !!d && drawnPolys(d).length > 0;

/** Okvir preseka (mm). */
export function drawnBounds(polys: DrawnPoly[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p.outline) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/** Spoljne mere nacrtanog preseka (širina × visina, mm). */
export function drawnSize(d: DrawnSection): { w: number; h: number } {
  const b = drawnBounds(drawnPolys(d));
  const r = (n: number) => Math.round(n * 100) / 100;
  return Number.isFinite(b.x0) ? { w: r(b.x1 - b.x0), h: r(b.y1 - b.y0) } : { w: 0, h: 0 };
}

/** Predlog naziva materijala za nacrtan presek, npr. „U profil 60×28×2 (nacrtan)“. */
export function drawnName(d: DrawnSection): string {
  const { w, h } = drawnSize(d);
  const f = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  const label = d.kind === 'kv' ? 'Cev' : d.kind === 'ostalo' ? 'Profil' : DRAWN_KIND_LABELS[d.kind];
  return d.kind === 'traka' ? `${label} ${f(w)}×${f(h)} (nacrtan)` : `${label} ${f(w)}×${f(h)}×${f(d.wall)} (nacrtan)`;
}
