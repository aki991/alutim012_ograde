import { linearEndLines, miterEndsOf, partAngle, type CustomModel, type CustomPart, type EndTip } from './custom';
import { findOverlaps } from './overlap';
import { materialShape, sectionFace, type MatShape } from './materialShape';
import type { Material } from './types';
import type { EndShape } from '../pricing/cutEnds';

type Pt = [number, number];
type Face = ReturnType<typeof sectionFace>;
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const along = (o: Pt, d: Pt, t: number): Pt => [o[0] + d[0] * t, o[1] + d[1] * t];
const norm = (deg: number) => ((deg % 180) + 180) % 180;
export const cutAngle = (deg: number): number => Math.min(deg, 180 - deg);

/** Postojeći ramovi i rezovi za pad terena u istim kontrolama kao ručni rezovi. */
export function profileEndCuts(p: CustomPart): [number, number] {
  if (p.endCuts) return p.endCuts;
  if (p.cut45) {
    const ends = p.miter ? miterEndsOf(p) : [true, true];
    return [ends[0] ? p.miter === 'hi' ? 135 : 45 : 90, ends[1] ? p.miter === 'hi' ? 45 : 135 : 90];
  }
  const relative = (deg?: number) => deg === undefined ? 90 : norm(deg - p.angleDeg) || 90;
  return [relative(p.cutStartDeg ?? (p.plumbEnds ? 90 : undefined)), relative(p.cutEndDeg ?? (p.plumbEnds ? 90 : undefined))];
}

export function profileEndLabels(p: CustomPart): [string, string] {
  const a = p.angleDeg * Math.PI / 180;
  if (Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a))) return Math.cos(a) >= 0 ? ['Levi kraj', 'Desni kraj'] : ['Desni kraj', 'Levi kraj'];
  return Math.sin(a) >= 0 ? ['Donji kraj', 'Gornji kraj'] : ['Gornji kraj', 'Donji kraj'];
}

type Tips = [EndTip | null, EndTip | null];
/** Drugi rez na krajevima (šiljak); null je kraj sa jednim rezom. */
export const profileEndTips = (p: Pick<CustomPart, 'endTips'>): Tips => [p.endTips?.[0] ?? null, p.endTips?.[1] ?? null];

function withCuts(p: CustomPart, endCuts: [number, number], tips: Tips = [null, null]): CustomPart {
  return { ...p, endCuts, endTips: tips[0] || tips[1] ? tips : undefined, cut45: undefined, miter: undefined, miterEnds: undefined, plumbEnds: undefined, cutStartDeg: undefined, cutEndDeg: undefined, guides: undefined, nests: undefined, rotLocked: true };
}

const okDeg = (v: number) => Number.isFinite(v) && v > 0 && v < 180;
/** x ivice kraja na mestu u (ivica je izlomljena linija od u0 ka u1) */
function lineAt(line: Pt[], u: number): number {
  for (let i = 1; i < line.length; i++) {
    const [x0, u0] = line[i - 1]; const [x1, u1] = line[i];
    if (u <= u1 + 1e-9 || i === line.length - 1) return Math.abs(u1 - u0) < 1e-12 ? x0 : x0 + (x1 - x0) * (u - u0) / (u1 - u0);
  }
  return line[0][0];
}

function valid(p: CustomPart, face: Face): boolean {
  if (!p.endCuts?.every(okDeg) || p.lengthMm <= 0) return false;
  if (p.endTips?.some((t) => t && (!okDeg(t.deg) || !(t.at > 0 && t.at < 1)))) return false;
  const { start, end } = linearEndLines(p, face.u0, face.u1);
  // šiljak je uvek ka spolja (konveksan kraj), a ivice krajeva se nigde ne dodiruju ni ukrštaju
  if (start.length === 3 && start[1][0] > lineAt([start[0], start[2]], start[1][1]) + 1e-6) return false;
  if (end.length === 3 && end[1][0] < lineAt([end[0], end[2]], end[1][1]) - 1e-6) return false;
  return [...start, ...end].every(([, u]) => lineAt(end, u) - lineAt(start, u) > 0.01);
}

/** Provera ostaje ista i kad se posle reza promeni dužina ili presek profila. */
export function profileCutsError(model: CustomModel, materials: Material[]): string | null {
  for (const p of model.parts) {
    if (!p.endCuts) continue;
    const mat = materials.find((m) => m.id === p.materialId); const shape = mat && materialShape(mat);
    if (shape?.type === 'linear' && !valid(p, sectionFace(shape.section, partAngle(p)))) return `Rezovi profila „${mat!.name}“ se ukrštaju. Povećajte dužinu ili izaberite blaži ugao sečenja.`;
  }
  return null;
}

export function setProfileEndCut(model: CustomModel, id: string, end: 0 | 1, deg: number, shape: MatShape): { model: CustomModel } | { error: string } {
  const p = model.parts.find((q) => q.id === id);
  if (!p || shape.type !== 'linear') return { error: 'Izaberite profil na crtežu.' };
  const cuts = [...profileEndCuts(p)] as [number, number]; cuts[end] = deg;
  const tips = profileEndTips(p); tips[end] = null;
  const next = withCuts(p, cuts, tips);
  if (!valid(next, sectionFace(shape.section, partAngle(p)))) return { error: 'Rezovi se ukrštaju ili je ugao neispravan. Povećajte dužinu profila ili izaberite blaži rez.' };
  return { model: { ...model, parts: model.parts.map((q) => q.id === id ? next : q) } };
}

/** Uglovi i normalizovan obris krajeva za optimizaciju i crtež šipke. */
export function profileCutData(p: CustomPart, shape: MatShape): { ends: [number[], number[]]; endShape: EndShape; cutFaceMm: number } | null {
  if (!p.endCuts || shape.type !== 'linear') return null;
  const { u0, u1, face } = sectionFace(shape.section, partAngle(p));
  const { start, end } = linearEndLines(p, u0, u1);
  const tips = profileEndTips(p);
  const angles = (e: 0 | 1) => tips[e] ? [cutAngle(p.endCuts![e]), cutAngle(tips[e]!.deg)] : [cutAngle(p.endCuts![e])];
  // tn = 0 je strana u1; tačke po rastućem tn
  const shapeOf = (line: Pt[], ds: (x: number) => number): [number, number][] => line.map(([x, u]) => [ds(x) / face, (u1 - u) / face] as [number, number]).reverse();
  return {
    ends: [angles(0), angles(1)],
    endShape: [shapeOf(start, (x) => x), shapeOf(end, (x) => p.lengthMm - x)],
    cutFaceMm: face,
  };
}

interface Member { p: CustomPart; face: Face; o: Pt; d: Pt; n: Pt }
const intersect = (o: Pt, d: Pt, v: Pt, e: Pt): Pt => along(o, d, cross(sub(v, o), e) / cross(d, e));

function memberOf(model: CustomModel, pid: string, materials: Material[]): Member | null {
  const p = model.parts.find((q) => q.id === pid); const mat = materials.find((m) => m.id === p?.materialId);
  const s = mat && materialShape(mat);
  if (!p || !s || s.type !== 'linear' || p.hw || p.joint3d) return null;
  const a = p.angleDeg * Math.PI / 180; const d: Pt = [Math.cos(a), Math.sin(a)];
  return { p, face: sectionFace(s.section, partAngle(p)), o: [p.x, p.y], d, n: [-d[1], d[0]] };
}

/** Dve ivice oba profila određuju zajedničku liniju spoja, uključujući različite širine i proizvoljan ugao osa. */
export function fitProfileCorner(model: CustomModel, id: string, targetId: string, materials: Material[]): { model: CustomModel } | { error: string } {
  const member = (pid: string) => memberOf(model, pid, materials);
  const A = member(id); const B = member(targetId);
  const fail = { error: 'Nema ugaonog spoja na krajevima ova dva profila. Postavite krajeve jedan preko drugog u istoj dubini. Ukrštanje na sredini i paralelni profili nisu ugaoni spoj.' };
  if (!A || !B || id === targetId || Math.abs(cross(A.d, B.d)) < 1e-5) return fail;
  if (Math.min(A.p.z + A.face.v1, B.p.z + B.face.v1) - Math.max(A.p.z + A.face.v0, B.p.z + B.face.v0) < 0.01) return fail;
  const center = intersect(A.o, A.d, B.o, B.d);
  const endOf = (m: Member): 0 | 1 => dot(sub(center, m.o), m.d) < m.p.lengthMm / 2 ? 0 : 1;
  const ea = endOf(A); const eb = endOf(B);
  const reach = 2 * Math.max(A.face.face, B.face.face) / Math.abs(cross(A.d, B.d)) + 1;
  for (const m of [A, B]) {
    const t = dot(sub(center, m.o), m.d);
    if (Math.min(Math.abs(t), Math.abs(t - m.p.lengthMm)) > reach || t < -reach || t > m.p.lengthMm + reach) return fail;
  }
  const retained = (m: Member, end: 0 | 1): Pt => [m.d[0] * (end === 0 ? 1 : -1), m.d[1] * (end === 0 ? 1 : -1)];
  for (const reverse of [false, true]) {
    const P = intersect(along(A.o, A.n, A.face.u0), A.d, along(B.o, B.n, reverse ? B.face.u1 : B.face.u0), B.d);
    const Q = intersect(along(A.o, A.n, A.face.u1), A.d, along(B.o, B.n, reverse ? B.face.u0 : B.face.u1), B.d);
    const seam = sub(Q, P);
    if (cross(seam, retained(A, ea)) * cross(seam, retained(B, eb)) >= -1e-8) continue;
    const trim = (m: Member, end: 0 | 1): CustomPart => {
      const lo = dot(sub(P, m.o), m.d); const hi = dot(sub(Q, m.o), m.d);
      const t = end === 0 ? Math.min(lo, hi) : Math.max(lo, hi);
      const cuts = [...profileEndCuts(m.p)] as [number, number];
      cuts[end] = norm(Math.atan2(cross(m.d, seam), dot(m.d, seam)) * 180 / Math.PI);
      const tips = profileEndTips(m.p); tips[end] = null;
      const o = end === 0 ? along(m.o, m.d, t) : m.o;
      return withCuts({ ...m.p, x: o[0], y: o[1], lengthMm: end === 0 ? m.p.lengthMm - t : t }, cuts, tips);
    };
    const a = trim(A, ea); const b = trim(B, eb);
    if (!valid(a, A.face) || !valid(b, B.face)) continue;
    // Prilagođavanje skida preklopljene krajeve; ne produžava cev preko nacrtane mere.
    if (a.lengthMm > A.p.lengthMm + 1 || b.lengthMm > B.p.lengthMm + 1) continue;
    return { model: { ...model, parts: model.parts.map((p) => p.id === id ? a : p.id === targetId ? b : p) } };
  }
  return fail;
}

export function cornerTargets(model: CustomModel, id: string, materials: Material[]): CustomPart[] {
  return model.parts.filter((p) => p.id !== id && !('error' in fitProfileCorner(model, id, p.id, materials)));
}

/** Unutrašnja ivica drugog profila u lokalnim koordinatama izabranog: x = a + b · u. */
interface FaceLine { a: number; b: number }

/**
 * Ivice profila u koje izabrani profil ulazi krajevima (npr. kosa cev u ram): za svaki kraj unutrašnje ivice (strana ka sredini
 * izabranog profila) svih profila sa kojima se preklapa. Profil koji prolazi kroz sredinu ili je daleko od kraja ne računa se.
 */
function endFaces(model: CustomModel, A: Member, materials: Material[]): [FaceLine[], FaceLine[]] {
  const out: [FaceLine[], FaceLine[]] = [[], []];
  const L = A.p.lengthMm; const um = (A.face.u0 + A.face.u1) / 2;
  const M = along(along(A.o, A.d, L / 2), A.n, um);
  for (const o of findOverlaps(model, materials)) {
    const other = o.a.id === A.p.id ? o.b : o.b.id === A.p.id ? o.a : null;
    const B = other && memberOf(model, other.id, materials);
    if (!B || Math.abs(cross(A.d, B.d)) < 1e-5) continue;
    const m = dot(sub(M, B.o), B.n);
    const off = m < B.face.u0 ? B.face.u0 : m > B.face.u1 ? B.face.u1 : null;
    if (off === null) continue;
    const P = along(B.o, B.n, off);
    const px = dot(sub(P, A.o), A.d); const pu = dot(sub(P, A.o), A.n);
    const b = dot(B.d, A.d) / dot(B.d, A.n);
    const f = { a: px - pu * b, b };
    const xm = f.a + f.b * um;
    const reach = 2 * Math.max(A.face.face, B.face.face) / Math.abs(cross(A.d, B.d)) + 1;
    if (xm < L / 2 ? xm > reach : L - xm > reach) continue;
    out[xm < L / 2 ? 0 : 1].push(f);
  }
  return out;
}

/** Ivica kraja posle uklapanja: početak prati najdalju ivicu (max), kraj najbližu (min); tačke od u0 ka u1. */
function envelope(fs: FaceLine[], u0: number, u1: number, start: boolean): Pt[] {
  const at = (u: number) => (start ? Math.max : Math.min)(...fs.map((f) => f.a + f.b * u));
  const us = [u0, u1];
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
    if (Math.abs(fs[i].b - fs[j].b) < 1e-12) continue;
    const u = (fs[j].a - fs[i].a) / (fs[i].b - fs[j].b);
    if (u > u0 + 1e-6 && u < u1 - 1e-6) us.push(u);
  }
  const pts = us.sort((p, q) => p - q).map((u) => [at(u), u] as Pt);
  const out: Pt[] = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) if (Math.abs(cross(sub(pts[k], out[out.length - 1]), sub(pts[k + 1], pts[k]))) > 1e-6) out.push(pts[k]);
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Uklapa krajeve izabranog profila u profile u koje ulazi (npr. kosa cev po dijagonali rama): seče se samo izabrani profil.
 * Kraj koji naleže na jednu stranu dobija jedan rez, a kraj u uglu dva reza (šiljak) koji naležu na obe strane.
 */
export function fitProfileInside(model: CustomModel, id: string, materials: Material[]): { model: CustomModel } | { error: string } {
  const A = memberOf(model, id, materials);
  if (!A) return { error: 'Izaberite profil na crtežu.' };
  const faces = endFaces(model, A, materials);
  if (!faces[0].length && !faces[1].length) return { error: 'Krajevi ovog profila ne ulaze u druge profile. Produžite ga da kraj pređe preko rama (u istoj dubini), pa kliknite „Prilagodi ugao“.' };
  const { u0, u1 } = A.face;
  const base = withCuts(A.p, profileEndCuts(A.p), profileEndTips(A.p));
  const lines = linearEndLines(base, u0, u1);
  const start = faces[0].length ? envelope(faces[0], u0, u1, true) : lines.start;
  const end = faces[1].length ? envelope(faces[1], u0, u1, false) : lines.end;
  if (start.length > 3 || end.length > 3) return { error: 'Kraj profila naleže na više od dve strane i ne može da se iseče sa dva reza. Skratite profil ili ga postavite tačno u ugao.' };
  const deg = (p: Pt, q: Pt) => 90 - Math.atan((q[0] - p[0]) / (q[1] - p[1])) * 180 / Math.PI;
  const cutOf = (line: Pt[]): [number, EndTip | null] => line.length === 2 ? [deg(line[0], line[1]), null] : [deg(line[0], line[1]), { deg: deg(line[1], line[2]), at: (line[1][1] - u0) / (u1 - u0) }];
  const [c0, t0] = cutOf(start); const [c1, t1] = cutOf(end);
  const x0 = Math.min(...start.map((q) => q[0])); const x1 = Math.max(...end.map((q) => q[0]));
  const o = along(A.o, A.d, x0);
  const next = withCuts({ ...A.p, x: o[0], y: o[1], lengthMm: x1 - x0 }, [c0, c1], [t0, t1]);
  if (!valid(next, A.face)) return { error: 'Profil je prekratak za ovo uklapanje: rezovi bi se ukrstili. Produžite profil ili ga pomerite.' };
  return { model: { ...model, parts: model.parts.map((p) => p.id === id ? next : p) } };
}

/**
 * Dugme „Prilagodi ugao“: kraj koji ulazi u ugao više profila (kosa cev u ram) ili u sredinu drugog profila uklapa se samo u
 * izabrani profil; dva profila koja se preklapaju krajevima dobijaju zajednički ugaoni spoj.
 */
export function fitProfile(model: CustomModel, id: string, targetId: string | undefined, materials: Material[]): { model: CustomModel } | { error: string } {
  const A = memberOf(model, id, materials);
  const faces = A ? endFaces(model, A, materials) : [[], []];
  if (faces[0].length > 1 || faces[1].length > 1 || (!targetId && (faces[0].length || faces[1].length))) return fitProfileInside(model, id, materials);
  if (targetId) return fitProfileCorner(model, id, targetId, materials);
  return { error: 'Nema profila za uklapanje. Preklopite kraj ovog profila sa drugim profilom u istoj dubini (npr. kosu cev preko rama), pa kliknite „Prilagodi ugao“.' };
}

/** Ivica kraja posle odsecanja pravom x = a + b · u: početak uzima veću vrednost (max), kraj manju (min). */
function lineEnvelope(line: Pt[], f: FaceLine, start: boolean): Pt[] {
  const us = line.map((q) => q[1]);
  for (let i = 1; i < line.length; i++) {
    const [x0, u0] = line[i - 1]; const [x1, u1] = line[i];
    const k = Math.abs(u1 - u0) < 1e-12 ? 0 : (x1 - x0) / (u1 - u0);
    if (Math.abs(k - f.b) < 1e-12) continue;
    const u = (f.a - x0 + u0 * k) / (k - f.b);
    if (u > Math.min(u0, u1) + 1e-6 && u < Math.max(u0, u1) - 1e-6) us.push(u);
  }
  const pick = start ? Math.max : Math.min;
  const pts = us.sort((p, q) => p - q).map((u) => [pick(lineAt(line, u), f.a + f.b * u), u] as Pt);
  const out: Pt[] = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) if (Math.abs(cross(sub(pts[k], out[out.length - 1]), sub(pts[k + 1], pts[k]))) > 1e-6) out.push(pts[k]);
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Odseca profil pravom kroz tačku `P` sa pravcem `dir`; ostaje strana na kojoj je tačka `keep`. Kraj koji prelazi pravu dobija kos rez
 * (ili dva reza kad prava seče i postojeći rez). Vraća isti deo kad ga prava ne dodiruje, a null kad ceo otpada.
 * Vođice i uklapanja (U profili) ostaju, pa prečka zadržava toleranciju u krojnoj listi.
 */
export function clipProfileByLine(p: CustomPart, shape: MatShape, P: Pt, dir: Pt, keep: Pt): CustomPart | null {
  if (shape.type !== 'linear') return p;
  const face = sectionFace(shape.section, partAngle(p));
  const a = p.angleDeg * Math.PI / 180; const d: Pt = [Math.cos(a), Math.sin(a)]; const n: Pt = [-d[1], d[0]];
  const local = (q: Pt): Pt => [dot(sub(q, [p.x, p.y]), d), dot(sub(q, [p.x, p.y]), n)];
  const lp = local(P); const dl: Pt = [dot(dir, d), dot(dir, n)]; const kp = local(keep);
  const base: CustomPart = p.endCuts ? p : { ...p, endCuts: profileEndCuts(p), cut45: undefined, miter: undefined, miterEnds: undefined, plumbEnds: undefined, cutStartDeg: undefined, cutEndDeg: undefined };
  const lines = linearEndLines(base, face.u0, face.u1);
  if (Math.abs(dl[1]) < 1e-9) {
    // prava paralelna sa profilom: profil ostaje ceo ili ceo otpada
    const keepSide = Math.sign(kp[1] - lp[1]);
    const inside = [face.u0, face.u1].every((u) => Math.sign(u - lp[1]) === keepSide || Math.abs(u - lp[1]) < 1e-6);
    const outside = [face.u0, face.u1].every((u) => Math.sign(u - lp[1]) === -keepSide || Math.abs(u - lp[1]) < 1e-6);
    return inside ? p : outside ? null : p;
  }
  const b = dl[0] / dl[1];
  const f: FaceLine = { a: lp[0] - lp[1] * b, b };
  const greater = kp[0] > f.a + f.b * kp[1];
  const all = [...lines.start, ...lines.end];
  const fx = (u: number) => f.a + f.b * u;
  // ceo profil je na strani koja ostaje / koja otpada
  if (all.every(([x, u]) => greater ? x >= fx(u) - 1e-6 : x <= fx(u) + 1e-6)) return p;
  if (all.every(([x, u]) => greater ? x <= fx(u) + 1e-6 : x >= fx(u) - 1e-6)) return null;
  const start = greater ? lineEnvelope(lines.start, f, true) : lines.start;
  const end = greater ? lines.end : lineEnvelope(lines.end, f, false);
  if (start.length > 3 || end.length > 3) return p;
  const deg = (q: Pt, r: Pt) => 90 - Math.atan((r[0] - q[0]) / (r[1] - q[1])) * 180 / Math.PI;
  const cutOf = (line: Pt[]): [number, EndTip | null] => line.length === 2 ? [deg(line[0], line[1]), null] : [deg(line[0], line[1]), { deg: deg(line[1], line[2]), at: (line[1][1] - face.u0) / face.face }];
  const [c0, t0] = cutOf(start); const [c1, t1] = cutOf(end);
  const x0 = Math.min(...start.map((q) => q[0])); const x1 = Math.max(...end.map((q) => q[0]));
  const o = along([p.x, p.y], d, x0);
  const next: CustomPart = { ...base, x: o[0], y: o[1], lengthMm: x1 - x0, endCuts: [c0, c1], endTips: t0 || t1 ? [t0, t1] : undefined };
  return valid(next, face) && next.lengthMm >= 5 ? next : null;
}
