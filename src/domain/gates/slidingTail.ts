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

/** cev: osa od A do B, širina w; kraj A i kraj B se seku zadatim linijama (jedna ili dve: V zasek) */
function member(bomKey: string, label: string, A: V, B: V, w: number, cutsA: Cut[], cutsB: Cut[]): TailMember {
  const u = norm(sub(B, A));
  const n: V = [-u[1], u[0]];
  const E = 4000;
  const a0: V = [A[0] - u[0] * E, A[1] - u[1] * E]; const b0: V = [B[0] + u[0] * E, B[1] + u[1] * E];
  let poly: V[] = [[a0[0] + n[0] * w / 2, a0[1] + n[1] * w / 2], [b0[0] + n[0] * w / 2, b0[1] + n[1] * w / 2], [b0[0] - n[0] * w / 2, b0[1] - n[1] * w / 2], [a0[0] - n[0] * w / 2, a0[1] - n[1] * w / 2]];
  const mid: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  for (const c of [...cutsA, ...cutsB]) poly = clip(poly, c, mid);
  const proj = poly.map((q) => dot(q, u));
  const ang = (c: Cut): number => Math.round((Math.acos(Math.min(1, Math.abs(dot(norm(c.d), u)))) * 180) / Math.PI * 10) / 10;
  const r = (v: V): V => [Math.round(v[0] * 10) / 10, Math.round(v[1] * 10) / 10];
  return { bomKey, label, poly: poly.map(r), len: Math.round(Math.max(...proj) - Math.min(...proj)), ends: [cutsA.map(ang), cutsB.map(ang)], w };
}

export function tailGeometry(t: TailInput): { members: TailMember[]; defaults: TailDefaults } {
  const { W, ff, fb, top, rise, diagW, bottomW } = t;
  const yc = fb + rise;
  const P1: V = [W - ff / 2, top - ff / 2];
  const none = (): { members: TailMember[]; defaults: TailDefaults } => ({ members: [], defaults: { vertical: t.defaultVerticalX, horizontal: Math.round(fb + (top - fb) * 0.62), diagX1: W, diagX2: t.defaultVerticalX } });
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

  // polazni raspored (da ojačanja u startu lepo staju): čvor uspravnog i kosog ojačanja je na istom mestu kosnika, kosо ide iz
  // ugla uz ram, a vodoravno je na pola puta između čvora i vrha, pa se ne sudara sa ostalima
  const xv = Math.round(t.defaultVerticalX);
  const yNode = yLower(xv); const yTopAttach = yLower(W);
  // vodoravno stoji dole, na pola visine kosog ojačanja: ide od rama, seče koso i naleže na uspravno ojačanje (spoj sa ostalima)
  const vb = t.braces.find((b) => b.kind === 'vertical');
  const defaults: TailDefaults = { vertical: xv, horizontal: Math.round(vb ? (chordTopY + yNode) / 2 : (yNode + yTopAttach) / 2), diagX1: W, diagX2: xv };

  const members: TailMember[] = [];
  members.push(member('tail-diag', 'Rep — kosnik', P1, J, diagW, [frameCut], [miter]));
  members.push(member('tail-bottom', 'Rep — donja pojasnica', [W, yc], J, bottomW, [frameCut], [miter]));
  const kindCount: Record<BraceKind, number> = { vertical: 0, horizontal: 0, diagonal: 0 };
  for (const b of t.braces) {
    const w = b.w ?? t.braceW;
    const nth = ++kindCount[b.kind];
    const label = `Rep — ojačanje ${BRACE_LABELS[b.kind].toLowerCase()}${nth > 1 ? ` ${nth}` : ''}`;
    const key = `tail-brace-${b.id}`;
    if (b.kind === 'vertical') {
      const x = b.pos ?? defaults.vertical;
      const A: V = [x, chordTopY]; const B: V = [x, yLower(x)];
      if (B[1] - A[1] > 10) members.push(member(key, label, A, B, w, [chordTop], [diagLower]));
    } else if (b.kind === 'horizontal') {
      const y = b.pos ?? defaults.horizontal;
      // desni kraj: naleže na uspravno ojačanje ako ga ima (ravan rez), inače ide do kosnika
      const vx = vb ? vb.pos ?? defaults.vertical : null;
      const vw = vb ? vb.w ?? t.braceW : 0;
      const onVertical = vx !== null && vx - vw / 2 - W > 10 && y < yLower(vx) - 5;
      if (onVertical) {
        const xe = vx! - vw / 2;
        if (y > yc) members.push(member(key, label, [W, y], [xe, y], w, [frameCut], [{ p: [xe, 0], d: [0, 1] }]));
      } else {
        const xb = xLower(y);
        if (xb - W > 10 && y > yc && y < top) members.push(member(key, label, [W, y], [xb, y], w, [frameCut], [diagLower]));
      }
    } else {
      const x1 = b.pos ?? defaults.diagX1; const x2 = b.pos2 ?? defaults.diagX2;
      const A: V = [x1, chordTopY]; const B: V = [x2, yLower(x2)];
      if (x2 - x1 > 10 && B[1] - A[1] > 10) {
        // donji kraj u uglu uz ram: zasečen u V (uz ram i uz pojasnicu); inače samo uz pojasnicu
        const psi = Math.atan2(B[1] - A[1], B[0] - A[0]);
        const leftEdge = x1 - (w / 2) / Math.sin(psi);
        members.push(member(key, label, A, B, w, leftEdge < W + 0.5 ? [chordTop, frameCut] : [chordTop], [diagLower]));
      }
    }
  }
  return { members, defaults };
}
