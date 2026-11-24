import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { newTerraceModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { setHwPick, layoutPosts } from '../domain/models/terraceHardware';

const mats = withTerraceMaterials(MODEL_MATERIALS)!;
const bySku = (sku: string) => mats.find((m) => m.sku === sku)!;
const part = (id: string, sku: string, x: number, y: number, len: number, angle: number): CustomPart => ({ id, materialId: bySku(sku).id, x, y, lengthMm: len, angleDeg: angle, rot: 0, z: 0 });
const model = (): CustomModel => ({ ...newTerraceModel('t1'), widthMm: 1200, parts: [part('p1', 'P-1054', 100, 0, 1000, 90), part('p2', 'P-1054', 1100, 0, 1000, 90), part('h', 'P-1037', 0, 1040, 1200, 0)] });
const xs = (m: CustomModel) => m.parts.filter((p) => p.id.startsWith('p')).map((p) => p.x).sort((a, b) => a - b);

describe('raspored stubova ograde za terasu', () => {
  it('stubovi na najviše 1000 mm, krajnji kao na crtežu', () => {
    const m = model();
    expect(xs(layoutPosts({ ...m, widthMm: 3200 }, m, mats))).toEqual([100, 1100, 2100, 3100]);
    expect(xs(layoutPosts({ ...m, widthMm: 900 }, m, mats))).toEqual([100, 800]);
  });
  it('zadat razmak i odstojanje krajnjih stubova od krajeva', () => {
    const m = { ...model(), postLayout: { spacingMm: 500, leftMm: 50, rightMm: 150 } };
    expect(xs(layoutPosts({ ...m, widthMm: 1200 }, m, mats))).toEqual([50, 550, 1050]);
  });
  it('kopije stuba dobijaju okov', () => {
    const m = setHwPick(model(), 'p1', 'flange', bySku('AK-5036').id);
    const s = layoutPosts({ ...m, widthMm: 3200 }, m, mats);
    expect(s.parts.filter((p) => p.hw?.kind === 'flange')).toHaveLength(4);
  });
});

import { withRunPosts } from '../domain/geometry/runPosts';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import type { FenceModelId, FenceSection } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';

describe('stubovi po ravnoj liniji ograde', () => {
  it('jedna linija od više polja: razmak 1 m preko celih 3800 mm, bez dupliranja na spoju', () => {
    const m = { ...model(), id: 'cm_run' };
    registerCustomModels([m], mats);
    const ID = 'cm_run' as FenceModelId;
    const p = createProject('t', [1100, 1100, 1600].map((w) => createFence({ modelId: ID, widthMm: w, heightMm: 1100 })));
    const q = withRunPosts(p, mats);
    const all = q.items.flatMap((it, k) => (it.kind === 'fence' ? (it.params.slats?.postXs ?? []).map((x) => x + [0, 1100, 2200][k]) : []));
    expect(all).toHaveLength(5);
    expect(all[0]).toBe(100);
    expect(withRunPosts(q, mats)).toBe(q);
  });
});

import { mergeTerraceRuns } from '../domain/geometry/runPosts';

describe('polja u liniji su jedno polje', () => {
  it('ravna polja i stepenište se spajaju, krivina prekida', () => {
    const m = { ...model(), id: 'cm_merge' };
    registerCustomModels([m], mats);
    const ID = 'cm_merge' as FenceModelId;
    const f = (w: number, stair?: { riseMm: number; steps: number; group: string }) => createFence({ modelId: ID, widthMm: w, heightMm: 1100, ...(stair ? { stair } : {}) });
    const g = { steps: 6, group: 'g1' };
    const p = createProject('t', [f(1100), f(1100), f(667, { riseMm: -400, ...g }), f(933, { riseMm: -620, ...g })]);
    const r = mergeTerraceRuns(p);
    expect(r.project.items.map((i) => i.widthMm)).toEqual([2200, 1600]);
    const st = r.project.items[1];
    expect(st.kind === 'fence' && st.stair?.riseMm).toBe(-1020);
    expect(r.project.posts).toHaveLength(3);
    const bent = { ...p, posts: p.posts.map((x, i) => (i === 1 ? { ...x, turnDeg: 90 } : x)) };
    expect(mergeTerraceRuns(bent).project.items.map((i) => i.widthMm)).toEqual([1100, 1100, 1600]);
  });
});

import { customPartsFor } from '../domain/models/customRegistry';
import { partBounds } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';

describe('razni razmaci stubova na 4000 mm', () => {
  it('nema ojačanja ni suvišnih stubova za bilo koji razmak', () => {
    const base = { ...model(), id: 'cm_sweep', widthMm: 1200, parts: [...model().parts, part('r1', 'P-1146', 0, 300, 1200, 0), part('r2', 'P-1146', 0, 700, 1200, 0)] };
    for (const spacing of [300, 500, 600, 700, 800, 900, 1000, 1200, 1500]) {
      const m = { ...base, postLayout: { spacingMm: spacing } };
      registerCustomModels([m], mats);
      const ps = customPartsFor('cm_sweep', 4000, 1100, '#999', { postXs: undefined });
      const posts = ps.filter((r) => r.part.angleDeg === 90 && !r.part.hw);
      const expected = Math.max(2, Math.ceil((4000 - 200) / spacing - 1e-9) + 1);
      expect(posts, `razmak ${spacing}`).toHaveLength(expected);
      expect(ps.some((r) => r.part.id.startsWith('rf_')), `ojačanje ${spacing}`).toBe(false);
      const xs = posts.map((r) => { const b = partBounds(r.part, r.shape); return (b.x0 + b.x1) / 2; }).sort((a, b) => a - b);
      expect(xs[0]).toBeCloseTo(100, 0); expect(xs[xs.length - 1]).toBeCloseTo(3900, 0);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(spacing + 0.5);
      void materialShape;
    }
  });
});

import { setStairGroup } from '../domain/geometry/stairOps';
import { computeLayout } from '../domain/geometry/layout';
import { stairGroupAt, stairProfile } from '../domain/geometry/stair';

describe('stepenište sa merama po stepeniku', () => {
  it('svaki stepenik posebno: zbir mera daje dužinu i visinsku razliku', () => {
    const m = { ...model(), id: 'cm_stair' };
    registerCustomModels([m], mats);
    const ID = 'cm_stair' as FenceModelId;
    let p = createProject('t', [createFence({ modelId: ID, widthMm: 1680, heightMm: 1100, stair: { riseMm: 1020, steps: 6, group: 'g' } })]);
    p = setStairGroup(p, p.items[0].id, { stepMode: 'each' });
    expect(p.items).toHaveLength(1);
    let g = stairGroupAt(p.items, 0)!;
    expect(g.dims).toHaveLength(6);
    p = setStairGroup(p, p.items[0].id, { stepDim: { index: 2, treadMm: 400, riseMm: 200 } });
    g = stairGroupAt(p.items, 0)!;
    expect(g.dims![2]).toEqual({ treadMm: 400, riseMm: 200 });
    expect(g.runMm).toBeCloseTo(1680 - 280 + 400, 0);
    expect(g.riseMm).toBeCloseTo(1020 - 170 + 200, 0);
    const l = computeLayout(p);
    const pts = stairProfile(l.items[0].axisStart, l.items[0].axisEnd, l.items[0].floorStart, l.items[0].floorEnd, 6, g.dims);
    expect(pts[pts.length - 1][1]).toBeCloseTo(l.items[0].floorEnd, 3);
    p = setStairGroup(p, p.items[0].id, { stepMode: 'all' });
    expect(stairGroupAt(p.items, 0)!.dims).toBeUndefined();
  });
});

import { layoutRods, rodMetrics } from '../domain/models/terraceHardware';

describe('raspored prečki', () => {
  it('broj prečki, od poda i do rukohvata, jednak razmak', () => {
    const m: CustomModel = { ...model(), parts: [...model().parts, part('r1', 'P-1146', 0, 200, 1200, 0), part('r2', 'P-1146', 0, 500, 1200, 0), part('r3', 'P-1146', 0, 800, 1200, 0)] };
    const a = rodMetrics(m, mats)!;
    expect(a).toMatchObject({ count: 3, bottomMm: 200, topMm: 240, gapMm: 300 });
    const b = layoutRods(m, { rodCount: 5, rodBottomMm: 100, rodTopMm: 140 }, mats);
    const c = rodMetrics(b, mats)!;
    expect(c.count).toBe(5); expect(c.bottomMm).toBe(100); expect(c.topMm).toBe(140); expect(c.gapMm).toBeCloseTo(200, 1);
    expect(layoutRods(m, { rodCount: 2 }, mats).parts.filter((p) => p.materialId === bySku('P-1146').id)).toHaveLength(2);
    expect(layoutRods(m, undefined, mats)).toBe(m);
  });
});

describe('razmaci između pojedinih prečki', () => {
  it('zadat razmak je tačan, ostali dele preostalo', () => {
    const m: CustomModel = { ...model(), parts: [...model().parts, part('r1', 'P-1146', 0, 200, 1200, 0), part('r2', 'P-1146', 0, 500, 1200, 0), part('r3', 'P-1146', 0, 800, 1200, 0)] };
    // ose: 200 … 800 (rukohvat 1040, do rukohvata 240): prvi razmak 100, drugi preostalo
    const b = layoutRods(m, { rodCount: 3, rodBottomMm: 200, rodTopMm: 240, rodGaps: [100, null] }, mats);
    expect(rodMetrics(b, mats)!.gaps).toEqual([100, 500]);
    const c = layoutRods(m, { rodGaps: [250, 250] }, mats);
    expect(rodMetrics(c, mats)!.gaps).toEqual([250, 250]);
  });
});

describe('stubovi na stepeništu', () => {
  it('uspravni stubovi na sredini gazišta, duži do gazišta, flanša ravna', () => {
    const m = setHwPick({ ...model(), id: 'cm_stairpost' }, 'p1', 'flange', bySku('AK-5036').id);
    registerCustomModels([m], mats);
    const ID = 'cm_stairpost' as FenceModelId;
    const p0 = createProject('t', [createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: 1200, steps: 6, group: 'g' } })]);
    const p = withRunPosts(p0, mats);
    const sl = (p.items[0] as { params: { slats?: { postXs?: number[]; postDrops?: number[]; stairTan?: number } } }).params.slats!;
    // gazišta po 300 mm: centri 150, 450 … 1650; stub na sredini gazišta
    for (const x of sl.postXs!) expect((x - 150) % 300).toBeCloseTo(0, 5);
    expect(sl.postDrops!.length).toBe(sl.postXs!.length);
    // linija nagiba na sredini gazišta je 100 mm iznad gazišta (nagib 1200/1800, polovina gazišta = 100)
    expect(sl.postDrops![0]).toBeCloseTo(100 - 200 + 200 - 100 + 100, 0);
    expect(sl.stairTan).toBeCloseTo(1200 / 1800, 5);
    const ps = customPartsFor(ID, 1800, 1100, '#999', sl);
    const posts = ps.filter((r) => r.part.angleDeg === 90 && !r.part.hw);
    expect(posts.every((r, i) => r.part.y === -sl.postDrops![i])).toBe(true);
    expect(ps.filter((r) => r.part.hw?.kind === 'flange').every((r) => r.part.unshearTan === sl.stairTan)).toBe(true);
  });
});

describe('prvi i poslednji stub na stepeništu', () => {
  it('prvi na podu, poslednji na zadatom stepeniku; stub i flanša ravni', () => {
    const m = setHwPick({ ...model(), id: 'cm_stair2' }, 'p1', 'flange', bySku('AK-5036').id);
    registerCustomModels([m], mats);
    const ID = 'cm_stair2' as FenceModelId;
    const item = createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: 1200, steps: 6, group: 'g' }, params: { slats: { stairFirstFloor: true, stairLastStep: 4 } } } as never);
    const p = withRunPosts(createProject('t', [item]), mats);
    const sl = (p.items[0] as { params: { slats: { postXs: number[]; postDrops: number[] } } }).params.slats;
    expect(sl.postXs[0]).toBe(150); // pod ispred prvog stepenika (gazište 0)
    expect(sl.postDrops[0]).toBeCloseTo(100, 0); // linija nagiba na 150 mm je 100 mm iznad poda
    expect(sl.postXs[sl.postXs.length - 1]).toBe(1350); // sredina četvrtog podignutog stepenika
    const ps = customPartsFor(ID, 1800, 1100, '#999', (p.items[0] as unknown as { params: { slats: never } }).params.slats);
    expect(ps.filter((r) => r.part.angleDeg === 90 && !r.part.hw).every((r) => !!r.part.unshearTan)).toBe(true);
  });
  it.each([1200, -1200])('izostavljanje poslednjeg stuba čuva ostale položaje i uklanja pripadajući materijal i okov (uspon %i)', (riseMm) => {
    const m = setHwPick({ ...model(), id: 'cm_stair_without_last' }, 'p1', 'flange', bySku('AK-5036').id);
    registerCustomModels([m], mats);
    const item = createFence({ modelId: m.id as FenceModelId, widthMm: 1800, heightMm: 1100, stair: { riseMm, steps: 6, group: 'g' },
      params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { stairFirstFloor: true, stairLastStep: 4, postSpacingMm: 500 } } });
    const original = withRunPosts(createProject('t', [item]), mats);
    const full = (original.items[0] as FenceSection).params.slats!;
    const without = withRunPosts({ ...original, items: [{ ...item, params: { ...item.params, slats: { ...full, stairLastPost: false } } }] }, mats);
    const sl = (without.items[0] as FenceSection).params.slats!;
    const removed = riseMm > 0 ? full.postXs!.length - 1 : 0;
    expect(sl.postXs).toEqual(full.postXs!.filter((_, i) => i !== removed));
    expect(sl.postDrops).toEqual(full.postDrops!.filter((_, i) => i !== removed));
    expect(sl.stairLastStep).toBe(4);
    expect(withRunPosts(without, mats)).toBe(without);
    const cuts = (p: typeof original) => buildCutList(p, undefined, mats).filter((r) => r.part === 'Stub').reduce((n, r) => n + r.qty, 0);
    expect(cuts(without)).toBe(cuts(original) - 1);
    const quantity = (p: typeof original, materialId: string) => buildBom(p, mats).filter((r) => r.materialId === materialId).reduce((n, r) => n + r.geometricQty, 0);
    expect(quantity(without, bySku('AK-5036').id)).toBe(quantity(original, bySku('AK-5036').id) - 1);
    expect(quantity(without, bySku('P-1054').id)).toBeLessThan(quantity(original, bySku('P-1054').id));
    const restored = withRunPosts({ ...without, items: [{ ...item, params: { ...item.params, slats: { ...sl, stairLastPost: true } } }] }, mats);
    expect((restored.items[0] as FenceSection).params.slats?.postXs).toEqual(full.postXs);
  });
  it('isključen jedini stub se ne vraća kroz podrazumevani raspored', () => {
    const m = { ...model(), id: 'cm_stair_no_posts' };
    registerCustomModels([m], mats);
    const item = createFence({ modelId: m.id as FenceModelId, widthMm: 1800, heightMm: 1100, stair: { riseMm: -1200, steps: 6, group: 'g' },
      params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { stairLastStep: 1, stairLastPost: false } } });
    const p = withRunPosts(createProject('t', [item]), mats);
    const sl = (p.items[0] as FenceSection).params.slats!;
    expect(sl.postXs).toEqual([]); expect(sl.postDrops).toEqual([]);
    expect(customPartsFor(item.modelId, 1800, 1100, '#999', sl).some((r) => r.part.angleDeg === 90 && !r.part.hw)).toBe(false);
    expect(buildCutList(p, undefined, mats).some((r) => r.part === 'Stub')).toBe(false);
  });
});

import { buildCutList } from '../domain/pricing/production';

describe('krojna lista ograde na stepeništu', () => {
  it('stubova ima koliko je postavljeno, svaki do gazišta, prečke po kosini', () => {
    const m = setHwPick({ ...model(), id: 'cm_cutstair', parts: [...model().parts, part('r1', 'P-1146', 0, 200, 1200, 0), part('r2', 'P-1146', 0, 500, 1200, 0)] }, 'p1', 'flange', bySku('AK-5036').id);
    registerCustomModels([m], mats);
    const ID = 'cm_cutstair' as FenceModelId;
    const p = withRunPosts(createProject('t', [createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: 1200, steps: 6, group: 'g' } })]), mats);
    const rows = buildCutList(p, undefined, mats);
    const posts = rows.filter((r) => r.part === 'Stub');
    expect(posts.reduce((n, r) => n + r.qty, 0)).toBe(3);
    expect(posts[0].lengthMm).toBe(1100);
    expect(posts[0].note ?? '').not.toMatch(/krajevi pod uglom/);
    const rods = rows.find((r) => r.part === 'Prečka')!;
    expect(rods.qty).toBe(2);
    expect(rods.lengthMm).toBe(Math.round(1800 * Math.sqrt(1 + (1200 / 1800) ** 2)));
  });
});

describe('veza stub–rukohvat na stepeništu', () => {
  it('donji deo veze je ravan, samo ploča prati nagib', () => {
    let m = setHwPick({ ...model(), id: 'cm_conn' }, 'p1', 'connector', bySku('AK-5039-40').id);
    m = setHwPick(m, 'p2', 'connector', bySku('AK-5039-40').id);
    registerCustomModels([m], mats);
    const ID = 'cm_conn' as FenceModelId;
    const p = withRunPosts(createProject('t', [createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: 1200, steps: 6, group: 'g' } })]), mats);
    const ps = customPartsFor(ID, 1800, 1100, '#999', (p.items[0] as unknown as { params: { slats: never } }).params.slats);
    const neck = ps.filter((r) => r.part.hw?.kind === 'connector' && !r.part.id.endsWith('~plate'));
    const plate = ps.filter((r) => r.part.id.endsWith('~plate'));
    expect(neck.length).toBeGreaterThan(0);
    expect(plate).toHaveLength(neck.length);
    expect(neck.every((r) => !!r.part.unshearTan)).toBe(true);
    expect(plate.every((r) => !r.part.unshearTan)).toBe(true);
  });
});

import { computePlan } from '../domain/geometry/plan';
import { levelSlabRects, stairLandingRects } from '../domain/geometry/slab';
import { cornerRods } from '../domain/models/terraceHardware';
import { updatePost } from '../domain/geometry/operations';

describe('ugao stepeništa i ravnog dela', () => {
  const build = (turn: number) => {
    const m = { ...model(), id: 'cm_corner' };
    registerCustomModels([m], mats);
    const ID = 'cm_corner' as FenceModelId;
    let p = createProject('t', [createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: 1200, steps: 6, group: 'g' } }), createFence({ modelId: ID, widthMm: 2000, heightMm: 1100 })]);
    p = updatePost(p, p.posts[1].id, { turnDeg: turn });
    return p;
  };
  const world = (pi: { start: { x: number; z: number }; heading: number }, axisStart: number, x: number, z: number) => ({
    x: pi.start.x + (x - axisStart) * Math.cos(pi.heading) - z * Math.sin(pi.heading), z: pi.start.z + (x - axisStart) * Math.sin(pi.heading) + z * Math.cos(pi.heading) });

  it('skretanje ka spoljnoj strani: podest posle poslednjeg stepenika dodiruje ploču, ne preklapa je', () => {
    const p = build(90);
    const plan = computePlan(p); const l = computeLayout(p);
    const pads = stairLandingRects(p.items, plan, l, 0);
    expect(pads).toHaveLength(1);
    expect(pads[0].level).toBe(1200);
    const r = pads[0].rect;
    const slab = levelSlabRects(p.items, plan, l, 1, 0, 0);
    // tačke unutar podesta nisu u ploči, a tačke tik uz ivicu z = 0 jesu u ploči
    const inSlab = (wx: number, wz: number) => { const pj = plan.items[1]; const dx = wx - pj.start.x; const dz = wz - pj.start.z; const lx = dx * Math.cos(pj.heading) + dz * Math.sin(pj.heading) + l.items[1].axisStart; const lz = -dx * Math.sin(pj.heading) + dz * Math.cos(pj.heading); return slab.some((s) => lx > s.x0 && lx < s.x1 && lz > s.z0 && lz < s.z1); };
    let inside = 0; let touching = 0;
    for (let x = r.x0 + 10; x < r.x1; x += 50) {
      for (let z = r.z0 + 10; z < r.z1; z += 50) { const w = world(plan.items[0], l.items[0].axisStart, x, z); if (inSlab(w.x, w.z)) inside++; }
      const w = world(plan.items[0], l.items[0].axisStart, x, 5); if (inSlab(w.x, w.z)) touching++;
    }
    expect(inside).toBe(0);
    expect(touching).toBeGreaterThan(0);
  });

  it('skretanje ka unutrašnjoj strani: ploča je cela (podest na uglu), bez dodatnog podesta', () => {
    const p = build(-90);
    const plan = computePlan(p); const l = computeLayout(p);
    expect(stairLandingRects(p.items, plan, l, 0)).toHaveLength(0);
    expect(levelSlabRects(p.items, plan, l, 1, 0, 0)).toHaveLength(1);
  });

  it('prečke ispred stubova se na uglu produžavaju ili skraćuju za z · tg(ugao/2)', () => {
    const m: CustomModel = { ...model(), widthMm: 1200, parts: [...model().parts, { ...part('r1', 'P-1146', 0, 300, 1200, 0), z: 35 }] };
    const a = cornerRods(m, [0, 90], mats).parts.find((q) => q.id === 'r1')!;
    expect(a.lengthMm).toBeCloseTo(1200 - 35, 1);
    const b = cornerRods(m, [0, -90], mats).parts.find((q) => q.id === 'r1')!;
    expect(b.lengthMm).toBeCloseTo(1200 + 35, 1);
    const c = cornerRods(m, [90, 0], mats).parts.find((q) => q.id === 'r1')!;
    expect(c.x).toBeCloseTo(35, 1);
  });
});

describe('spoj na uglu: kuglasti zglob ili koleno', () => {
  const base = (): CustomModel => ({ ...model(), id: 'cm_joint', widthMm: 1200, parts: [...model().parts, { ...part('r1', 'P-1146', 0, 300, 1200, 0), z: 35 }] });
  it('kuglasti zglob: kugla prečnika cevi u tački sastanka, cevi se sastaju', () => {
    const m = base();
    const r = cornerRods(m, [0, 90], mats);
    const rod = r.parts.find((q) => q.id === 'r1')!;
    expect(rod.lengthMm).toBeCloseTo(1200 - 35, 1);
    const balls = r.parts.filter((q) => q.hw?.kind === 'cornerBall');
    expect(balls.length).toBeGreaterThanOrEqual(2); // prečka Ø16 i rukohvat Ø40
    const rodBall = balls.find((q) => q.hw!.on === 'r1')!;
    expect(mats.find((x) => x.id === rodBall.materialId)!.name).toMatch(/Zglob prečke Ø16/);
    expect(rodBall.x).toBeCloseTo(1200 - 35, 1);
    expect(r.parts.some((q) => q.hw?.kind === 'cornerArm')).toBe(false);
  });
  it('koleno: svaka cev je kraća za krak kolena, koleno se računa jednom po uglu', () => {
    const m = { ...base(), cornerJoint: 'elbow' as const };
    const r = cornerRods(m, [90, 90], mats);
    const rod = r.parts.find((q) => q.id === 'r1')!;
    expect(rod.lengthMm).toBeCloseTo(1200 - 2 * 35 - 2 * 40, 1);
    const elbow = r.parts.filter((q) => q.hw?.kind === 'cornerBall' && q.hw.on === 'r1');
    expect(elbow).toHaveLength(1);
    expect(mats.find((x) => x.id === elbow[0].materialId)!.name).toMatch(/Koleno prečke Ø16, 90°/);
    expect(r.parts.filter((q) => q.hw?.kind === 'cornerArm' && q.hw.on === 'r1')).toHaveLength(1);
  });
});

import { propagateItemChange } from '../domain/geometry/editScope';

describe('stepenište koje silazi i opseg izmena', () => {
  it('silazi: prvi stub (dno) na podu je na desnom kraju, na nivou poda', () => {
    const m = { ...model(), id: 'cm_down' };
    registerCustomModels([m], mats);
    const ID = 'cm_down' as FenceModelId;
    const item = createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: -1200, steps: 6, group: 'g' }, params: { slats: { stairFirstFloor: true } } } as never);
    const p = withRunPosts(createProject('t', [item]), mats);
    const sl = (p.items[0] as unknown as { params: { slats: { postXs: number[]; postDrops: number[] } } }).params.slats;
    expect(sl.postXs[sl.postXs.length - 1]).toBe(1650); // gazište na podu (zadnje, desno)
    expect(sl.postDrops[sl.postDrops.length - 1]).toBeCloseTo(100, 0);
  });
  it('„Platna i stepenište“ prenosi izmenu i na stepenište, „Sva platna“ ne', () => {
    const m = { ...model(), id: 'cm_scope' };
    registerCustomModels([m], mats);
    const ID = 'cm_scope' as FenceModelId;
    const a = createFence({ modelId: ID, widthMm: 1000, heightMm: 1100 });
    const s = createFence({ modelId: ID, widthMm: 1800, heightMm: 1100, stair: { riseMm: 1200, steps: 6, group: 'g' } });
    const p = createProject('t', [a, s]);
    const next = { ...p, items: p.items.map((i) => (i.id === a.id ? { ...i, color: 'RAL 9005' } : i)) } as typeof p;
    const same = propagateItemChange(p, next, a.id, 'same').items[1];
    const all = propagateItemChange(p, next, a.id, 'all').items[1];
    expect(same.kind === 'fence' && same.color).not.toBe('RAL 9005');
    expect(all.kind === 'fence' && all.color).toBe('RAL 9005');
  });
});

import { buildRequisition } from '../domain/pricing/requisition';
import { DEFAULT_KERF_MM, DEFAULT_STOCK_MM } from '../domain/pricing/cutting';

describe('trebovanje ograde sa uglom', () => {
  // cevi na crtežu počinju kod stuba (ne na ivici polja), kao u stvarnom modelu
  const mk = (id: string, joint?: 'elbow'): CustomModel => setHwPick(setHwPick({ ...model(), id, widthMm: 1200, ...(joint ? { cornerJoint: joint } : {}),
    parts: [...model().parts.filter((p) => p.id !== 'h'), { ...part('r1', 'P-1146', 100, 300, 1000, 0), z: 35 }, { ...part('r2', 'P-1146', 100, 600, 1000, 0), z: 35 }, part('h', 'P-1037', 100, 1040, 1000, 0)] }, 'r1', 'rodCap', bySku('AK-5012A').id), 'r2', 'rodCap', bySku('AK-5012A').id);
  const lines = (model: CustomModel, turn: number) => {
    registerCustomModels([model], mats);
    const ID = model.id as FenceModelId;
    let p = createProject('t', [createFence({ modelId: ID, widthMm: 1200, heightMm: 1100 }), createFence({ modelId: ID, widthMm: 1200, heightMm: 1100 })]);
    p = { ...p, posts: p.posts.map((x, i) => (i === 1 ? { ...x, turnDeg: turn } : x)) };
    p = withRunPosts(p, mats);
    return buildRequisition(p, mats, undefined, { stockMm: DEFAULT_STOCK_MM, kerfMm: DEFAULT_KERF_MM } as never).groups.flatMap((g) => g.lines);
  };
  const qty = (l: ReturnType<typeof lines>, re: RegExp) => l.filter((x) => re.test(x.name)).reduce((n, x) => n + x.qty, 0);

  it('kuglasti zglob: dodaju se mesta spajanja, a završeci prečki se smanjuju', () => {
    const ravno = lines(mk('cm_req_a'), 0);
    const ugao = lines(mk('cm_req_b'), 90);
    expect(qty(ravno, /Zglob prečke/)).toBe(0);
    expect(qty(ugao, /Zglob prečke Ø16/)).toBe(2); // po jedan na prečku
    expect(qty(ugao, /Završetak prečke|Kapica prečke/)).toBeLessThan(qty(ravno, /Završetak prečke|Kapica prečke/));
  });
  it('koleno: dodaju se kolena prečki', () => {
    const ugao = lines(mk('cm_req_c', 'elbow'), 90);
    expect(qty(ugao, /Koleno prečke Ø16, 90°/)).toBe(2);
    expect(qty(ugao, /Zglob prečke/)).toBe(0);
  });
});

describe('spoj na prelazu ravno–stepenište (promena nagiba)', () => {
  const mk = (id: string, joint?: 'elbow'): CustomModel => ({ ...model(), id, widthMm: 1200, ...(joint ? { cornerJoint: joint } : {}),
    parts: [...model().parts.filter((p) => p.id !== 'h'), { ...part('r1', 'P-1146', 100, 300, 1000, 0), z: 35 }, { ...part('r2', 'P-1146', 100, 600, 1000, 0), z: 35 }, part('h', 'P-1037', 100, 1040, 1000, 0)] });
  const build = (m: CustomModel) => {
    registerCustomModels([m], mats);
    const ID = m.id as FenceModelId;
    return withRunPosts(createProject('t', [createFence({ modelId: ID, widthMm: 1000, heightMm: 1100 }), createFence({ modelId: ID, widthMm: 1700, heightMm: 1100, stair: { riseMm: -1020, steps: 6, group: 'g' } })]), mats);
  };
  const slatsOf = (p: ReturnType<typeof build>, i: number) => (p.items[i] as unknown as { params: { slats?: { cornerBends?: [number, number] } } }).params.slats;

  it('ravno polje i stepenište: promena nagiba se beleži na oba kraja spoja', () => {
    const p = build(mk('cm_bend_a'));
    expect(slatsOf(p, 0)?.cornerBends?.[1]).toBeGreaterThan(20);
    expect(slatsOf(p, 1)?.cornerBends?.[0]).toBeGreaterThan(20);
  });
  it('prelaz: cevi završavaju na priključku zgloba ili tangenti kolena, a spoj se računa jednom', () => {
    const p = build(mk('cm_bend_b'));
    const flat = customPartsFor('cm_bend_b' as FenceModelId, 1000, 1100, '#999', slatsOf(p, 0) as never);
    const balls = flat.filter((r) => r.part.hw?.kind === 'cornerBall');
    expect(balls.length).toBeGreaterThanOrEqual(3); // dve prečke i rukohvat
    const r1 = flat.find((r) => r.part.id === 'r1')!;
    expect(r1.part.x + r1.part.lengthMm).toBeCloseTo(1000 - (16 * 0.65 + 8), 1);
    const q = build(mk('cm_bend_c', 'elbow'));
    const e = customPartsFor('cm_bend_c' as FenceModelId, 1000, 1100, '#999', slatsOf(q, 0) as never).find((r) => r.part.id === 'r1')!;
    expect(e.part.x + e.part.lengthMm).toBeCloseTo(1000 - 40, 1);
    const st = customPartsFor('cm_bend_c' as FenceModelId, 1700, 1100, '#999', slatsOf(q, 1) as never);
    expect(st.some((r) => r.part.hw?.kind === 'cornerArm')).toBe(false);
    expect(e.part.lengthMm).toBeGreaterThan(0);
  });
});

import { endOverhangOf, trimFreeEnds } from '../domain/models/terraceHardware';
import { customEndOverhang } from '../domain/models/customRegistry';
import { useAppStore } from '../store/useAppStore';

describe('kraj prečki i rukohvata uz krajnji stub; platno pod uglom', () => {
  const base = (): CustomModel => ({ ...model(), widthMm: 1200, parts: [...model().parts.filter((p) => p.id !== 'h'), part('r1', 'P-1146', 60, 300, 1080, 0), part('h', 'P-1037', 60, 1040, 1080, 0)] });
  it('rastojanje od krajnjeg stuba do kraja cevi: sa crteža i zadato', () => {
    const m = base();
    expect(endOverhangOf(m, mats)).toEqual({ left: 40, right: 40 });
    const t = trimFreeEnds(m, [false, true], 120, mats);
    const r = t.parts.find((p) => p.id === 'r1')!; const h = t.parts.find((p) => p.id === 'h')!;
    expect(r.x).toBe(60); // levi kraj nije slobodan
    expect(r.x + r.lengthMm).toBeCloseTo(1100 + 120, 1); // desni stub na 1100
    expect(h.x + h.lengthMm).toBeCloseTo(1100 + 120, 1);
    expect(trimFreeEnds(m, undefined, 120, mats)).toBe(m);
  });
  it('stepenište na kraju: slobodan je samo spoljni kraj', () => {
    const m = { ...base(), id: 'cm_free' };
    registerCustomModels([m], mats);
    const ID = 'cm_free' as FenceModelId;
    const p = withRunPosts(createProject('t', [createFence({ modelId: ID, widthMm: 1000, heightMm: 1100 }), createFence({ modelId: ID, widthMm: 1700, heightMm: 1100, stair: { riseMm: -1020, steps: 6, group: 'g' } })]), mats);
    const f = (i: number) => (p.items[i] as unknown as { params: { slats?: { freeEnds?: [boolean, boolean] } } }).params.slats?.freeEnds;
    expect(f(0)).toBeUndefined();
    expect(f(1)).toEqual([false, true]);
  });
  it.each([1020, -1020])('prepust polja prati stvarni raspored stubova na stepeništu %s, umesto početnih 100 mm iz modela', (riseMm) => {
    const m = { ...model(), id: 'cm_actual_overhang' }; registerCustomModels([m], mats);
    expect(customEndOverhang(m.id)).toEqual({ left: 100, right: 100 });
    const ID = m.id as FenceModelId;
    const p = withRunPosts(createProject('Prepust', [createFence({ modelId: ID, widthMm: 1000, heightMm: 1100 }),
      createFence({ modelId: ID, widthMm: 1700, heightMm: 1100, stair: { riseMm, steps: 6, group: 's' } })]), mats);
    const item = p.items[1]; if (item.kind !== 'fence') throw new Error('Očekivana ograda');
    const slats = item.params.slats!;
    const measured = customEndOverhang(ID, 1700, 1100, slats)!;
    const geometry = customPartsFor(ID, 1700, 1100, '#999', slats);
    expect(measured.right).toBeCloseTo(endOverhangOf({ ...m, parts: geometry.map((r) => r.part) }, mats)!.right, 5);
    expect(measured.right).not.toBe(100);
    const changed = { ...slats, endOverhangMm: 100 };
    expect(customEndOverhang(ID, 1700, 1100, changed)!.right).toBe(100);
    const parts = customPartsFor(ID, 1700, 1100, '#999', changed);
    const rail = parts.find((r) => r.part.id === 'h')!.part;
    expect(rail.x + rail.lengthMm - Math.max(...slats.postXs!)).toBeCloseTo(100, 5);
  });
  it('„Platno pod uglom“: dodaje se pod uglom i ne spaja se u liniju', () => {
    const m = { ...base(), id: 'cm_angled' };
    registerCustomModels([m], mats);
    const ID = 'cm_angled' as FenceModelId;
    const st = useAppStore.getState();
    const pid = st.newProject({ name: 'ugao', modelId: ID });
    st.openProject(pid);
    st.addElement({ kind: 'fence', modelId: ID });
    st.addElement({ kind: 'fence', modelId: ID, turnDeg: 90 });
    const p = useAppStore.getState().projects.find((x) => x.id === pid)!;
    expect(p.items.length).toBeGreaterThanOrEqual(2);
    const last = p.items.length - 1;
    expect(p.posts[last].turnDeg).toBe(90);
  });
});
