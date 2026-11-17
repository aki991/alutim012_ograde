import { partBounds, type CustomModel, type CustomPart } from './custom';
import { materialShape, type MatShape } from './materialShape';
import { findOverlaps } from './overlap';
import { capsOver, orphanCaps } from './vbars';
import type { Material } from './types';

/**
 * Provera crteža: nabraja šta u crtežu nije kako treba (preklapanja, krive cevi, nejednaki razmaci), da radnik zna šta da ispravi.
 * Posle „slobodnog crtanja“ (gde je dozvoljeno sve) i na zahtev. Upozorenje koje ima smisla radnik može da prihvati; prihvaćena
 * upozorenja (po ključu) čuvaju se uz model i više se ne prikazuju kao aktivna.
 */
export type ProblemKind = 'overlap' | 'crooked' | 'gap' | 'size' | 'cap';
export interface DrawingProblem {
  kind: ProblemKind;
  /** stabilan ključ upozorenja (vrsta + delovi): po njemu se pamti da je radnik upozorenje prihvatio */
  key: string;
  /** poruka na srpskom, razumljiva radniku */
  msg: string;
  /** delovi na koje se problem odnosi (klikom se biraju na crtežu) */
  ids: string[];
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');
/** odstupanje od prave (vodoravne ili uspravne) do kog se cev smatra „skoro ravnom“, pa se prijavljuje kao kriva */
const CROOKED_MAX_DEG = 5;
const CROOKED_MIN_DEG = 0.005;
/** razlika razmaka (mm) iznad koje se razmaci iste grupe prijavljuju kao nejednaki */
const GAP_TOL = 0.5;
/** zalazak do ove mere (mm) je dodir ili zavar (npr. U profil uz cev, kraj letvice u cev): ne prijavljuje se kao preklapanje */
export const OVERLAP_TOUCH_MM = 3;
/** deo koji leži između dva susedna dela prekida niz (nije razmak koji se poredi) ako pokriva bar ovoliki deo njihove dužine */
const SEPARATOR_COVER = 0.5;

const keyOf = (kind: ProblemKind, ids: string[]): string => `${kind}|${[...ids].sort().join('|')}`;

export function checkDrawing(model: CustomModel, materials: Material[]): DrawingProblem[] {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const shapeOf = (p: CustomPart): MatShape | null => { const m = byId.get(p.materialId); return m ? materialShape(m) : null; };
  const nameOf = (p: CustomPart): string => byId.get(p.materialId)?.name ?? 'deo';
  const out: DrawingProblem[] = [];

  // 1) preklapanja
  for (const o of findOverlaps(model, materials)) {
    const sa = shapeOf(o.a); const sb = shapeOf(o.b);
    let detail = '';
    if (sa && sb) {
      const A = partBounds(o.a, sa); const B = partBounds(o.b, sb);
      const dx = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0));
      const dy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
      if (dx > 0 && dy > 0) {
        if (Math.min(dx, dy) <= OVERLAP_TOUCH_MM) continue;
        detail = ` (zalaze ${fmt(Math.min(dx, dy))} mm ${dx <= dy ? 'po širini' : 'po visini'})`;
      }
    }
    const ids = [o.a.id, o.b.id];
    out.push({ kind: 'overlap', key: keyOf('overlap', ids), msg: `„${o.nameA}“ i „${o.nameB}“ se preklapaju${detail}. Ostavite razmak ili ih pomerite po dubini.`, ids });
  }

  // 2) „skoro ravne“ cevi: odstupanje od vodoravne ili uspravne je malo, ali nije nula
  for (const p of model.parts) {
    const s = shapeOf(p);
    if (!s || s.type !== 'linear' || p.cut45 || p.guides) continue;
    const a = ((p.angleDeg % 90) + 90) % 90;
    const dev = Math.min(a, 90 - a);
    if (dev > CROOKED_MIN_DEG && dev <= CROOKED_MAX_DEG) {
      const dir = Math.abs(((p.angleDeg % 180) + 180) % 180 - 90) < 45 ? 'uspravna' : 'vodoravna';
      out.push({ kind: 'crooked', key: keyOf('crooked', [p.id]), msg: `„${nameOf(p)}“ nije ravna: trebalo bi da bude ${dir}, a odstupa ${fmt(dev)}°. Ispravite ugao ili uključite „Pod pravim uglom“.`, ids: [p.id] });
    }
  }

  // 2b) čepovi: čep bez letvice ispod sebe ili dva čepa na istoj letvici (na većim poljima bi se odvojili od letvica)
  for (const c of orphanCaps(model, materials)) {
    out.push({ kind: 'cap', key: keyOf('cap', [c.id]), msg: `„${nameOf(c)}“ nema letvicu ispod sebe (ostao je čep bez letvice). Obrišite ga ili ga postavite na vrh letvice.`, ids: [c.id] });
  }
  for (const b of model.parts) {
    const s = shapeOf(b);
    if (!s || s.type !== 'linear' || ((b.angleDeg % 180) + 180) % 180 !== 90) continue;
    const caps = capsOver(model, b, materials);
    if (caps.length > 1) out.push({ kind: 'cap', key: keyOf('cap', caps.map((c) => c.id)), msg: `Na istoj letvici su ${caps.length} čepa. Obrišite višak.`, ids: caps.map((c) => c.id) });
  }

  // 3) nejednaki razmaci u nizu istih cevi (letvice jedna ispod druge, uspravne jedna pored druge)
  type Item = { p: CustomPart; x0: number; y0: number; x1: number; y1: number };
  const boxes: Item[] = [];
  for (const p of model.parts) { const s = shapeOf(p); if (s) boxes.push({ p, ...partBounds(p, s) }); }
  const groups = new Map<string, Item[]>();
  for (const it of boxes) {
    const { p } = it;
    const s = shapeOf(p);
    if (!s || s.type !== 'linear' || p.cut45 || p.guides || p.angleDeg % 90 !== 0) continue;
    const horizontal = p.angleDeg % 180 === 0;
    const r = (n: number) => Math.round(n * 2) / 2;
    const key = horizontal ? `h|${p.materialId}|${r(it.x0)}|${r(it.x1)}` : `v|${p.materialId}|${r(it.y0)}|${r(it.y1)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }
  for (const [key, items] of groups) {
    if (items.length < 3) continue;
    const horizontal = key.startsWith('h');
    const sorted = [...items].sort((a, b) => (horizontal ? a.y0 - b.y0 : a.x0 - b.x0));
    const members = new Set(items.map((i) => i.p.id));
    // razmak se poredi samo između dva susedna dela između kojih nema trećeg dela (razdelna cev, ram): U profili polja
    // sa razdelnim cevima između nisu niz jednakih razmaka
    const lo0 = horizontal ? Math.min(...items.map((i) => i.x0)) : Math.min(...items.map((i) => i.y0));
    const hi0 = horizontal ? Math.max(...items.map((i) => i.x1)) : Math.max(...items.map((i) => i.y1));
    const crossLen = Math.max(1, hi0 - lo0);
    const separated = (a: Item, b: Item): boolean => {
      const from = horizontal ? a.y1 : a.x1; const to = horizontal ? b.y0 : b.x0;
      const gLo = Math.min(from, to); const gHi = Math.max(from, to);
      return boxes.some((q) => {
        if (members.has(q.p.id)) return false;
        const along0 = horizontal ? q.y0 : q.x0; const along1 = horizontal ? q.y1 : q.x1;
        if (along1 <= gLo + 1e-6 || along0 >= gHi - 1e-6) return false;
        const c0 = horizontal ? q.x0 : q.y0; const c1 = horizontal ? q.x1 : q.y1;
        return Math.min(c1, hi0) - Math.max(c0, lo0) >= SEPARATOR_COVER * crossLen;
      });
    };
    const gaps = sorted.slice(1).map((it, i) => ({ i, g: horizontal ? it.y0 - sorted[i].y1 : it.x0 - sorted[i].x1, skip: separated(sorted[i], it) })).filter((x) => !x.skip);
    if (gaps.length < 2) continue;
    const lo = Math.min(...gaps.map((x) => x.g)); const hi = Math.max(...gaps.map((x) => x.g));
    if (hi - lo <= GAP_TOL) continue;
    // najčešći razmak (zaokružen na 0,5 mm) je „pravi“; ostali se pominju kao odstupanja
    const count = new Map<number, number>();
    for (const { g } of gaps) { const k = Math.round(g * 2) / 2; count.set(k, (count.get(k) ?? 0) + 1); }
    const common = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const odd = gaps.filter((x) => Math.abs(x.g - common) > GAP_TOL);
    const ids = [...new Set(odd.flatMap((x) => [sorted[x.i].p.id, sorted[x.i + 1].p.id]))];
    const name = nameOf(sorted[0].p);
    out.push({
      kind: 'gap',
      key: keyOf('gap', [...members]),
      msg: `Razmaci između „${name}“ (${sorted.length} kom, ${horizontal ? 'vodoravne, odozdo nagore' : 'uspravne, sleva udesno'}) nisu isti: od ${fmt(lo)} do ${fmt(hi)} mm, a najčešći je ${fmt(common)} mm. Različito: ${odd.map((x) => `${x.i + 1}. razmak = ${fmt(x.g)} mm`).join(', ')}.`,
      ids,
    });
  }
  return out;
}
