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
import { useAppStore } from '../store/useAppStore';

const d = FENCE_MODELS.h_narrow.defaults;
const geo = (w: number, h: number, f = d.frameMm, bar = d.barSizeMm, gap = d.gapMm) => computeInfill('h_narrow', w, h, f, bar, gap);

describe('uske horizontalne letvice: kvadratne cevi 30×20 u U profilima 20×20 (početno 400 × 600)', () => {
  it('početne mere: cev 30, razmak 15, U profil 20 × 20 × 1,35; polje 400 × 600 sa U profilima, kapija 1400', () => {
    expect(d).toMatchObject({ barSizeMm: 30, gapMm: 15, frameMm: 20 });
    expect(TUBES_DEFAULTS).toMatchObject({ tubeDepthMm: 20, tubeWallMm: 1, uDepthMm: 20, uWallMm: 1.35 });
    expect(FENCE_MODELS.h_narrow.defaultSize).toEqual({ widthMm: 400, heightMm: 600, clearWidth: true });
    expect(FENCE_MODELS.h_narrow.defaultGateHeightMm).toBe(1400);
    expect(FENCE_MODELS.h_narrow.postExtraMm).toBe(0);
  });

  it('polje 400 × 600: 13 cevi, korak 45 mm, po 7,5 mm do ivice, cevi između U profila', () => {
    const g = geo(400, 600);
    const tubes = g.bars.filter((b) => b.tone === 'main');
    expect(tubes).toHaveLength(13);
    // od poda naviše: prva cev počinje pola razmaka iznad poda
    const fromGround = tubes.map((b) => 600 - (b.y + b.h)).sort((a, b) => a - b);
    expect(fromGround[0]).toBeCloseTo(7.5, 6);
    expect(fromGround[1] - fromGround[0]).toBeCloseTo(45, 6);
    expect(tubes.every((b) => b.h === 30)).toBe(true);
    // cevi počinju uz U profil i idu do drugog (U profili su samo sa strane)
    expect(g.frame).toBe(20);
    expect(tubes[0].x).toBe(20);
    expect(tubes[0].w).toBe(360);
    expect(g.inner).toMatchObject({ x: 20, y: 0, w: 360, h: 600 });
  });

  it('veća visina daje više cevi istih mera; promena mera menja broj i razmak', () => {
    expect(geo(1000, 1000).bars).toHaveLength(Math.floor(1000 / 45));
    expect(geo(1000, 2000).bars.length).toBeGreaterThan(geo(1000, 1000).bars.length * 1.9);
    expect(geo(1000, 600, 20, 25, 10).bars).toHaveLength(Math.floor(600 / 35));
    expect(geo(1000, 600, 20, 20, 6).bars.every((b) => b.h === 20)).toBe(true);
  });

  it('dužina cevi: svetli otvor − 2 × (zid U + zazor); menja se sa merama U profila', () => {
    expect(tubeLengthMm(400, undefined)).toBeCloseTo(396.3, 6);
    expect(tubeLengthMm(400, { hn: { uWallMm: 2, endClearMm: 1 } })).toBeCloseTo(394, 6);
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
    expect(bom.find((l) => l.materialId === 'mat_u_20x20')?.geometricQty).toBeCloseTo(3.2, 6);
    expect(bom.find((l) => l.materialId === 'mat_kv_30x20')?.geometricQty).toBeCloseTo((n * tubeLengthMm(clear, undefined)) / 1000, 6);
    expect(tube.lengthMm).toBe(Math.round(tubeLengthMm(clear, undefined)));
    expect(f.params.barSizeMm).toBe(30);
  });

  it('dimenzije cevi i U profila važe za sva polja i kapije modela, a ne dira druge modele', () => {
    let p = createProject('t', [createFence({ modelId: 'h_narrow' }), createFence({ modelId: 'h_boards' }), createGate('single', { infillModelId: 'h_narrow' })]);
    p = setTubesParams(p, { hn: { uDepthMm: 30, tubeWallMm: 1.5 } });
    expect(tubesDims((p.items[0] as FenceSection).params)).toMatchObject({ uDepthMm: 30, tubeWallMm: 1.5, tubeDepthMm: 20 });
    expect(tubesDims((p.items[2] as Gate).params)).toMatchObject({ uDepthMm: 30 });
    expect((p.items[1] as FenceSection).params.hn).toBeUndefined();
    // visina cevi, razmak i širina U profila su po elementu
    p = updateItemParams(p, p.items[0].id, { barSizeMm: 25, gapMm: 10, frameMm: 25 });
    expect((p.items[2] as Gate).params.barSizeMm).toBe(30);
    p = resetTubesParams(p);
    expect((p.items[0] as FenceSection).params).toMatchObject({ barSizeMm: 30, gapMm: 15, frameMm: 20 });
    expect((p.items[0] as FenceSection).params.hn).toBeUndefined();
  });

  it('stari projekti sa letvicama 80 / 30 / 40 (i prelazne 20 / 6 / 20) prelaze na cevi 30 / 15 / U 20', () => {
    for (const params of [{ barSizeMm: 80, gapMm: 30, frameMm: 40 }, { barSizeMm: 20, gapMm: 6, frameMm: 20 }]) {
      const old = createFence({ modelId: 'h_narrow', params });
      const m = migrateProject(createProject('t', [old]));
      expect((m.items[0] as FenceSection).params).toMatchObject({ barSizeMm: 30, gapMm: 15, frameMm: 20 });
      expect((m.items[0] as FenceSection).materialId).toBe('mat_kv_30x20');
    }
  });
});

describe('uske horizontalne letvice: dodavanje u prazan projekat', () => {
  it('ograda 600 mm visine sa svetlom širinom 400 mm, kapija 1400 mm, stubovi iste visine kao element', () => {
    const p = createProject('t');
    useAppStore.setState((s) => ({ ready: true, projects: [p], editor: { ...s.editor, projectId: p.id, activeModelId: 'h_narrow' } }));
    const st = useAppStore.getState();
    st.addElement({ kind: 'fence', modelId: 'h_narrow' });
    let cur = useAppStore.getState().projects[0];
    const l = computeLayout(cur);
    expect(cur.items[0].heightMm).toBe(600);
    expect(Math.round(l.items[0].clearWidth)).toBe(400);
    expect(cur.posts.map((x) => x.heightMm)).toEqual([600, 600]);
    useAppStore.getState().addElement({ kind: 'gate', gateType: 'single', modelId: 'h_narrow' });
    cur = useAppStore.getState().projects[0];
    expect(cur.items[1].heightMm).toBe(1400);
    expect(cur.posts.map((x) => x.heightMm)).toEqual([600, 1400, 1400]);
  });
});
