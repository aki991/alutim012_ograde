import type { LayoutItem, Mm } from '../models/types';
import type { ProjectLayout } from './layout';
import type { Plan } from './plan';
import { stairGroupAt } from './stair';

/**
 * Ploča terase (ravan deo na višem nivou) i stepenice zauzimaju prostor iza ograde (do 1.180 mm) i malo ispred nje (120 mm).
 * Na uglu gde se stepenište penje do ploče ploča je cela (podest): stepenice su niže od nje, pa ivica ploče dodiruje poslednji stepenik.
 * Iz ploče se oduzimaju samo stepenice koje se dižu iznad nje (inače bi ploča izvirivala kroz gazišta).
 */
export const LEVEL_DEPTH_MM = 1300;
export const LEVEL_FRONT_MM = 120;
export const LEVEL_BACK_MM = LEVEL_DEPTH_MM - LEVEL_FRONT_MM;

/** Pravougaonik u koordinatama polja: x duž ose (mm), z poprečno (− ka unutrašnjoj strani). */
export interface Rect { x0: Mm; x1: Mm; z0: Mm; z1: Mm }

function subtract(r: Rect, o: Rect): Rect[] {
  if (o.x1 <= r.x0 || o.x0 >= r.x1 || o.z1 <= r.z0 || o.z0 >= r.z1) return [r];
  const out: Rect[] = [];
  if (o.x0 > r.x0) out.push({ x0: r.x0, x1: o.x0, z0: r.z0, z1: r.z1 });
  if (o.x1 < r.x1) out.push({ x0: o.x1, x1: r.x1, z0: r.z0, z1: r.z1 });
  const mx0 = Math.max(r.x0, o.x0);
  const mx1 = Math.min(r.x1, o.x1);
  if (o.z0 > r.z0) out.push({ x0: mx0, x1: mx1, z0: r.z0, z1: o.z0 });
  if (o.z1 < r.z1) out.push({ x0: mx0, x1: mx1, z0: o.z1, z1: r.z1 });
  return out;
}

/**
 * Delovi ploče ravnog polja `index` koji ne ulaze u stepenice. `wl` i `wr` su polovine susednih stubova (ploča ide ispod njih).
 * Stepenice se oduzimaju samo kad su zakrenute za ceo broj pravih uglova u odnosu na polje (tada je presek pravougaonik).
 */
export function levelSlabRects(items: ReadonlyArray<LayoutItem>, plan: Plan, layout: ProjectLayout, index: number, wl: Mm, wr: Mm): Rect[] {
  const li = layout.items[index];
  const pj = plan.items[index];
  if (!li || !pj) return [];
  let rects: Rect[] = [{ x0: li.axisStart - wl, x1: li.axisEnd + wr, z0: -LEVEL_BACK_MM, z1: LEVEL_FRONT_MM }];
  const cj = Math.cos(pj.heading);
  const sj = Math.sin(pj.heading);
  for (let i = 0; i < items.length; i++) {
    const g = stairGroupAt(items, i);
    if (!g || g.from !== i) continue;
    const a = layout.items[g.from];
    const b = layout.items[g.to];
    const ps = plan.items[g.from];
    const cs = Math.cos(ps.heading);
    const ss = Math.sin(ps.heading);
    // stepenište koje se penje najviše do nivoa ploče: ploča ga pokriva (podest na uglu), ne seče se
    if (Math.max(a.floorStart, b.floorEnd) <= li.floorStart + 1) continue;
    const rel = ps.heading - pj.heading;
    if (Math.abs(Math.sin(2 * rel)) > 1e-3) continue; // nije prav ugao: presek nije pravougaonik
    const xs: number[] = [];
    const zs: number[] = [];
    for (const x of [a.axisStart, b.axisEnd]) {
      for (const z of [-LEVEL_BACK_MM, LEVEL_FRONT_MM]) {
        // tačka stepenica u svetu pa u koordinate polja
        const wx = ps.start.x + (x - a.axisStart) * cs - z * ss;
        const wz = ps.start.z + (x - a.axisStart) * ss + z * cs;
        const dx = wx - pj.start.x;
        const dz = wz - pj.start.z;
        xs.push(dx * cj + dz * sj + li.axisStart);
        zs.push(-dx * sj + dz * cj);
      }
    }
    const o: Rect = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    rects = rects.flatMap((r) => subtract(r, o));
  }
  return rects.filter((r) => r.x1 - r.x0 > 1 && r.z1 - r.z0 > 1);
}

/**
 * Podest na vrhu stepeništa (koordinate prvog polja stepeništa, kao gazišta): kad posle poslednjeg stepenika nema ravnog dela u istom pravcu
 * (ograda skreće ka spoljnoj strani ili se trasa tu završava), dodaje se podloga koja spaja poslednji stepenik sa ravnim delom.
 * Kad ograda skrene ka unutrašnjoj strani, ploča ravnog dela već pokriva ugao, pa podest nije potreban.
 */
export function stairLandingRects(items: ReadonlyArray<LayoutItem>, plan: Plan, layout: ProjectLayout, index: number): { rect: Rect; level: Mm }[] {
  const g = stairGroupAt(items, index);
  if (!g || g.from !== index) return [];
  const a = layout.items[g.from];
  const b = layout.items[g.to];
  const up = b.floorEnd > a.floorStart;
  const level = up ? b.floorEnd : a.floorStart;
  if (level <= 0) return [];
  const joint = up ? g.to + 1 : g.from;
  const neighbor = layout.items[up ? g.to + 1 : g.from - 1];
  const turn = plan.posts[joint]?.turnDeg ?? 0;
  const flatHere = !!neighbor && neighbor.floorStart === neighbor.floorEnd && Math.abs(neighbor.floorStart - level) < 1;
  // spoljna strana je + (ispred ograde): skretanje udesno (+) na vrhu stepenica koje se penju ide ka njoj; na vrhu stepenica koje silaze važi isti znak
  const outward = turn > 0;
  if (neighbor && !(flatHere && outward)) return [];
  const z1 = neighbor ? 0 : LEVEL_FRONT_MM;
  const rect: Rect = up ? { x0: b.axisEnd, x1: b.axisEnd + LEVEL_BACK_MM, z0: -LEVEL_BACK_MM, z1 } : { x0: a.axisStart - LEVEL_BACK_MM, x1: a.axisStart, z0: -LEVEL_BACK_MM, z1 };
  return [{ rect, level }];
}
