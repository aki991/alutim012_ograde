import type { DrawnPolygon } from './types';

/**
 * Presek profila iz slike: crno-bela slika (tamno = piksel crteža) se pretvara u poligone preseka (spoljna ivica i otvori) u mm.
 *  - „puna“ slika: tamna površina je materijal (siluet preseka); svetli otvori u njoj su šupljine;
 *  - „konturni“ crtež: tamne su samo linije konture; materijal je površina unutar spoljne linije, a unutrašnja kontura (cev) je otvor.
 * Postupak: povezane oblasti piksela → stablo ugnežđenja (spoljna pozadina je koren) → maska materijala → ivice maske spojene u zatvorene
 * putanje → pojednostavljenje (Douglas–Peucker) → skaliranje na zadatu širinu i visinu.
 */

type P = [number, number];
export type TraceMode = 'filled' | 'outline';

export interface Bitmap { w: number; h: number; /** 1 = tamno (crtež), 0 = svetlo */ dark: Uint8Array }

/** Prag svetline (Otsu) za sive tonove 0…255. */
export function otsu(gray: Uint8Array | number[]): number {
  const hist = new Array(256).fill(0);
  for (const g of gray) hist[g] += 1;
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/** Slika sa belim obodom od jednog piksela (spoljna pozadina je uvek povezana). */
function padded(b: Bitmap): Bitmap {
  const w = b.w + 2; const h = b.h + 2;
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) dark[(y + 1) * w + x + 1] = b.dark[y * b.w + x];
  return { w, h, dark };
}

/** Maska materijala (1 = materijal) prema načinu; tamne oblasti 8-povezane, svetle 4-povezane. */
export function materialMask(src: Bitmap, mode: TraceMode): Bitmap {
  const b = padded(src);
  const { w, h, dark } = b;
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const colorOf: number[] = [];
  const sizes: number[] = [];
  let count = 0;
  const stack: number[] = [];
  for (let i0 = 0; i0 < n; i0++) {
    if (comp[i0] >= 0) continue;
    const c = dark[i0];
    const id = count++;
    colorOf.push(c); sizes.push(0);
    comp[i0] = id; stack.push(i0);
    while (stack.length) {
      const i = stack.pop()!;
      sizes[id] += 1;
      const x = i % w; const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (c === 0 && dx && dy) continue; // svetle oblasti: samo 4 suseda
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (comp[j] < 0 && dark[j] === c) { comp[j] = id; stack.push(j); }
      }
    }
  }
  // susedstvo oblasti (po 4 suseda)
  const adj: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x + 1 < w && comp[i] !== comp[i + 1]) { adj[comp[i]].add(comp[i + 1]); adj[comp[i + 1]].add(comp[i]); }
    if (y + 1 < h && comp[i] !== comp[i + w]) { adj[comp[i]].add(comp[i + w]); adj[comp[i + w]].add(comp[i]); }
  }
  const depth = new Int32Array(count).fill(-1);
  depth[comp[0]] = 0;
  const queue = [comp[0]];
  for (let qi = 0; qi < queue.length; qi++) for (const nb of adj[queue[qi]]) if (depth[nb] < 0) { depth[nb] = depth[queue[qi]] + 1; queue.push(nb); }
  // sitne mrlje (šum) ne računaju se kao materijal
  const minArea = Math.max(2, Math.round(n * 0.0004));
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const id = comp[i]; const d = depth[id];
    if (d <= 0) continue;
    const isMat = mode === 'filled' ? d % 2 === 1 : d % 4 !== 0;
    if (!isMat) continue;
    if (colorOf[id] === 1 && sizes[id] < minArea) continue;
    out[i] = 1;
  }
  return { w, h, dark: out };
}

/** Zatvorene putanje oko maske (materijal sa leve strane): spoljne su pozitivne površine, otvori negativne. */
export function maskLoops(m: Bitmap): P[][] {
  const { w, h, dark } = m;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dark[y * w + x]);
  // usmerene ivice između piksela; ključ je početna tačka
  const edges = new Map<number, number[]>(); // ključ početka → ključevi krajeva
  const key = (x: number, y: number) => y * (w + 2) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => { const k = key(x0, y0); const l = edges.get(k); const e = key(x1, y1); if (l) l.push(e); else edges.set(k, [e]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) add(x + 1, y, x, y);         // gornja ivica ide ulevo
    if (!at(x, y + 1)) add(x, y + 1, x + 1, y + 1); // donja ivica ide udesno
    if (!at(x - 1, y)) add(x, y, x, y + 1);         // leva ivica ide nadole
    if (!at(x + 1, y)) add(x + 1, y + 1, x + 1, y); // desna ivica ide nagore
  }
  const xy = (k: number): P => [k % (w + 2), Math.floor(k / (w + 2))];
  const loops: P[][] = [];
  for (const startKey of [...edges.keys()]) {
    while ((edges.get(startKey)?.length ?? 0) > 0) {
      const loop: P[] = [];
      let cur = startKey; let prevDir: P | null = null;
      for (let guard = 0; guard < 4 * w * h + 8; guard++) {
        const outs = edges.get(cur);
        if (!outs || !outs.length) break;
        let pick = 0;
        if (outs.length > 1 && prevDir) {
          // u čvoru sa dve ivice skreće se tako da se putanje ne ukrštaju (prvo udesno, pa pravo)
          const c = xy(cur);
          const score = (e: number): number => { const t = xy(e); const d: P = [t[0] - c[0], t[1] - c[1]]; const cross = prevDir![0] * d[1] - prevDir![1] * d[0]; return cross; };
          pick = outs.map(score).reduce((bi, s, i, arr) => (s > arr[bi] ? i : bi), 0);
        }
        const next = outs.splice(pick, 1)[0];
        const a = xy(cur); const b = xy(next);
        loop.push(a);
        prevDir = [b[0] - a[0], b[1] - a[1]];
        cur = next;
        if (cur === startKey) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

const area = (p: P[]): number => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;

function dp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy);
  let idx = -1; let dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = l < 1e-9 ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / l;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps || idx < 0) return [a, b];
  return [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)];
}

/** Pojednostavljenje zatvorene putanje: deli se na dve polovine po najudaljenijim tačkama. */
export function simplifyLoop(loop: P[], eps: number): P[] {
  if (loop.length <= 4) return loop;
  let i0 = 0; let i1 = 0; let best = -1;
  for (let i = 0; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > best) { best = d; i1 = i; } }
  const first = loop.slice(i0, i1 + 1); const second = [...loop.slice(i1), loop[0]];
  const out = [...dp(first, eps).slice(0, -1), ...dp(second, eps).slice(0, -1)];
  return out.length >= 3 ? out : loop;
}

const inside = (pt: P, poly: P[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

export interface Traced { polys: DrawnPolygon[]; /** širina i visina u pikselima (okvir preseka) */ wPx: number; hPx: number }

/** Slika → poligoni u pikselima (y nadole), bez skaliranja. */
export function traceBitmap(src: Bitmap, mode: TraceMode, tolerancePx = 0.8): Traced | null {
  const mask = materialMask(src, mode);
  const loops = maskLoops(mask).map((l) => simplifyLoop(l, tolerancePx)).filter((l) => l.length >= 3 && Math.abs(area(l)) >= 4);
  // spoljne putanje i otvori se razlikuju po smeru; otvor pripada najmanjem spoljnom poligonu koji ga sadrži
  // (u koordinatama slike, y nadole, spoljna putanja ima negativnu površinu)
  const outers = loops.filter((l) => area(l) < 0);
  const holes = loops.filter((l) => area(l) > 0);
  if (!outers.length) return null;
  const polys: DrawnPolygon[] = outers.map((o) => ({ outline: o, holes: [] }));
  for (const hl of holes) {
    let best = -1; let bestA = Infinity;
    outers.forEach((o, i) => { const a = Math.abs(area(o)); if (a < bestA && inside(hl[0], o)) { best = i; bestA = a; } });
    if (best >= 0) polys[best].holes.push(hl);
  }
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p.outline) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { polys: polys.map((p) => ({ outline: p.outline.map(([x, y]) => [x - x0, y - y0] as P), holes: p.holes.map((hl) => hl.map(([x, y]) => [x - x0, y - y0] as P)) })), wPx: x1 - x0, hPx: y1 - y0 };
}

/** Poligoni u pikselima → mm (zadate spoljne mere, y nagore): koristi se kao nacrtan presek. */
export function scaleTraced(t: Traced, widthMm: number, heightMm: number): DrawnPolygon[] {
  const sx = widthMm / t.wPx; const sy = heightMm / t.hPx;
  const r = (n: number) => Math.round(n * 100) / 100;
  const conv = (pts: P[]): P[] => pts.map(([x, y]) => [r(x * sx), r((t.hPx - y) * sy)] as P);
  return t.polys.map((p) => ({ outline: conv(p.outline), holes: p.holes.map((h) => conv(h)) }));
}

/** Okvirna debljina zida (mm) za prikaz: dvostruka površina / obim. */
export function estimateWall(polys: DrawnPolygon[]): number {
  let a = 0; let per = 0;
  for (const p of polys) {
    a += Math.abs(area(p.outline)) - p.holes.reduce((s, h) => s + Math.abs(area(h)), 0);
    for (const ring of [p.outline, ...p.holes]) ring.forEach((pt, i) => { const q = ring[(i + 1) % ring.length]; per += Math.hypot(q[0] - pt[0], q[1] - pt[1]); });
  }
  return per > 0 ? Math.round(((2 * a) / per) * 100) / 100 : 0;
}
