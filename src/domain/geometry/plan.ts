import { rl10Corner } from '../models/rl10';
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
  /** pomeraj stuba u tlocrtu (model RL10: stub uz zglob stoji pored njega, na ravnom delu) i pravac polja koje stub nosi */
  shift: PlanPoint;
  supportHeading: number;
  /** model RL10, ugao u osnovi: položaj pomoćnog stuba na dolazećoj ogradi (isti pravac kao dolazeća ograda) */
  aux?: PlanPoint;
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

/** Nizovi uzastopnih elemenata bez skretanja između (ugaoni spoj prekida niz). */
export function planRuns(plan: Plan): { first: number; last: number }[] {
  const runs: { first: number; last: number }[] = [];
  const isBend = (it: PlanItem) => it.bend !== undefined;
  plan.items.forEach((pi, i) => {
    const prev = plan.items[i - 1];
    const breaks = !prev || isBend(pi) || isBend(prev) || plan.posts[i].turnDeg !== 0;
    if (breaks) runs.push({ first: i, last: i });
    else runs[runs.length - 1].last = i;
  });
  return runs.filter((r) => !isBend(plan.items[r.first]));
}

/** Pravac (rad) najdužeg pravog niza ograde; 0 za pravu ogradu. */
export function longestRunHeading(plan: Plan): number {
  if (!plan.turned) return 0;
  let best: { first: number; last: number } | null = null;
  let bestLen = -1;
  for (const r of planRuns(plan)) {
    let len = 0;
    for (let i = r.first; i <= r.last; i++) len += Math.hypot(plan.items[i].end.x - plan.items[i].start.x, plan.items[i].end.z - plan.items[i].start.z);
    if (len > bestLen + 1e-6) { best = r; bestLen = len; }
  }
  return best ? plan.items[best.first].heading : 0;
}

/** Zakreće tlocrt tako da najduži pravi niz ograde leži vodoravno (pravac +x); ostatak trase se orijentiše prema njemu. */
export function alignToLongestRun(plan: Plan): Plan {
  const h = longestRunHeading(plan);
  if (Math.abs(h) < 1e-9) return plan;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const rot = (p: PlanPoint): PlanPoint => ({ x: p.x * c + p.z * s, z: -p.x * s + p.z * c });
  const items = plan.items.map((it) => ({ ...it, start: rot(it.start), end: rot(it.end), heading: it.heading - h, endHeading: it.endHeading - h, bend: it.bend ? { ...it.bend, at: rot(it.bend.at) } : undefined }));
  const posts = plan.posts.map((p) => ({ ...p, at: rot(p.at), heading: p.heading - h, shift: rot(p.shift), supportHeading: p.supportHeading - h, ...(p.aux ? { aux: rot(p.aux) } : {}) }));
  const xs = posts.map((p) => p.at.x);
  const zs = posts.map((p) => p.at.z);
  return { ...plan, items, posts, minX: Math.min(0, ...xs), maxX: Math.max(0, ...xs), minZ: Math.min(0, ...zs), maxZ: Math.max(0, ...zs) };
}

export function computePlan(project: Pick<Project, 'items' | 'posts'>, alignLongest = false): Plan {
  const plan = buildPlan(project);
  return alignLongest ? alignToLongestRun(plan) : plan;
}

function buildPlan(project: Pick<Project, 'items' | 'posts'>): Plan {
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
    // model RL10: stepenište pa ograda u stranu — pravo parče rukohvata između dve kugle; skretanje je iza njega
    const corner = rl10Corner(project.items, layout, project.posts, i);
    const piece = corner?.pieceMm ?? 0;
    const joint = at;
    const start: PlanPoint = piece > 0 ? { x: joint.x + piece * Math.cos(incoming), z: joint.z + piece * Math.sin(incoming) } : joint;
    const shiftMm = layout.posts[i]?.shiftMm ?? 0;
    let shift: PlanPoint = { x: 0, z: 0 };
    let supportHeading = i === 0 ? startHeading : incoming;
    if (shiftMm < 0) { shift = { x: shiftMm * Math.cos(incoming), z: shiftMm * Math.sin(incoming) }; supportHeading = incoming; }
    else if (shiftMm > 0) { shift = { x: start.x - joint.x + shiftMm * Math.cos(startHeading), z: start.z - joint.z + shiftMm * Math.sin(startHeading) }; supportHeading = startHeading; }
    if (piece > 0) {
      end = { x: start.x + len * Math.cos(heading), z: start.z + len * Math.sin(heading) };
    }
    // pomoćni stub: na dolazećoj ogradi, `off` ispred ugla (ugao je na početku nove ograde)
    const auxMm = layout.posts[i]?.auxShiftMm ?? null;
    const aux: PlanPoint | undefined = auxMm !== null ? { x: start.x + auxMm * Math.cos(incoming), z: start.z + auxMm * Math.sin(incoming) } : undefined;
    posts.push({ index: i, at: joint, heading: i === 0 ? startHeading : incoming, turnDeg: turn, shift, supportHeading, ...(aux ? { aux } : {}) });
    items.push({ index: i, start, end, heading: startHeading, endHeading: heading, bend });
    at = end;
  });
  if (layout.items.length > 0) posts.push({ index: layout.items.length, at, heading: items[items.length - 1].endHeading, turnDeg: 0, shift: { x: 0, z: 0 }, supportHeading: items[items.length - 1].endHeading });
  else project.posts.forEach((_, i) => posts.push({ index: i, at: { x: 0, z: 0 }, heading: 0, turnDeg: 0, shift: { x: 0, z: 0 }, supportHeading: 0 }));

  const pts = posts.map((p) => p.at);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  return {
    items, posts,
    turned: posts.some((p) => p.turnDeg !== 0) || items.some((i) => i.bend !== undefined),
    minX: Math.min(0, ...xs), maxX: Math.max(0, ...xs), minZ: Math.min(0, ...zs), maxZ: Math.max(0, ...zs),
  };
}
