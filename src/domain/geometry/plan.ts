import type { Mm, Project } from '../models/types';
import { computeLayout } from './layout';

/**
 * Tlocrt trase (pogled odozgo). Ograda ne mora biti prava: na svakom međustubu može da se zada ugao skretanja
 * (`Post.turnDeg`). Pozitivan ugao je skretanje udesno gledano duž trase (u tlocrtu u smeru kazaljke na satu),
 * negativan ulevo. Koordinate u mm: x duž početnog pravca, z ka ulici (+z) odnosno dvorištu (−z).
 * Za pravu ogradu tlocrt je isto što i linearni raspored (x = osa stuba, z = 0).
 */
export const MAX_TURN_DEG = 180;

export interface PlanPoint { x: Mm; z: Mm }

export interface PlanItem {
  index: number;
  /** osa levog i desnog stuba elementa u tlocrtu */
  start: PlanPoint;
  end: PlanPoint;
  /** pravac elementa na početku (rad), 0 = +x, raste ka +z */
  heading: number;
  /** pravac na kraju elementa (različit od početnog samo kod ugaonog spoja) */
  endHeading: number;
  /** ugaoni spoj: tačka savijanja (sredina razmaka) i ugao savijanja (stepeni) */
  bend?: { at: PlanPoint; deg: number };
}

export interface PlanPost {
  index: number;
  at: PlanPoint;
  /** orijentacija stuba (rad): pravac dolazećeg elementa (kod prvog stuba pravac prvog elementa) */
  heading: number;
  /** ugao skretanja na ovom stubu (stepeni); 0 za krajnje stubove */
  turnDeg: number;
}

export interface Plan {
  items: PlanItem[];
  posts: PlanPost[];
  /** da li trasa ima bar jedno skretanje */
  turned: boolean;
  minX: Mm; maxX: Mm; minZ: Mm; maxZ: Mm;
}

/** Ugao skretanja na međustubu (krajnji stubovi nemaju skretanje). */
export function turnAt(project: Pick<Project, 'items' | 'posts'>, postIndex: number): number {
  if (postIndex <= 0 || postIndex >= project.items.length) return 0;
  const t = project.posts[postIndex]?.turnDeg;
  return Number.isFinite(t) ? Math.max(-MAX_TURN_DEG, Math.min(MAX_TURN_DEG, t as number)) : 0;
}

export function computePlan(project: Pick<Project, 'items' | 'posts'>): Plan {
  const layout = computeLayout(project);
  const items: PlanItem[] = [];
  const posts: PlanPost[] = [];
  let heading = 0;
  let at: PlanPoint = { x: 0, z: 0 };
  const rad = (d: number) => (d * Math.PI) / 180;

  layout.items.forEach((li, i) => {
    const turn = turnAt(project, i);
    const incoming = heading;
    heading += rad(turn);
    const len = li.axisEnd - li.axisStart;
    const startHeading = heading;
    const item = li.item;
    const bendDeg = item.kind === 'opening' && item.bendDeg ? Math.max(-MAX_TURN_DEG, Math.min(MAX_TURN_DEG, item.bendDeg)) : 0;
    let end: PlanPoint;
    let bend: PlanItem['bend'];
    if (bendDeg !== 0) {
      // ugaoni spoj: prva polovina razmaka ide u dolazećem pravcu, druga u novom (savijanje cevi je između dva stuba)
      const mid = { x: at.x + (len / 2) * Math.cos(heading), z: at.z + (len / 2) * Math.sin(heading) };
      heading += rad(bendDeg);
      end = { x: mid.x + (len / 2) * Math.cos(heading), z: mid.z + (len / 2) * Math.sin(heading) };
      bend = { at: mid, deg: bendDeg };
    } else {
      end = { x: at.x + len * Math.cos(heading), z: at.z + len * Math.sin(heading) };
    }
    posts.push({ index: i, at, heading: i === 0 ? startHeading : incoming, turnDeg: turn });
    items.push({ index: i, start: at, end, heading: startHeading, endHeading: heading, bend });
    at = end;
  });
  if (layout.items.length > 0) posts.push({ index: layout.items.length, at, heading: items[items.length - 1].endHeading, turnDeg: 0 });
  else project.posts.forEach((_, i) => posts.push({ index: i, at: { x: 0, z: 0 }, heading: 0, turnDeg: 0 }));

  const pts = posts.map((p) => p.at);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  return {
    items, posts,
    turned: posts.some((p) => p.turnDeg !== 0) || items.some((i) => i.bend !== undefined),
    minX: Math.min(0, ...xs), maxX: Math.max(0, ...xs), minZ: Math.min(0, ...zs), maxZ: Math.max(0, ...zs),
  };
}
