import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { isStair, slopeOf, stairProfile, stairSteps, stairSummary } from '../domain/geometry/stair';
import { createFence, createProject } from '../domain/models/factories';
import type { FenceSection } from '../domain/models/types';
import { rail04Runs, buildRail04Sheet } from '../domain/pricing/railSpec';
import { buildCutList } from '../domain/pricing/production';
import { specVars } from '../domain/models/spec';
import { makeStair, removeStair, setStairGroup, stairOuterRunMm, clearStair } from '../domain/geometry/stairOps';
import { stairGroupAt } from '../domain/geometry/stair';

const terrace = (extra: Partial<FenceSection> = {}) => createFence({ widthMm: 2000, modelId: 'rail_inox', heightMm: 1000, ...extra });

describe('stepenište', () => {
  it('samo ograda za terasu sa visinskom razlikom je stepenište', () => {
    expect(isStair(terrace({ stair: { riseMm: 1020 } }))).toBe(true);
    expect(isStair(terrace({ stair: { riseMm: 0 } }))).toBe(false);
    expect(isStair(createFence({ widthMm: 2000, modelId: 'h_narrow', stair: { riseMm: 1020 } }))).toBe(false);
    expect(isStair(terrace())).toBe(false);
  });

  it('broj stepenika: iz visinske razlike (oko 170 mm) ili zadat', () => {
    expect(stairSteps(terrace({ stair: { riseMm: 1020 } }))).toBe(6);
    expect(stairSteps(terrace({ stair: { riseMm: -1020 } }))).toBe(6);
    expect(stairSteps(terrace({ stair: { riseMm: 1020, steps: 7 } }))).toBe(7);
    expect(stairSteps(terrace({ stair: { riseMm: 60 } }))).toBe(1);
  });

  it('nagib: tangens, ugao i kosa dužina', () => {
    const s = slopeOf(2000, 2000);
    expect(s.deg).toBeCloseTo(45, 6);
    expect(s.factor).toBeCloseTo(Math.SQRT2, 9);
    expect(slopeOf(2000, -1000).tan).toBeCloseTo(-0.5, 9);
  });

  it('nivoi: terasa, stepenište naniže i deo na tlu; najniži nivo je 0', () => {
    const p = createProject('t', [terrace(), terrace({ stair: { riseMm: -1020 } }), terrace()]);
    const l = computeLayout(p);
    expect(l.hasLevels).toBe(true);
    expect(l.items.map((i) => [i.floorStart, i.floorEnd])).toEqual([[1020, 1020], [1020, 0], [0, 0]]);
    expect(l.posts.map((lp) => lp.floorMm)).toEqual([1020, 1020, 0, 0]);
    expect(l.maxTopMm).toBeGreaterThanOrEqual(1020 + 1000);
    expect(l.maxHeightMm).toBeLessThan(l.maxTopMm);
  });

  it('bez stepeništa sve je na nivou 0', () => {
    const l = computeLayout(createProject('t', [terrace(), terrace()]));
    expect(l.hasLevels).toBe(false);
    expect(l.posts.every((lp) => lp.floorMm === 0)).toBe(true);
    expect(l.maxTopMm).toBe(l.maxHeightMm);
  });

  it('profil stepenika: ivice leže na liniji nagiba, stepenici su ispod nje', () => {
    for (const [f0, f1] of [[0, 1020], [1020, 0]]) {
      const pts = stairProfile(0, 1800, f0, f1, 6);
      expect(pts[0]).toEqual([0, f0]);
      expect(pts[pts.length - 1][0]).toBeCloseTo(1800, 9);
      expect(pts[pts.length - 1][1]).toBeCloseTo(f1, 9);
      for (const [x, f] of pts) expect(f).toBeLessThanOrEqual(f0 + ((f1 - f0) * x) / 1800 + 1e-9);
    }
  });

  it('opis stepeništa', () => {
    expect(stairSummary(terrace({ stair: { riseMm: 1020 } }), 1700)).toBe('↑ 1.020 mm · 6 stepenika · 31°');
  });

  it('crne prečke: stepenište je zaseban niz po kosoj dužini, sa kosim rezom', () => {
    const p = createProject('t', [createFence({ widthMm: 2000, modelId: 'rail_black', heightMm: 1000 }), createFence({ widthMm: 2000, modelId: 'rail_black', heightMm: 1000, stair: { riseMm: -1000 } }), createFence({ widthMm: 2000, modelId: 'rail_black', heightMm: 1000 })]);
    const runs = rail04Runs(p);
    expect(runs).toHaveLength(3);
    expect(runs[1].slopeDeg).toBe(Math.round((Math.atan(0.5) * 180) / Math.PI));
    expect(runs[1].axisTotalMm).toBeCloseTo(2000 * Math.sqrt(1.25), 3);
    const sheet = buildRail04Sheet(p)!;
    expect(sheet.cuts.some((c) => c.cut.includes('pod uglom 27°'))).toBe(true);
  });

  it('specifikacija: delovi duž polja po kosoj dužini, površina stakla ostaje horizontalna × vertikalna', () => {
    const base = { modelId: 'glass_inox' as const, widthMm: 1800, heightMm: 1000, axisMm: 1900, params: { barSizeMm: 0, gapMm: 0, frameMm: 0 } };
    const flat = specVars(base);
    const sloped = specVars({ ...base, slopeFactor: 1.25 });
    expect(sloped.W).toBeCloseTo(flat.W * 1.25, 6);
    expect(sloped.A).toBeCloseTo(flat.A * 1.25, 6);
    expect(sloped.H).toBe(flat.H);
    expect(sloped.GLASS).toBeCloseTo(flat.GLASS, 3);
    expect(sloped.AREA).toBeCloseTo(flat.AREA, 9);
  });

  it('krojna lista: staklo stepeništa je paralelogram sa nagibom', () => {
    const p = createProject('t', [createFence({ widthMm: 1800, modelId: 'glass_inox', heightMm: 1000, stair: { riseMm: 1020 } })]);
    const glass = buildCutList(p).find((r) => r.glass);
    expect(glass?.note).toMatch(/paralelogram/);
  });

  it('15 stepenika: stub na svaki treći stepenik, po sredini gazišta; prvi i poslednji stub su na krajevima', () => {
    let p = createProject('t', [terrace({ widthMm: 4200 })]);
    p = makeStair(p, p.items[0].id, 2550); // 2550 / 170 = 15 stepenika
    const g = stairGroupAt(p.items, 0)!;
    expect(g.steps).toBe(15);
    expect(p.items).toHaveLength(5); // 4 stuba između + 2 krajnja
    expect(p.posts).toHaveLength(6);
    const l = computeLayout(p);
    const tread = g.runMm / 15;
    const x0 = l.items[0].axisStart;
    // stubovi između krajeva: sredina 3., 6., 9. i 12. stepenika
    [3, 6, 9, 12].forEach((k, j) => expect(l.posts[j + 1].x - x0).toBeCloseTo((k - 0.5) * tread, 0));
    // na sredini gazišta: stub stoji na gazištu, a ne na ivici
    for (const k of [1, 2, 3, 4]) {
      const lp = l.posts[k];
      expect(lp.lineMm - lp.floorMm).toBeGreaterThanOrEqual(0);
    }
    expect(l.items.reduce((s2, i) => s2 + (i.axisEnd - i.axisStart), 0)).toBe(g.runMm);
    expect(l.items[0].floorEnd - l.items[0].floorStart).toBeGreaterThan(0);
    // nagib je isti u svim poljima
    const slopes = l.items.map((i) => (i.floorEnd - i.floorStart) / (i.axisEnd - i.axisStart));
    expect(Math.max(...slopes) - Math.min(...slopes)).toBeLessThan(1e-3);
    expect(l.items[4].floorEnd - l.items[0].floorStart).toBe(2550);
  });

  it('stubovi stoje na gazištu: unutrašnji stub je duži za razliku između linije rukohvata i gazišta, a krajnji nije', () => {
    let p = createProject('t', [terrace({ widthMm: 4200 })]);
    p = makeStair(p, p.items[0].id, 2550);
    const l = computeLayout(p);
    const first = l.posts[0];
    const last = l.posts[l.posts.length - 1];
    expect(first.lengthMm).toBe(first.post.heightMm);
    expect(last.lengthMm).toBe(last.post.heightMm);
    for (const lp of l.posts.slice(1, -1)) {
      expect(lp.lengthMm).toBeGreaterThanOrEqual(lp.post.heightMm);
      expect(lp.lengthMm).toBeLessThan(lp.post.heightMm + 2550 / 15 + 1);
    }
  });

  it('broj stubova se ručno menja; ostaje zadat i kad se menja dužina', () => {
    let p = createProject('t', [terrace({ widthMm: 4000 })]);
    p = makeStair(p, p.items[0].id, 1020);
    const id = p.items[0].id;
    p = setStairGroup(p, id, { fields: 2 });
    expect(p.items).toHaveLength(2);
    expect(p.posts).toHaveLength(3);
    p = setStairGroup(p, id, { outerRunMm: 6000 });
    expect(p.items).toHaveLength(2); // ručno zadat broj se ne menja
    expect(Math.round(stairOuterRunMm(p, id))).toBe(6000);
    // ukupna visinska razlika i broj stepenika ostaju zbir polja
    p = setStairGroup(p, id, { riseMm: 1200, steps: 8 });
    const g = stairGroupAt(p.items, 0)!;
    expect([g.riseMm, g.steps]).toEqual([1200, 8]);
  });

  it('automatski broj stubova prati broj stepenika (svaki treći), a ne dužinu', () => {
    let p = createProject('t', [terrace({ widthMm: 2000 })]);
    p = makeStair(p, p.items[0].id, 1020); // 6 stepenika
    expect(p.items).toHaveLength(2);
    p = setStairGroup(p, p.items[0].id, { outerRunMm: 6000 });
    expect(p.items).toHaveLength(2);
    p = setStairGroup(p, p.items[0].id, { steps: 12 });
    expect(p.items).toHaveLength(4);
    p = setStairGroup(p, p.items[0].id, { steps: 3 });
    expect(p.items).toHaveLength(1);
  });

  it('brisanje i isključivanje stepeništa', () => {
    let p = createProject('t', [terrace(), terrace({ widthMm: 3000 }), terrace()]);
    p = makeStair(p, p.items[1].id, -1020);
    const n = p.items.length;
    expect(n).toBeGreaterThan(3);
    const flat = clearStair(p, p.items[1].id);
    expect(flat.items).toHaveLength(n);
    expect(flat.items.some((i) => isStair(i))).toBe(false);
    const gone = removeStair(p, p.items[1].id);
    expect(gone.items).toHaveLength(2);
    expect(gone.posts).toHaveLength(3);
  });
});
