import { customModelOf } from '../models/customRegistry';
import { postPositions, postSpec } from '../models/terraceHardware';
import type { FenceSection, LayoutItem, Material, Project } from '../models/types';
import { computeLayout } from './layout';
import { turnAt } from './plan';
import { stairGroupAt, stepBounds } from './stair';
import type { SlatOverride } from '../models/gateRefill';
import { withCornerConnections } from './runJoints';

/**
 * Stubovi ograde za terasu na celoj ravnoj liniji ograde: uzastopna polja istog nacrtanog modela (bez stepeništa) čine jednu liniju, pa se
 * stubovi raspoređuju po njoj, na jednakom razmaku od najviše 1000 mm (podešava se u „Mere ograde“), a prvi i poslednji na zadatom
 * odstojanju od krajeva linije. Stub na spoju polja pripada desnom polju (naslonjen uz spoj). Položaji se upisuju u polja (params.slats.postXs).
 * Vraća isti projekat kad nema izmena.
 */
export function withRunPosts(project: Project, materials: Material[]): Project {
  const isRunItem = (it: LayoutItem): it is FenceSection => it.kind === 'fence' && customModelOf(it.modelId)?.kind === 'terrace';
  const sameRun = (a: FenceSection, b: FenceSection): boolean => a.modelId === b.modelId && !!a.stair === !!b.stair && a.stair?.group === b.stair?.group;
  const hasAny = project.items.some((it) => it.kind === 'fence' && (it.params.slats?.postXs || isRunItem(it)));
  if (!hasAny) return project;
  const layout = computeLayout(project);
  type Want = { xs: number[]; drops?: number[]; tan?: number; treads?: SlatOverride['stairTreads']; turns?: [number, number]; bends?: [number, number]; free?: [boolean, boolean]; joint?: 'ball' | 'elbow'; arm?: number };
  const next = new Map<string, Want | undefined>();
  let i = 0;
  while (i < project.items.length) {
    const it = project.items[i];
    if (!isRunItem(it)) { next.set(it.id, undefined); i++; continue; }
    let j = i;
    while (j + 1 < project.items.length && isRunItem(project.items[j + 1]) && sameRun(it, project.items[j + 1] as FenceSection) && !turnAt(project, j + 1)) j++;
    const model = customModelOf(it.modelId)!;
    const spec = postSpec(model, materials, it.params.slats);
    const start = layout.items[i].clearStart;
    const total = layout.items[j].clearEnd - start;
    let xs = spec ? postPositions(total, spec) : null;
    let drops: number[] | undefined; let tan: number | undefined;
    // stepenište: stubovi su uspravni i stoje po sredini gazišta; duži su naniže do gazišta, a rukohvat ostaje na liniji nagiba
    const g = stairGroupAt(project.items, i);
    const treadBounds = g && model.terraceSourceId ? stepBounds(layout.items[g.from].axisStart, layout.items[g.to].axisEnd,
      layout.items[g.from].floorStart, layout.items[g.to].floorEnd,
      g.dims ?? Array.from({ length: g.steps }, () => ({ treadMm: 1, riseMm: 1 }))) : undefined;
    if (xs && g && g.from === i && g.to === j) {
      const a = layout.items[i]; const b = layout.items[j];
      const dims = g.dims ?? Array.from({ length: g.steps }, () => ({ treadMm: 1, riseMm: 1 }));
      const bounds = stepBounds(a.axisStart, b.axisEnd, a.floorStart, b.floorEnd, dims);
      const up = b.floorEnd >= a.floorStart;
      const run = b.axisEnd - a.axisStart;
      tan = run > 0 ? (b.floorEnd - a.floorStart) / run : 0;
      const centerOf = (k: number): number => (bounds[k].xa + bounds[k].xb) / 2;
      const sl0 = it.params.slats;
      const nT = bounds.length;
      // gazišta se broje od dna stepeništa (m = 0 je pod ispred prvog stepenika): kad se penje, dno je levo, kad silazi, desno
      const kOf = (m: number): number => (up ? m : nT - 1 - m);
      const lastM = Math.max(0, Math.min(nT - 1, Math.round(sl0?.stairLastStep ?? nT - 1)));
      const floorFirst = Boolean(sl0?.stairFirstFloor);
      const firstM = Math.min(floorFirst ? 0 : 1, nT - 1);
      const firstK = kOf(firstM);
      const lastIdx = kOf(Math.max(firstM, lastM));
      const firstX = centerOf(firstK);
      const lastX = centerOf(lastIdx);
      const span = Math.abs(lastX - firstX);
      const dir = lastX >= firstX ? 1 : -1;
      const spacing = spec!.spacing;
      const n = span < 1 ? 1 : Math.max(2, Math.ceil(span / spacing - 1e-9) + 1);
      const pts: { x: number; k: number }[] = [{ x: firstX, k: firstK }];
      if (n > 1) {
        const used = new Set<number>([firstK, lastIdx]);
        for (let q = 1; q < n - 1; q++) {
          const gx = firstX + (dir * span * q) / (n - 1);
          let best = -1; let bd = Infinity;
          bounds.forEach((_, k) => { if (used.has(k) || k < Math.min(firstK, lastIdx) || k > Math.max(firstK, lastIdx)) return; const d = Math.abs(centerOf(k) - gx); if (d < bd) { bd = d; best = k; } });
          if (best >= 0) { used.add(best); pts.push({ x: centerOf(best), k: best }); }
        }
        pts.push({ x: lastX, k: lastIdx });
      }
      pts.sort((p, q) => p.x - q.x);
      xs = pts.map((p) => p.x - a.axisStart);
      drops = pts.map((p) => {
        const line = a.floorStart + (run > 0 ? ((p.x - a.axisStart) / run) * (b.floorEnd - a.floorStart) : 0);
        const level = up ? bounds[p.k].fa : bounds[p.k].fb;
        return Math.round(Math.max(0, line - level) * 10) / 10;
      });
    }
    for (let k = i; k <= j; k++) {
      const li = layout.items[k];
      const a = li.clearStart - start; const w = li.clearWidth;
      if (!spec || !xs) {
        // Preneto platno može da koristi projektne stubove. I tada je potreban nagib
        // za uspravne tarabice i njihove čepove, bez izmišljanja stubova u samoj ispuni.
        const run = li.axisEnd - li.axisStart;
        next.set(project.items[k].id, model.terraceSourceId && it.stair && run > 0
          ? { xs: [], tan: (li.floorEnd - li.floorStart) / run } : undefined);
        continue;
      }
      const idx = xs.map((_, n) => n).filter((n) => xs![n] >= a - 0.5 && (xs![n] < a + w - 0.5 || k === j));
      const half = drops ? 0 : spec.half;
      next.set(project.items[k].id, {
        xs: idx.map((n) => Math.round(Math.min(Math.max(xs![n] - a, half), Math.max(half, w - half)) * 10) / 10),
        ...(drops ? { drops: idx.map((n) => drops![n]) } : {}),
        ...(tan !== undefined ? { tan } : {}),
        ...(treadBounds ? { treads: treadBounds.map((t) => ({ fromMm: t.xa - li.clearStart, toMm: t.xb - li.clearStart,
          levelMm: (g!.riseMm >= 0 ? t.fa : t.fb) - li.floorStart - (tan ?? 0) * (li.clearStart - li.axisStart) })) } : {}),
        ...(project.settings.cornerJoint ? { joint: project.settings.cornerJoint } : {}),
        ...(project.settings.cornerArmMm !== undefined ? { arm: project.settings.cornerArmMm } : {}),
        ...((): { turns?: [number, number] } => { const t: [number, number] = [turnAt(project, k), turnAt(project, k + 1)]; return t[0] || t[1] ? { turns: t } : {}; })(),
        // stepenište na kraju ograde (nema susednog polja): rastojanje krajnjeg stuba do kraja prečke i rukohvata
        ...((): { free?: [boolean, boolean] } => {
          if (!it.stair) return {};
          const f: [boolean, boolean] = [k === i && !project.items[i - 1], k === j && !project.items[j + 1]];
          return f[0] || f[1] ? { free: f } : {};
        })(),
        ...((): { bends?: [number, number] } => {
          // promena nagiba prema susednom polju (ravno ↔ stepenište): na tom kraju se cevi sastaju u zglobu ili kolenu
          const slopeAt = (idx: number): number | null => { const l = layout.items[idx]; const q = project.items[idx]; if (!l || !q || !isRunItem(q)) return null; const r = l.axisEnd - l.axisStart; return r > 0 ? (l.floorEnd - l.floorStart) / r : 0; };
          const mine = slopeAt(k);
          const diff = (idx: number): number => { const o = slopeAt(idx); return mine === null || o === null ? 0 : Math.round(Math.abs((Math.atan(o) - Math.atan(mine)) * 180 / Math.PI) * 10) / 10; };
          const b: [number, number] = [k === i && i > 0 && !turnAt(project, k) ? diff(k - 1) : 0, k === j && j + 1 < project.items.length && !turnAt(project, k + 1) ? diff(k + 1) : 0];
          return b[0] > 0.5 || b[1] > 0.5 ? { bends: b } : {};
        })(),
      });
    }
    i = j + 1;
  }
  let changed = false;
  const items = project.items.map((it): LayoutItem => {
    if (it.kind !== 'fence') return it;
    const want = next.get(it.id);
    const sl = it.params.slats;
    const have = sl && (sl.postXs || sl.postDrops || sl.stairTan !== undefined || sl.stairTreads || sl.cornerTurns || sl.cornerBends || sl.freeEnds || sl.cornerJoint || sl.cornerArm !== undefined) ? { xs: sl.postXs, drops: sl.postDrops, tan: sl.stairTan, treads: sl.stairTreads, turns: sl.cornerTurns, bends: sl.cornerBends, free: sl.freeEnds, joint: sl.cornerJoint, arm: sl.cornerArm } : null;
    const w2 = want ? { xs: want.xs, drops: want.drops, tan: want.tan, treads: want.treads, turns: want.turns, bends: want.bends, free: want.free, joint: want.joint, arm: want.arm } : null;
    if (JSON.stringify(w2) === JSON.stringify(have)) return it;
    changed = true;
    const { postXs: _x, postDrops: _d, stairTan: _t, stairTreads: _tr, cornerTurns: _c, cornerBends: _b, freeEnds: _f, cornerJoint: _j, cornerArm: _a, ...rest } = it.params.slats ?? {};
    const slats = want ? { ...rest, postXs: want.xs, ...(want.drops ? { postDrops: want.drops } : {}), ...(want.tan !== undefined ? { stairTan: want.tan } : {}), ...(want.treads ? { stairTreads: want.treads } : {}), ...(want.turns ? { cornerTurns: want.turns } : {}), ...(want.bends ? { cornerBends: want.bends } : {}), ...(want.free ? { freeEnds: want.free } : {}), ...(want.joint ? { cornerJoint: want.joint } : {}), ...(want.arm !== undefined ? { cornerArm: want.arm } : {}) } : Object.keys(rest).length ? rest : undefined;
    const { slats: _s, ...params } = it.params;
    return { ...it, params: slats ? { ...params, slats } : params };
  });
  return withCornerConnections(changed ? { ...project, items } : project, materials);
}

/**
 * Polja nacrtane ograde za terasu u istoj liniji (do krivine ili stepeništa) čine jedno polje, a stepenište je jedno polje: uzastopna polja
 * istog modela i istih osobina (visina, boja, podnožje, podešavanja) se spajaju u jedno, a stub između njih nestaje (stubove crta model).
 * Spojeno polje zadržava ID prvog; `merged` mapira ID uklonjenog polja na ID polja u koje je ušlo. Isti projekat kad nema šta da se spoji.
 */
export function mergeTerraceRuns(project: Project): { project: Project; merged: Map<string, string> } {
  const merged = new Map<string, string>();
  const own = (it: LayoutItem | undefined): it is FenceSection => !!it && it.kind === 'fence' && customModelOf(it.modelId)?.kind === 'terrace';
  const sig = (it: FenceSection): string => {
    const { slats, ...params } = it.params;
    const { postXs: _x, postDrops: _d, stairTan: _t, stairTreads: _tr, cornerConnections: _cn, cornerTurns: _c, cornerBends: _b, freeEnds: _f, cornerJoint: _j, cornerArm: _a, ...s } = slats ?? {};
    return JSON.stringify([it.modelId, it.heightMm, it.color, it.finish ?? null, it.plinthMm ?? null, it.plinthWidthMm ?? null, it.materialId, params, s]);
  };
  const items: LayoutItem[] = []; const posts: Project['posts'] = [];
  project.items.forEach((it, k) => {
    const prev = items[items.length - 1];
    const joint = project.posts[k]; // stub između prethodnog polja i ovog
    const straight = !joint?.turnDeg;
    const sameLine = own(prev) && own(it) && straight && sig(prev) === sig(it);
    const sameStair = sameLine && !!prev.stair && !!it.stair && !!prev.stair.group && prev.stair.group === it.stair.group;
    if (sameLine && ((!prev.stair && !it.stair) || sameStair)) {
      const a = prev as FenceSection; const b = it as FenceSection;
      items[items.length - 1] = {
        ...a, widthMm: a.widthMm + b.widthMm,
        ...(a.stair && b.stair ? { stair: { ...a.stair, riseMm: a.stair.riseMm + b.stair.riseMm, fieldsCustom: false } } : {}),
      };
      merged.set(b.id, a.id);
      return;
    }
    items.push(it);
    posts.push(project.posts[k]);
  });
  if (!merged.size) return { project, merged };
  posts.push(project.posts[project.items.length]);
  return { project: { ...project, items, posts }, merged };
}
