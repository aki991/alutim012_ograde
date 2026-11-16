/**
 * Rep samonoseće klizne kapije: kosnik (od gornjeg ugla krila do kraja), donja pojasnica i ojačanja (uspravno, vodoravno, koso).
 * Cevi se seku pod uglom da naležu jedna na drugu (kao na stvarnoj kapiji): računaju se poligoni cevi, dužina po dužoj strani
 * i uglovi sečenja svakog kraja (ugao između ravni reza i ose cevi; 90° je ravan rez). Koso ojačanje koje ide u ugao između rama
 * i donje pojasnice je zasečeno u V (dva reza: uz ram i uz pojasnicu).
 */

export type BraceKind = 'vertical' | 'horizontal' | 'diagonal';
export const BRACE_LABELS: Record<BraceKind, string> = { vertical: 'Uspravno', horizontal: 'Vodoravno', diagonal: 'Koso' };

export interface TailBrace {
  id: string;
  kind: BraceKind;
  /** uspravno: X na donjoj pojasnici; vodoravno: visina od tla; koso: X donjeg kraja na pojasnici (polazno u uglu uz ram) */
  pos?: number;
  /** samo koso: X gornjeg kraja na kosniku */
  pos2?: number;
  /** širina cevi u pogledu (iz izabranog profila) */
  w?: number;
}

export interface TailMember {
  /** ključ stavke sastavnice */
  bomKey: string;
  label: string;
  poly: [number, number][];
  /** dužina po dužoj strani (mm): to je krojna mera */
  len: number;
  /** uglovi reza na početku i na kraju ose; kraj sa dva reza (V zasek) ima dva ugla (90 = ravan rez) */
  ends: [number[], number[]];
  /**
   * oblik oba kraja (za crtež šipke u krojnoj listi): tačke (ds, tn) — ds je rastojanje od najisturenije tačke kraja ka sredini komada, a tn
   * položaj preko širine cevi (0 … 1), po rastućem tn; obe mere u širinama cevi. Ravan rez je [[0,0],[0,1]]; zasek (dva reza) ima šiljak ka spolja.
   */
  endShape: [[number, number][], [number, number][]];
  w: number;
}

export interface TailDefaults {
  /** X uspravnog ojačanja */
  vertical: number;
  /** visina vodoravnog ojačanja od tla */
  horizontal: number;
  /** X donjeg i gornjeg kraja kosog ojačanja */
  diagX1: number;
  diagX2: number;
}

export interface TailInput {
  W: number;
  ff: number;
  fb: number;
  top: number;
  /** kraj repa (spoljna tačka donje pojasnice) */
  L: number;
  rise: number;
  diagW: number;
  bottomW: number;
  braceW: number;
  braces: TailBrace[];
  /** polazni X čvora ojačanja na kosniku */
  defaultVerticalX: number;
}

type V = [number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1];
const cross = (a: V, b: V): number => a[0] * b[1] - a[1] * b[0];
const norm = (a: V): V => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
interface Cut { p: V; d: V }

/** poligon se seče po pravoj, zadržava se strana na kojoj je tačka `keep` */
function clip(poly: V[], c: Cut, keep: V): V[] {
  const s = Math.sign(cross(c.d, sub(keep, c.p))) || 1;
  const side = (q: V): number => s * cross(c.d, sub(q, c.p));
  const out: V[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]; const b = poly[(i + 1) % poly.length];
    const sa = side(a); const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

const area = (p: V[]): number => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + (a[0] * b[1] - b[0] * a[1]); }, 0) / 2);

/**
 * cev: osa od A do B, širina w; kraj A i kraj B se seku zadatim linijama (jedna ili dve: V zasek).
 * `softB` su ravni drugih ojačanja koje kraj B ne sme da prekorači: seku se samo ako zaista zasecaju cev (inače ne ulaze u uglove).
 */
function member(bomKey: string, label: string, A: V, B: V, w: number, cutsA: Cut[], cutsB: Cut[], softB: Cut[] = []): TailMember {
  const u = norm(sub(B, A));
  const n: V = [-u[1], u[0]];
  const E = 4000;
  const a0: V = [A[0] - u[0] * E, A[1] - u[1] * E]; const b0: V = [B[0] + u[0] * E, B[1] + u[1] * E];
  let poly: V[] = [[a0[0] + n[0] * w / 2, a0[1] + n[1] * w / 2], [b0[0] + n[0] * w / 2, b0[1] + n[1] * w / 2], [b0[0] - n[0] * w / 2, b0[1] - n[1] * w / 2], [a0[0] - n[0] * w / 2, a0[1] - n[1] * w / 2]];
  const mid: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  for (const c of [...cutsA, ...cutsB]) poly = clip(poly, c, mid);
  const used: Cut[] = [];
  for (const c of softB) { const q = clip(poly, c, mid); if (q.length >= 3 && area(q) < area(poly) - 0.5) { poly = q; used.push(c); } }
  cutsB = [...cutsB, ...used];
  const proj = poly.map((q) => dot(q, u));
  // koji rezovi zaista čine ivicu komada (rez koji samo dodiruje teme ne računa se): samo oni ulaze u uglove
  const onCut = (q: V, c: Cut): boolean => Math.abs(cross(norm(c.d), sub(q, c.p))) < 0.05;
  const contributes = (c: Cut): boolean => poly.some((q, i) => { const nx = poly[(i + 1) % poly.length]; return onCut(q, c) && onCut(nx, c) && Math.hypot(nx[0] - q[0], nx[1] - q[1]) > 0.5; });
  const used2 = (list: Cut[]): Cut[] => { const l = list.filter(contributes); return l.length ? l : list.slice(0, 1); };
  const ang = (c: Cut): number => Math.round((Math.acos(Math.min(1, Math.abs(dot(norm(c.d), u)))) * 180) / Math.PI * 10) / 10;
  const r = (v: V): V => [Math.round(v[0] * 10) / 10, Math.round(v[1] * 10) / 10];
  const sA = used2(cutsA); const sB = used2(cutsB);
  return { bomKey, label, poly: poly.map(r), len: Math.round(Math.max(...proj) - Math.min(...proj)), ends: [sA.map(ang), sB.map(ang)], endShape: endShapes(poly, A, u, n, w), w };
}

/** dozvoljen raspon mere ojačanja (mm): iz njega se vidi do koje vrednosti može da se zada */
export interface TailRange { min: number; max: number }
export interface TailResult { members: TailMember[]; defaults: TailDefaults; ranges: Record<string, { pos?: TailRange; pos2?: TailRange }> }

/** oblik krajeva cevi iz poligona: vidi TailMember.endShape */
function endShapes(poly: V[], A: V, u: V, n: V, w: number): [[number, number][], [number, number][]] {
  const pts = poly.map((q) => ({ s: dot(sub(q, A), u), t: dot(sub(q, A), n) }));
  const straight: [[number, number][], [number, number][]] = [[[0, 0], [0, 1]], [[0, 0], [0, 1]]];
  const m = pts.length;
  if (m < 3) return straight;
  const smin = Math.min(...pts.map((p) => p.s)); const smax = Math.max(...pts.map((p) => p.s));
  const side = (sign: number): number[] => pts.map((p, i) => (Math.abs(p.t - sign * (w / 2)) < 0.05 ? i : -1)).filter((i) => i >= 0);
  const neg = side(-1); const pos = side(1);
  if (neg.length < 2 || pos.length < 2) return straight;
  const byS = (ids: number[], dir: 1 | -1): number => ids.reduce((best, i) => (dir * pts[i].s < dir * pts[best].s ? i : best), ids[0]);
  const chain = (from: number, other: number, to: number): number[] | null => {
    // krećemo se od kraja duge ivice na suprotnu stranu od njenog drugog kraja, do kraja druge duge ivice
    const step = (from + 1) % m === other ? -1 : 1;
    const out = [from];
    for (let k = 0, i = from; k < m; k++) { i = (i + step + m) % m; out.push(i); if (i === to) return out; }
    return null;
  };
  const toPts = (ids: number[], ref: number, dir: 1 | -1): [number, number][] => ids.map((i) => [Math.round(((dir * (pts[i].s - ref)) / w) * 1000) / 1000, Math.round(((pts[i].t + w / 2) / w) * 1000) / 1000] as [number, number]).sort((a, b) => a[1] - b[1]);
  const aIds = chain(byS(neg, 1), byS(neg, -1), byS(pos, 1));
  const bIds = chain(byS(neg, -1), byS(neg, 1), byS(pos, -1));
  if (!aIds || !bIds) return straight;
  return [toPts(aIds, smin, 1), toPts(bIds, smax, -1)];
}

export function tailGeometry(t: TailInput): TailResult {
  const { W, ff, fb, top, rise, diagW, bottomW } = t;
  const yc = fb + rise;
  const P1: V = [W - ff / 2, top - ff / 2];
  const none = (): TailResult => ({ members: [], ranges: {}, defaults: { vertical: t.defaultVerticalX, horizontal: Math.round(fb + (top - fb) * 0.62), diagX1: W, diagX2: t.defaultVerticalX } });
  if (!(t.L - P1[0] > 60) || !(P1[1] - yc > 20)) return none();
  // spoljna oštra tačka miter spoja je na kraju repa; spoj osa je toliko ranije (računa se iterativno jer ugao zavisi od spoja)
  let jx = t.L; let theta = Math.atan2(P1[1] - yc, jx - P1[0]);
  for (let i = 0; i < 8; i++) {
    if (!(jx - P1[0] > 20)) break;
    theta = Math.atan2(P1[1] - yc, jx - P1[0]);
    const tip = bottomW / 2 / Math.tan(Math.max(0.05, theta / 2));
    jx = Math.max(P1[0] + 40, t.L - tip);
  }
  theta = Math.atan2(P1[1] - yc, jx - P1[0]);
  const J: V = [jx, yc];
  const ud: V = [Math.cos(theta), -Math.sin(theta)];
  const nd: V = [-Math.sin(theta), -Math.cos(theta)]; // normala ka donjoj strani kosnika
  const miter: Cut = { p: J, d: [-Math.cos(theta / 2), Math.sin(theta / 2)] };
  const frameCut: Cut = { p: [W, 0], d: [0, 1] };
  const chordTopY = yc + bottomW / 2;
  const chordTop: Cut = { p: [0, chordTopY], d: [1, 0] };
  const diagLowerP: V = [P1[0] + nd[0] * diagW / 2, P1[1] + nd[1] * diagW / 2];
  const diagLower: Cut = { p: diagLowerP, d: ud };
  const yLower = (x: number): number => diagLowerP[1] - (x - diagLowerP[0]) * Math.tan(theta);
  const xLower = (y: number): number => diagLowerP[0] + (diagLowerP[1] - y) / Math.tan(theta);

  // ---- raspored ojačanja ----
  // uspravno: od pojasnice do kosnika; koso: iz ugla uz ram do kosnika, zasečeno uz uspravno (da ga ne preklapa);
  // vodoravno: od rama do kosog ojačanja, na koje se vari (kraj je zasečen po ivici kosog ojačanja, ne po kosini repa). Bez kosog ojačanja
  // vodoravno ide do kosnika, ali ne dodiruje uspravno (leži iznad njegovog levog gornjeg ugla).
  const xv = Math.round(t.defaultVerticalX);
  const yNode = yLower(xv); const yTopAttach = yLower(W);
  const vb = t.braces.find((b) => b.kind === 'vertical');
  const vertW = (b: TailBrace): number => b.w ?? t.braceW;
  const defaults: TailDefaults = { vertical: xv, horizontal: Math.ceil(vb ? yLower((vb.pos ?? xv) - vertW(vb) / 2) + t.braceW / 2 : (yNode + yTopAttach) / 2), diagX1: W, diagX2: xv };
  const verts = t.braces.filter((b) => b.kind === 'vertical').map((b) => ({ x: b.pos ?? xv, w: vertW(b) }));
  /** najniža visina ose vodoravnog ojačanja širine w kad nema kosog: donja ivica ne sme ispod levog gornjeg ugla nijednog uspravnog */
  const minHorizontalY = (w: number): number => Math.max(-Infinity, ...verts.map((v) => yLower(v.x - v.w / 2) + w / 2));
  const xMaxAtChord = Math.floor(xLower(chordTopY + 10));

  const members: TailMember[] = [];
  members.push(member('tail-diag', 'Rep — kosnik', P1, J, diagW, [frameCut], [miter]));
  members.push(member('tail-bottom', 'Rep — donja pojasnica', [W, yc], J, bottomW, [frameCut], [miter]));
  const kindCount: Record<BraceKind, number> = { vertical: 0, horizontal: 0, diagonal: 0 };
  const nthOf = new Map<string, number>(t.braces.map((b) => [b.id, ++kindCount[b.kind]]));
  const labelOf = (b: TailBrace): string => `Rep — ojačanje ${BRACE_LABELS[b.kind].toLowerCase()}${nthOf.get(b.id)! > 1 ? ` ${nthOf.get(b.id)}` : ''}`;
  const keyOf = (b: TailBrace): string => `tail-brace-${b.id}`;
  const ranges: Record<string, { pos?: TailRange; pos2?: TailRange }> = {};
  const rng = (min: number, max: number): TailRange => ({ min: Math.ceil(min), max: Math.floor(max) });

  // 1) uspravna
  for (const b of t.braces.filter((x) => x.kind === 'vertical')) {
    const w = vertW(b);
    const x = b.pos ?? defaults.vertical;
    ranges[b.id] = { pos: rng(W + w / 2, xMaxAtChord) };
    const A: V = [x, chordTopY]; const B: V = [x, yLower(x)];
    if (B[1] - A[1] > 10) members.push(member(keyOf(b), labelOf(b), A, B, w, [chordTop], [diagLower]));
  }
  // 2) koso (zasečeno uz uspravna); prvo koso određuje gde se vari vodoravno
  let weld: { upperP: V; u: V; topY: number } | null = null;
  for (const b of t.braces.filter((x) => x.kind === 'diagonal')) {
    const w = b.w ?? t.braceW;
    const x1 = b.pos ?? defaults.diagX1; const x2 = b.pos2 ?? defaults.diagX2;
    ranges[b.id] = { pos: rng(W, x2 - 10), pos2: rng(x1 + 10, xMaxAtChord) };
    const A: V = [x1, chordTopY]; const B: V = [x2, yLower(x2)];
    if (x2 - x1 > 10 && B[1] - A[1] > 10) {
      // donji kraj u uglu uz ram: zasečen u V (uz ram i uz pojasnicu); inače samo uz pojasnicu
      const psi = Math.atan2(B[1] - A[1], B[0] - A[0]);
      const leftEdge = x1 - (w / 2) / Math.sin(psi);
      const mid: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const soft: Cut[] = [];
      for (const v of verts) { if (mid[0] < v.x - v.w / 2) soft.push({ p: [v.x - v.w / 2, 0], d: [0, 1] }); else if (mid[0] > v.x + v.w / 2) soft.push({ p: [v.x + v.w / 2, 0], d: [0, 1] }); }
      const m = member(keyOf(b), labelOf(b), A, B, w, leftEdge < W + 0.5 ? [chordTop, frameCut] : [chordTop], [diagLower], soft);
      members.push(m);
      if (!weld) {
        const u = norm(sub(B, A)); const n: V = [-u[1], u[0]];
        weld = { upperP: [A[0] + n[0] * w / 2, A[1] + n[1] * w / 2], u, topY: Math.max(...m.poly.map((p) => p[1])) };
      }
    }
  }
  // 3) vodoravna: vare se na koso ojačanje (ugao reza = nagib kosog), a bez njega idu do kosnika
  const upperY = (x: number): number => weld!.upperP[1] + ((x - weld!.upperP[0]) * weld!.u[1]) / weld!.u[0];
  const upperX = (y: number): number => weld!.upperP[0] + ((y - weld!.upperP[1]) * weld!.u[0]) / weld!.u[1];
  const hRange = (w: number): TailRange => (weld
    ? rng(Math.max(chordTopY + w / 2, upperY(W) + w / 2), weld.topY - w / 2)
    : rng(Math.max(chordTopY + w / 2, minHorizontalY(w)), yLower(W + 10) - w / 2));
  const hb0 = t.braces.find((x) => x.kind === 'horizontal');
  if (hb0) { const r = hRange(hb0.w ?? t.braceW); defaults.horizontal = weld ? Math.round(r.min + (r.max - r.min) * 0.4) : defaults.horizontal; }
  for (const b of t.braces.filter((x) => x.kind === 'horizontal')) {
    const w = b.w ?? t.braceW;
    const r = hRange(w);
    ranges[b.id] = { pos: r };
    if (r.max < r.min) continue; // ne staje
    const y = Math.min(r.max, Math.max(r.min, b.pos ?? defaults.horizontal));
    if (weld) {
      const xb = upperX(y);
      if (xb - W > 10) members.push(member(keyOf(b), labelOf(b), [W, y], [xb, y], w, [frameCut], [{ p: weld.upperP, d: weld.u }]));
    } else {
      const xb = xLower(y);
      if (xb - W > 10 && y > yc && y < top) members.push(member(keyOf(b), labelOf(b), [W, y], [xb, y], w, [frameCut], [diagLower]));
    }
  }
  const rank = (k: string): number => (k === 'tail-diag' ? -2 : k === 'tail-bottom' ? -1 : t.braces.findIndex((b) => keyOf(b) === k));
  members.sort((p, q) => rank(p.bomKey) - rank(q.bomKey));
  return { members, defaults, ranges };
}
