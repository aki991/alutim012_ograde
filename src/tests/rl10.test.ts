import { describe, expect, it } from 'vitest';
import { computeInfill } from '../domain/geometry/infill';
import { setRl10Params, updateItemParams } from '../domain/geometry/operations';
import { SEED_MATERIALS } from '../data/materials';
import { createFence, createProject } from '../domain/models/factories';
import { RL10_DEFAULTS, isRl10EndPost, isRl10Post, rl10Geometry, rl10PostInfo } from '../domain/models/rl10';
import { computeLayout } from '../domain/geometry/layout';
import { makeStair } from '../domain/geometry/stairOps';
import { buildRl10Sheet, rl10Runs } from '../domain/pricing/rl10Spec';
import type { FenceSection } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildCuttingList } from '../domain/pricing/cutting';
import { migrateProject } from '../domain/validation/project';

const rl = (extra: Partial<FenceSection> = {}) => createFence({ widthMm: 1500, modelId: 'rail_inox', heightMm: 1000, ...extra });

describe('RL10 (Inox — horizontalne prečke)', () => {
  it('podrazumevano: rukohvat Ø50, stub Ø40, 4 prečke Ø16 ravnomerno između najniže i najviše', () => {
    const f = rl();
    const g = rl10Geometry(f.heightMm, f.params);
    expect(g.dims.railDiaMm).toBe(50);
    expect(g.dims.postDiaMm).toBe(40);
    expect(g.rodDiaMm).toBe(16);
    expect(g.rodHeightsMm).toHaveLength(4);
    expect(g.rodHeightsMm[0]).toBe(RL10_DEFAULTS.rodBottomMm);
    expect(g.rodHeightsMm[3]).toBe(1000 - 50 - RL10_DEFAULTS.rodTopMm);
    const steps = g.rodHeightsMm.slice(1).map((h, i) => h - g.rodHeightsMm[i]);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1);
    expect(g.railAxisMm).toBe(975);
    expect(g.postTopMm).toBe(1000 - 50 - RL10_DEFAULTS.saddleMm);
  });

  it('broj prečki i mere delova se menjaju (na celoj ogradi)', () => {
    let p = createProject('t', [rl(), rl()]);
    p = updateItemParams(p, p.items[0].id, { barCount: 6 });
    p = setRl10Params(p, { rl10: { railDiaMm: 42, rodBottomMm: 100 }, barSizeMm: 12 });
    for (const it of p.items as FenceSection[]) {
      const g = rl10Geometry(it.heightMm, it.params);
      expect(g.rodHeightsMm).toHaveLength(6);
      expect(g.rodHeightsMm[0]).toBe(100);
      expect(g.dims.railDiaMm).toBe(42);
      expect(g.rodDiaMm).toBe(12);
    }
    // ispuna (sastavnica, šeme) prati broj prečki RL10
    const f = p.items[0] as FenceSection;
    const geo = computeInfill(f.modelId, 1400, f.heightMm, 0, f.params.barSizeMm, f.params.gapMm, f.params.barCount);
    expect(geo.bars.filter((b) => b.tone === 'main')).toHaveLength(6);
    expect(geo.bars.filter((b) => b.tone === 'rail')).toHaveLength(1);
  });

  it('stubovi uz RL10 i krajnji stubovi niza', () => {
    const p = createProject('t', [rl({ widthMm: 1000 }), rl({ widthMm: 1000 })]);
    expect([0, 1, 2].map((i) => isRl10Post(p.items, i))).toEqual([true, true, true]);
    expect(isRl10EndPost(p.items, 0)).toEqual({ left: true, right: false });
    expect(isRl10EndPost(p.items, 1)).toEqual({ left: false, right: false });
    expect(isRl10EndPost(p.items, 2)).toEqual({ left: false, right: true });
  });

  it('sastavnica RL10: rukohvat i prečke po nizu, stubovi P-1054 sa delovima, završeci samo na slobodnim krajevima', () => {
    const p = createProject('t', [rl({ widthMm: 1000 }), rl({ widthMm: 1000 })]);
    const sheet = buildRl10Sheet(p)!;
    const q = sheet.quantities;
    expect(sheet.runs).toHaveLength(1);
    expect(q.posts).toBe(3);
    expect(q.saddlesFixed).toBe(3);
    expect(q.saddlesAdjustable).toBe(0);
    expect(q.holders).toBe(12);
    expect(q.railCaps).toBe(2);
    expect(q.rodCaps).toBe(8);
    expect(q.jointsRail).toBe(0);
    // rukohvat: 2 polja po 1000 (osa–osa) + 2 × prepust
    expect(q.railLens).toEqual([2000 - 0 + 2 * RL10_DEFAULTS.railOverhangMm - 0]);
    expect(sheet.bom.find((r) => r.code === 'AK-5011Y')?.qty).toBe('12 kom');
    expect(sheet.bom.find((r) => r.code === 'AK-5027K')?.qty).toBe('9 kom');
    expect(sheet.cuts.some((c) => c.mark.startsWith('S-') && c.profile === 'P-1054')).toBe(true);
  });

  it('stepenište: zglob rukohvata AK-5020K i zglobovi prečki AK-5022Y na spoju, podesiva veza AK-5001 na stubovima stepeništa, cevi ravno 90°', () => {
    let p = createProject('t', [rl({ widthMm: 1500 }), rl({ widthMm: 3000 })]);
    p = makeStair(p, p.items[1].id, -1020);
    const l = computeLayout(p);
    const sheet = buildRl10Sheet(p)!;
    const q = sheet.quantities;
    // ravni deo + stepenište (zglob na prelazu); stepenište se završava slobodnim krajem
    expect(sheet.runs.length).toBe(2);
    expect(sheet.runs[0].rightEnd).toBe('joint');
    expect(sheet.runs[1].leftEnd).toBe('joint');
    expect(sheet.runs[1].slopeDeg).toBeGreaterThan(0);
    expect(q.jointsRail).toBe(1);
    expect(q.jointsRod).toBe(4);
    expect(q.saddlesAdjustable).toBeGreaterThanOrEqual(1);
    expect(sheet.bom.some((r) => r.code === 'AK-5020K')).toBe(true);
    expect(sheet.bom.some((r) => r.code === 'AK-5022Y')).toBe(true);
    expect(sheet.bom.some((r) => r.code === 'AK-5001')).toBe(true);
    // na prelazu stub nosi zglob: nagibi levo i desno se razlikuju
    const junction = p.posts.findIndex((_, i) => rl10PostInfo(p.items, l, i).joint !== null);
    expect(junction).toBe(1);
    // rukohvat ravnog dela je kraći za pola zgloba
    const flat = rl10Runs(p)[0];
    expect(flat.railLenMm).toBe(Math.round(flat.axisMm + RL10_DEFAULTS.railOverhangMm - RL10_DEFAULTS.railJointMm / 2));
    expect(sheet.cuts.some((c) => c.part === 'Rukohvat Ø50' && c.cut.includes('daje zglob'))).toBe(true);
  });

  it('stub uz zglob je pomeren 125 mm ka ravnom delu i ne nosi zglob; ostali stubovi se ne pomeraju', () => {
    let p = createProject('t', [rl({ widthMm: 1500 }), rl({ widthMm: 3000 })]);
    p = makeStair(p, p.items[1].id, -1020);
    const l = computeLayout(p);
    // ravni deo levo, stepenište desno: stub na spoju (indeks 1) ide ulevo
    expect(l.posts[1].shiftMm).toBe(-RL10_DEFAULTS.jointPostOffsetMm);
    expect(l.posts.filter((_, i) => i !== 1).every((lp) => lp.shiftMm === 0)).toBe(true);
    // stub na spoju nosi samo ravni deo: fiksna veza AK-5039N, a ne podesiva
    const info = rl10PostInfo(p.items, l, 1);
    expect(info.joint).not.toBeNull();
    expect(info.adjustable).toBe(false);
    expect(info.tilt).toBe(0);
    // stepenište pa ravan deo: stub se pomera udesno (ka ravnom delu)
    let q = createProject('t', [rl({ widthMm: 3000 }), rl({ widthMm: 1500 })]);
    q = makeStair(q, q.items[0].id, 1020);
    const lq = computeLayout(q);
    const j = lq.posts.findIndex((_, i) => rl10PostInfo(q.items, lq, i).joint !== null);
    expect(lq.posts[j].shiftMm).toBe(RL10_DEFAULTS.jointPostOffsetMm);
  });

  it('početna veličina RL10 je 1000 × 1000 mm', async () => {
    const { FENCE_MODELS } = await import('../domain/models/catalog');
    expect(FENCE_MODELS.rail_inox.defaultSize).toEqual({ widthMm: 1000, heightMm: 1000 });
  });

  it('BOM: količine iz sastavnice RL10', () => {
    const p = createProject('t', [rl({ widthMm: 1000 }), rl({ widthMm: 1000 })]);
    const bom = buildBom(p, SEED_MATERIALS);
    const qty = (id: string) => bom.find((l) => l.materialId === id)?.geometricQty ?? 0;
    expect(qty('mat_bts_p1033')).toBeCloseTo(2.12, 2);
    expect(qty('mat_bts_ak5039n')).toBe(3);
    expect(qty('mat_bts_ak5036x')).toBe(3);
    expect(qty('mat_bts_ak5011y')).toBe(12);
    expect(qty('mat_bts_ak5009')).toBe(2);
    expect(qty('mat_bts_ak5012a')).toBe(8);
    const cut = buildCuttingList(p, undefined, SEED_MATERIALS);
    expect(cut.profiles.some((x) => x.profile.includes('Stub — cev Ø40'))).toBe(true);
    expect(cut.profiles.some((x) => x.profile.includes('Rukohvat'))).toBe(true);
  });

  it('stari projekti: prečka Ø30 postaje Ø16 sa 4 prečke', () => {
    const p = createProject('t', [createFence({ widthMm: 1500, modelId: 'rail_inox', params: { barSizeMm: 30, gapMm: 400, frameMm: 0, barCount: undefined } })]);
    const m = migrateProject(p);
    const f = m.items[0] as FenceSection;
    expect([f.params.barSizeMm, f.params.barCount]).toEqual([16, 4]);
  });
});
