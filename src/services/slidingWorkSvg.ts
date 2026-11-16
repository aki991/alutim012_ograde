import { slidingBom, resolveSliding, type Shape, type SlidingResult } from '../domain/gates/slidingAssembly';
import { slidingH } from '../domain/gates/slidingLayout';
import { computeLayout, type LaidOutItem } from '../domain/geometry/layout';
import { partAngle } from '../domain/models/custom';
import { customModelOf, customPartRoles, customPartsFor } from '../domain/models/customRegistry';
import { sectionFace } from '../domain/models/materialShape';
import type { Gate, Material, Project } from '../domain/models/types';
import type { WorkPart } from '../domain/pricing/workorder';

/**
 * Sklopni crtež klizne kapije za radni nalog: krilo (delovi nacrtanog modela), rep sa ojačanjima, C-profil ili šina i okov, u pogledu spreda
 * i u stvarnom smeru otvaranja. Svaki deo koji se seče nosi broj iz tabele delova (isti naziv i dužina), a okov slovo iz legende okova.
 * Kote: krilo i rep, visina krila, odstojanje od tla, ukupna visina, C-profil (šina) i položaj ojačanja repa.
 */

type P = [number, number];
export interface Drawn { poly?: P[]; circle?: { cx: number; cy: number; r: number }; name?: string; len?: number; kind: 'part' | 'hw' | 'fixed'; comp?: string }
export interface WorkHw { tag: string; name: string; qty: number; unit: string }
export interface SlidingWorkDrawing { svg: string; width: number; height: number; hardware: WorkHw[] }

const FONT = 'Arial, Helvetica, sans-serif';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mm = (n: number) => `${Math.round(n)}`;
/** delovi sklopa koji se ne crtaju u radionici: temelj kolica i stub vođice (u projektu je to stub ograde) */
const SKIP = new Set(['foundation', 'guidePost', 'tail', 'carrier', 'rail', 'frame', 'channels', 'infill']);
/** okov na crtežu → stavke sastavnice koje obuhvata */
const HW_BOM: Record<string, string[]> = { carriages: ['carriages', 'carriagePlates'], stop: ['stops'], motor: ['motor', 'motorPlate'] };

/** osa poligona (glavni pravac): krajnje tačke kroz težište, za mesto broja duž dela */
function axisOf(poly: P[]): [P, P] {
  const n = poly.length;
  const cx = poly.reduce((s, p) => s + p[0], 0) / n; const cy = poly.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0; let syy = 0; let sxy = 0;
  for (const [x, y] of poly) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(a); const uy = Math.sin(a);
  const t = poly.map(([x, y]) => (x - cx) * ux + (y - cy) * uy);
  const t0 = Math.min(...t); const t1 = Math.max(...t);
  return [[cx + ux * t0, cy + uy * t0], [cx + ux * t1, cy + uy * t1]];
}

/**
 * Delovi klizne kapije za crtež (mm, y od tla naviše): krilo (delovi nacrtanog modela sa nazivom uloge), rep, C-profil ili šina i okov.
 * D preslikava lokalnu osu sklopa (0 = ivica zatvaranja, raste ka strani otvaranja) u x crteža.
 */
export function slidingDrawnItems(it: Gate, li: Pick<LaidOutItem, 'clearWidth'>, D: (x: number) => number): { items: Drawn[]; res: SlidingResult } | null {
  if (!it.sliding) return null;
  const res = resolveSliding(it.sliding, li.clearWidth, slidingH(it));
  const spec = res.spec;
  const W = res.W; const fb = spec.frameBottomY; const fh = res.frameHeight;
  const bom = slidingBom(res);
  const bomBy = new Map(bom.map((b) => [b.key, b]));
  const items: Drawn[] = [];
  const rect = (x: number, y: number, w: number, h: number): P[] => { const a = D(x); const b = D(x + w); return [[Math.min(a, b), y], [Math.max(a, b), y], [Math.max(a, b), y + h], [Math.min(a, b), y + h]]; };
  const shapeTo = (s: Shape): Pick<Drawn, 'poly' | 'circle'> => {
    if (s.t === 'rect') return { poly: rect(s.x, s.y, s.w, s.h) };
    if (s.t === 'circle') return { circle: { cx: D(s.cx), cy: s.cy, r: s.r } };
    if (s.t === 'line') { const h = s.sw / 2; const dx = s.x2 - s.x1; const dy = s.y2 - s.y1; const l = Math.hypot(dx, dy) || 1; const nx = (-dy / l) * h; const ny = (dx / l) * h; return { poly: [[D(s.x1 + nx), s.y1 + ny], [D(s.x2 + nx), s.y2 + ny], [D(s.x2 - nx), s.y2 - ny], [D(s.x1 - nx), s.y1 - ny]] }; }
    return { poly: s.pts.map(([x, y]) => [D(x), y] as P) };
  };

  // ---- krilo ----
  const model = spec.drawnLeaf ? customModelOf(it.infillModelId) : undefined;
  if (model) {
    // nazivi uloga iz razvučenog modela (ram se pri promeni mera pravi iznova, pa delovi rama imaju nove ID-ove)
    const rps = customPartsFor(it.infillModelId, W, fh, it.color);
    const roles = customPartRoles({ ...model, widthMm: W, heightMm: fh, parts: rps.map((r) => r.part) });
    const left = Math.min(D(0), D(W));
    for (const r of rps) {
      const p = r.part;
      if (r.shape.type === 'piece') continue;
      if (r.shape.type === 'sheet' || p.heightMm) { items.push({ kind: 'part', name: roles.get(p.id), poly: [[left + p.x, fb + p.y], [left + p.x + p.lengthMm, fb + p.y], [left + p.x + p.lengthMm, fb + p.y + (p.heightMm ?? 0)], [left + p.x, fb + p.y + (p.heightMm ?? 0)]] }); continue; }
      const { u0, u1 } = sectionFace(r.shape.section, partAngle(p));
      const a = (p.angleDeg * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
      const at = (lx: number, ly: number): P => [left + p.x + lx * c - ly * s, fb + p.y + lx * s + ly * c];
      items.push({ kind: 'part', name: roles.get(p.id), len: p.lengthMm, poly: [at(0, u0), at(p.lengthMm, u0), at(p.lengthMm, u1), at(0, u1)] });
    }
  } else {
    // krilo iz sastavnice sklopa (ram, bočni U-profili, prečke) ili model iz kataloga: crta se kao ram i prečke sklopa
    const name = (k: string) => bomBy.get(k)?.name;
    for (const c of res.components) {
      if (c.key === 'frame') c.shapes.forEach((s, i) => { if (s.t === 'rect') items.push({ kind: 'part', name: name(i < 2 ? 'frame-h' : 'frame-v'), len: i < 2 ? s.w : s.h, ...shapeTo(s) }); });
      if (c.key === 'channels') c.shapes.forEach((s) => { if (s.t === 'rect') items.push({ kind: 'part', name: name('channel'), len: s.h, ...shapeTo(s) }); });
      if (c.key === 'infill') c.shapes.forEach((s) => { if (s.t === 'rect') items.push({ kind: 'part', name: name('infill'), len: s.w, ...shapeTo(s) }); });
    }
    if (!res.components.some((c) => c.key === 'frame')) items.push({ kind: 'fixed', poly: rect(0, fb, W, fh) });
  }

  // ---- rep, C-profil / šina ----
  for (const m of res.tail ?? []) items.push({ kind: 'part', name: m.label, len: m.len, poly: m.poly.map(([x, y]) => [D(x), y] as P) });
  for (const c of res.components) {
    if (c.key === 'carrier' || c.key === 'rail') for (const s of c.shapes) items.push({ kind: 'part', name: bomBy.get(c.key)?.name, len: s.t === 'rect' ? s.w : undefined, ...shapeTo(s) });
  }

  // ---- okov ----
  for (const c of res.components) {
    if (SKIP.has(c.key)) continue;
    for (const s of c.shapes) items.push({ kind: c.moving ? 'hw' : 'fixed', comp: c.key, ...shapeTo(s) });
  }
  return { items, res };
}

export function slidingWorkSvg(project: Project, index: number, parts: WorkPart[], materials: Material[], color: string): SlidingWorkDrawing | null {
  const it = project.items[index];
  if (!it || it.kind !== 'gate' || !it.sliding) return null;
  const li = computeLayout(project).items[index];
  const dir = it.opening === 'left' ? -1 : 1;
  const D = (x: number) => dir * x;
  const got = slidingDrawnItems(it, li, D);
  if (!got) return null;
  const { items, res } = got;
  const spec = res.spec;
  const W = res.W; const fb = spec.frameBottomY; const fh = res.frameHeight; const top = fb + fh;
  const cant = spec.support === 'cantilever';
  const bomBy = new Map(slidingBom(res).map((b) => [b.key, b]));

  // ---- okov: slova po redu crtanja, samo okov koji postoji u sastavnici ----
  const hardware: WorkHw[] = [];
  const hwTag = new Map<string, string>();
  for (const c of res.components) {
    if (SKIP.has(c.key)) continue;
    const keys = (HW_BOM[c.key] ?? [c.key]).filter((k) => bomBy.get(k)?.make === 'kupovina');
    if (!keys.length) continue;
    const tag = String.fromCharCode(65 + hwTag.size);
    hwTag.set(c.key, tag);
    for (const k of keys) {
      const b = bomBy.get(k)!;
      const mat = b.materialId ? materials.find((x) => x.id === b.materialId) : undefined;
      const what = mat?.name ?? b.materialText;
      hardware.push({ tag, name: what ? `${b.name}: ${what}` : b.name, qty: b.unit === 'par' ? b.qty * 2 : b.qty, unit: b.unit === 'par' ? 'kom' : b.unit });
    }
  }

  // ---- razmera ----
  const xs: number[] = []; const ys: number[] = [0];
  for (const d of items) {
    if (d.poly) for (const [x, y] of d.poly) { xs.push(x); ys.push(y); }
    if (d.circle) { xs.push(d.circle.cx - d.circle.r, d.circle.cx + d.circle.r); ys.push(d.circle.cy - d.circle.r, d.circle.cy + d.circle.r); }
  }
  const xMin = Math.min(...xs); const xMax = Math.max(...xs); const yMin = Math.min(...ys); const yMax = Math.max(...ys);
  const kinds = new Map((spec.braces ?? [{ id: 'b1', kind: 'vertical' as const }]).map((b) => [`tail-brace-${b.id}`, b.kind]));
  const nV = (res.tail ?? []).filter((m) => kinds.get(m.bomKey) === 'vertical').length;
  const nH = (res.tail ?? []).filter((m) => kinds.get(m.bomKey) === 'horizontal').length;
  const VW = 1000; const padT = 40; const padB = 44 + nV * 24;
  const padL = 80 + (dir === 1 ? 0 : nH * 30); const padR = 80 + (dir === 1 ? nH * 30 : 0);
  const s = Math.min((VW - padL - padR) / Math.max(1, xMax - xMin), 380 / Math.max(1, yMax - yMin));
  const ox = padL + (VW - padL - padR - (xMax - xMin) * s) / 2;
  const X = (x: number) => ox + (x - xMin) * s;
  const Y = (y: number) => padT + (yMax - y) * s;
  const H = Math.round(padT + (yMax - yMin) * s + padB);
  const out: string[] = [];
  const pts = (poly: P[]) => poly.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const STYLE = { part: { fill: `${color}2e`, stroke: color }, hw: { fill: '#cbd5e1', stroke: '#475569' }, fixed: { fill: '#f1f5f9', stroke: '#94a3b8' } } as const;

  // tlo
  out.push(`<line x1="${(X(xMin) - 20).toFixed(1)}" y1="${Y(0).toFixed(1)}" x2="${(X(xMax) + 20).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="6 4"/>`);
  for (const kind of ['fixed', 'part', 'hw'] as const) {
    for (const d of items) {
      if (d.kind !== kind) continue;
      const st = STYLE[kind];
      if (d.poly) out.push(`<polygon points="${pts(d.poly)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="0.9" stroke-linejoin="round"/>`);
      if (d.circle) out.push(`<circle cx="${X(d.circle.cx).toFixed(1)}" cy="${Y(d.circle.cy).toFixed(1)}" r="${Math.max(2.5, d.circle.r * s).toFixed(1)}" fill="#fff" stroke="${st.stroke}" stroke-width="1.2"/>`);
    }
  }

  const numberOf = (d: Drawn): number | undefined => {
    if (!d.name) return undefined;
    const cands = parts.filter((p) => (p.name ?? p.part) === d.name && p.no !== undefined);
    if (!cands.length) return undefined;
    return cands.reduce((best, p) => (Math.abs((p.lengthMm ?? 0) - (d.len ?? 0)) < Math.abs((best.lengthMm ?? 0) - (d.len ?? 0)) ? p : best), cands[0]).no;
  };
  // ---- kote ----
  const DIM = '#475569';
  const hDim = (a: number, b: number, y: number, text: string) => {
    const x1 = Math.min(a, b); const x2 = Math.max(a, b);
    out.push(`<g data-dim="${esc(text)}"><line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${DIM}" stroke-width="0.9"/>`
      + `<line x1="${x1.toFixed(1)}" y1="${(y - 5).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${(y + 5).toFixed(1)}" stroke="${DIM}" stroke-width="0.9"/><line x1="${x2.toFixed(1)}" y1="${(y - 5).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(y + 5).toFixed(1)}" stroke="${DIM}" stroke-width="0.9"/>`
      + `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#1e293b">${esc(text)}</text></g>`);
  };
  const vDim = (x: number, a: number, b: number, text: string, textLeft: boolean) => {
    const y1 = Math.min(a, b); const y2 = Math.max(a, b); const tx = textLeft ? x - 4 : x + 12;
    out.push(`<g data-dim="${esc(text)}"><line x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${DIM}" stroke-width="0.9"/>`
      + `<line x1="${(x - 5).toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x + 5).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${DIM}" stroke-width="0.9"/><line x1="${(x - 5).toFixed(1)}" y1="${y2.toFixed(1)}" x2="${(x + 5).toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${DIM}" stroke-width="0.9"/>`
      + `<text x="0" y="0" transform="translate(${tx.toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#1e293b">${esc(text)}</text></g>`);
  };
  const mvEnd = cant ? res.at('carrierLength') : W;
  const yTop = padT - 14;
  hDim(X(D(0)), X(D(W)), yTop, `Krilo ${mm(W)}`);
  if (cant && mvEnd > W) hDim(X(D(W)), X(D(mvEnd)), yTop, `Rep ${mm(mvEnd - W)}`);
  // visine: na strani zatvaranja krila (suprotno od repa)
  const closeLeft = dir === 1;
  const vx1 = closeLeft ? X(xMin) - 16 : X(xMax) + 16;
  const vx2 = closeLeft ? X(xMin) - 46 : X(xMax) + 46;
  if (fb > 0) vDim(vx1, Y(0), Y(fb), mm(fb), closeLeft);
  vDim(vx1, Y(fb), Y(top), `Visina krila ${mm(fh)}`, closeLeft);
  vDim(vx2, Y(0), Y(top), `Od tla ${mm(top)}`, closeLeft);
  // ispod tla: C-profil ili šina, pa položaj uspravnih ojačanja repa od kraja krila
  const yB1 = Y(Math.min(0, yMin)) + 26;
  if (cant) hDim(X(D(0)), X(D(res.at('carrierLength'))), yB1, `C-profil ${mm(res.at('carrierLength'))}`);
  else hDim(X(D(res.at('railStart'))), X(D(res.at('railStart') + res.at('railLength'))), yB1, `Šina ${mm(res.at('railLength'))}`);
  let row = 0; let hRow = 0;
  for (const m of res.tail ?? []) {
    const kind = kinds.get(m.bomKey);
    if (kind === 'vertical') {
      const near = Math.min(...m.poly.map((q) => q[0]));
      const no = numberOf({ kind: 'part', name: m.label, len: m.len });
      hDim(X(D(W)), X(D(near)), yB1 + 26 + row * 24, `${mm(near - W)} od krila${no !== undefined ? ` (deo ${no})` : ''}`);
      row += 1;
    } else if (kind === 'horizontal') {
      const low = Math.min(...m.poly.map((q) => q[1]));
      // uz kraj repa, sa spoljne strane
      const x = X(D(mvEnd)) + dir * (18 + hRow * 30);
      const no = numberOf({ kind: 'part', name: m.label, len: m.len });
      vDim(x, Y(fb), Y(low), `${mm(low - fb)} od dna krila${no !== undefined ? ` (deo ${no})` : ''}`, !closeLeft);
      hRow += 1;
    }
  }

  // ---- brojevi delova (iz tabele) i slova okova ----
  const R = 10;
  const taken: { x: number; y: number; r: number }[] = [];
  const free = (x: number, y: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.y - y) >= t.r + r + 2);
  const groups = new Map<number, Drawn[]>();
  for (const d of items) { if (d.kind !== 'part' || !d.poly) continue; const n = numberOf(d); if (n !== undefined) groups.set(n, [...(groups.get(n) ?? []), d]); }
  const bubbles: string[] = [];
  for (const [n, ds] of [...groups].sort((a, b) => a[0] - b[0])) {
    // do četiri komada: broj na svakom; više (npr. prečke ispune): broj na srednjem
    const show = ds.length <= 4 ? ds : [ds[Math.floor(ds.length / 2)]];
    for (const d of show) {
      const [a, b] = axisOf(d.poly!);
      const T = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
      let at: P = [X((a[0] + b[0]) / 2), Y((a[1] + b[1]) / 2)];
      for (const t of T) { const c: P = [X(a[0] + (b[0] - a[0]) * t), Y(a[1] + (b[1] - a[1]) * t)]; if (free(c[0], c[1], R)) { at = c; break; } }
      taken.push({ x: at[0], y: at[1], r: R });
      bubbles.push(`<g data-part-no="${n}"><circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="${R}" fill="#ffffff" stroke="#1e293b" stroke-width="1.3"/><text x="${at[0].toFixed(1)}" y="${(at[1] + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="700" fill="#1e293b">${n}</text></g>`);
    }
  }
  // slova okova: uz deo, a ako je mesto zauzeto, pomereno sa linijom do dela
  for (const [key, tag] of hwTag) {
    const d = items.find((q) => q.comp === key);
    if (!d) continue;
    const c: P = d.circle ? [X(d.circle.cx), Y(d.circle.cy)] : (() => { const ps = d.poly!; return [X(ps.reduce((s2, p) => s2 + p[0], 0) / ps.length), Y(ps.reduce((s2, p) => s2 + p[1], 0) / ps.length)] as P; })();
    const offs: P[] = [[0, -22], [22, -22], [-22, -22], [26, 0], [-26, 0], [0, 24], [22, 24], [-22, 24], [0, -44], [40, -30], [-40, -30]];
    let at: P = [c[0] + offs[0][0], c[1] + offs[0][1]];
    for (const o of offs) { const q: P = [c[0] + o[0], c[1] + o[1]]; if (free(q[0], q[1], 9)) { at = q; break; } }
    taken.push({ x: at[0], y: at[1], r: 9 });
    bubbles.push(`<g data-hw-tag="${tag}"><line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${at[0].toFixed(1)}" y2="${at[1].toFixed(1)}" stroke="#64748b" stroke-width="0.8"/><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="1.8" fill="#64748b"/>`
      + `<rect x="${(at[0] - 9).toFixed(1)}" y="${(at[1] - 8).toFixed(1)}" width="18" height="16" rx="3" fill="#334155"/><text x="${at[0].toFixed(1)}" y="${(at[1] + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="700" fill="#ffffff">${tag}</text></g>`);
  }
  out.push(...bubbles);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${H}" width="${VW}" height="${H}"><rect width="${VW}" height="${H}" fill="#ffffff"/>${out.join('')}</svg>`, width: VW, height: H, hardware };
}
