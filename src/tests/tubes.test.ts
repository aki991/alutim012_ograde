import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { computeInfill } from '../domain/geometry/infill';
import { computeLayout } from '../domain/geometry/layout';
import { resetTubesParams, setTubesParams, updateItemParams } from '../domain/geometry/operations';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { FENCE_MODELS } from '../domain/models/catalog';
import { TUBES_DEFAULTS, tubeLengthMm, tubesDims } from '../domain/models/tubes';
import type { FenceSection, Gate } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildCutList } from '../domain/pricing/production';
import { migrateProject } from '../domain/validation/project';

const d = FENCE_MODELS.h_narrow.defaults;
const geo = (w: number, h: number, f = d.frameMm, bar = d.barSizeMm, gap = d.gapMm) => computeInfill('h_narrow', w, h, f, bar, gap);

describe('uske horizontalne letvice: kvadratne cevi 20×20 u U profilima 25×20 (uzorak 220 × 312)', () => {
  it('početne mere: cev 20, razmak 6, U profil 20 × 25 × 1,35', () => {
    expect(d).toMatchObject({ barSizeMm: 20, gapMm: 6, frameMm: 20 });
    expect(TUBES_DEFAULTS).toMatchObject({ tubeDepthMm: 20, tubeWallMm: 1, uDepthMm: 25, uWallMm: 1.35 });
  });

  it('uzorak 220 × 312: 12 cevi, korak 26 mm, po 3 mm do ivice, cevi između U profila', () => {
    const g = geo(220, 312);
    const tubes = g.bars.filter((b) => b.tone === 'main');
    expect(tubes).toHaveLength(12);
    // od poda naviše: prva cev počinje 3 mm iznad poda (y od vrha = 312 − 3 − 20)
    const fromGround = tubes.map((b) => Math.round(312 - (b.y + b.h))).sort((a, b) => a - b);
    expect(fromGround[0]).toBe(3);
    expect(fromGround[1] - fromGround[0]).toBe(26);
    expect(fromGround[11]).toBe(289);
    // cevi počinju uz U profil i idu do drugog (U profili su samo sa strane)
    expect(g.frame).toBe(20);
    expect(tubes[0].x).toBe(20);
    expect(tubes[0].w).toBe(180);
    expect(g.inner).toMatchObject({ x: 20, y: 0, w: 180, h: 312 });
  });

  it('veća visina daje više cevi istih mera; promena mera menja broj i razmak', () => {
    expect(geo(1000, 1000).bars).toHaveLength(Math.floor(1000 / 26));
    expect(geo(1000, 2000).bars.length).toBeGreaterThan(geo(1000, 1000).bars.length * 1.9);
    expect(geo(1000, 312, 20, 25, 10).bars).toHaveLength(Math.floor(312 / 35));
    expect(geo(1000, 312, 20, 20, 6).bars.every((b) => b.h === 20)).toBe(true);
  });

  it('dužina cevi: svetli otvor − 2 × (zid U + zazor); menja se sa merama U profila', () => {
    expect(tubeLengthMm(220, undefined)).toBeCloseTo(216.3, 6);
    expect(tubeLengthMm(220, { hn: { uWallMm: 2, endClearMm: 1 } })).toBeCloseTo(214, 6);
  });

  it('specifikacija: 2 U profila dužine visine polja i N cevi; sastavnica i krojna lista', () => {
    const p = createProject('t', [createFence({ modelId: 'h_narrow', widthMm: 2000, heightMm: 1600 })]);
    const f = p.items[0] as FenceSection;
    const cuts = buildCutList(p);
    const u = cuts.find((c) => c.part.startsWith('U profil'))!;
    expect(u).toMatchObject({ qty: 2, lengthMm: 1600 });
    const tube = cuts.find((c) => c.part.startsWith('Kvadratna cev'))!;
    const n = geo(2000, 1600).bars.length;
    expect(tube.qty).toBe(n);
    const clear = computeLayout(p).items[0].clearWidth;
    const bom = buildBom(p, SEED_MATERIALS);
    expect(bom.find((l) => l.materialId === 'mat_u_25x20')?.geometricQty).toBeCloseTo(3.2, 6);
    expect(bom.find((l) => l.materialId === 'mat_kv_20x20')?.geometricQty).toBeCloseTo((n * tubeLengthMm(clear, undefined)) / 1000, 6);
    expect(tube.lengthMm).toBe(Math.round(tubeLengthMm(clear, undefined)));
    expect(f.params.barSizeMm).toBe(20);
  });

  it('dimenzije cevi i U profila važe za sva polja i kapije modela, a ne dira druge modele', () => {
    let p = createProject('t', [createFence({ modelId: 'h_narrow' }), createFence({ modelId: 'h_boards' }), createGate('single', { infillModelId: 'h_narrow' })]);
    p = setTubesParams(p, { hn: { uDepthMm: 30, tubeWallMm: 1.5 } });
    expect(tubesDims((p.items[0] as FenceSection).params)).toMatchObject({ uDepthMm: 30, tubeWallMm: 1.5, tubeDepthMm: 20 });
    expect(tubesDims((p.items[2] as Gate).params)).toMatchObject({ uDepthMm: 30 });
    expect((p.items[1] as FenceSection).params.hn).toBeUndefined();
    // visina cevi, razmak i širina U profila su po elementu
    p = updateItemParams(p, p.items[0].id, { barSizeMm: 25, gapMm: 10, frameMm: 25 });
    expect((p.items[2] as Gate).params.barSizeMm).toBe(20);
    p = resetTubesParams(p);
    expect((p.items[0] as FenceSection).params).toMatchObject({ barSizeMm: 20, gapMm: 6, frameMm: 20 });
    expect((p.items[0] as FenceSection).params.hn).toBeUndefined();
  });

  it('stari projekti sa letvicama 80 / 30 / 40 prelaze na cevi 20 / 6 / U 20', () => {
    const old = createFence({ modelId: 'h_narrow', params: { barSizeMm: 80, gapMm: 30, frameMm: 40 } });
    const m = migrateProject(createProject('t', [old]));
    expect((m.items[0] as FenceSection).params).toMatchObject({ barSizeMm: 20, gapMm: 6, frameMm: 20 });
  });
});
