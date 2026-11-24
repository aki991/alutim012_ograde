import { afterEach, describe, expect, it } from 'vitest';
import { linearLocalPoly, newCustomModel, partAngle, partBounds, type CustomModel, type CustomPart } from '../domain/models/custom';
import { cornerTargets, fitProfile, fitProfileCorner, profileCutData, profileCutsError, setProfileEndCut } from '../domain/models/profileCuts';
import { materialShape, sectionFace } from '../domain/models/materialShape';
import { findOverlaps } from '../domain/models/overlap';
import { customSpec, registerCustomModels, scaledWithReinforce } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { buildCutList } from '../domain/pricing/production';
import { computeLayout } from '../domain/geometry/layout';
import { buildSketch } from '../domain/models/sketch';
import { extraSpecKey } from '../domain/models/spec';
import { settleModel } from '../domain/models/settle';
import type { FenceModelId, Material } from '../domain/models/types';

const tube: Material = { id: 'cut-tube', sku: '', name: 'Kvadratna cev 40x40x2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 0, demo: true };
const wide: Material = { ...tube, id: 'cut-wide', name: 'Kvadratna cev 60x40x2' };
const up: Material = { ...tube, id: 'cut-u', name: 'U profil 40x30x2' };
const materials = [tube, wide, up];
const shape = materialShape(tube);
const part = (id: string, patch: Partial<CustomPart> = {}): CustomPart => ({ id, materialId: tube.id, x: 0, y: 20, z: 0, angleDeg: 0, rot: 0, lengthMm: 1000, ...patch });
const model = (parts: CustomPart[]): CustomModel => ({ ...newCustomModel('cm_cuts'), widthMm: 1000, heightMm: 1000, parts });
const unwrap = (r: { model: CustomModel } | { error: string }) => { if ('error' in r) throw new Error(r.error); return r.model; };
const poly = (p: CustomPart) => {
  const s = materialShape(materials.find((m) => m.id === p.materialId)!);
  if (s.type !== 'linear') throw new Error('profile expected');
  const f = sectionFace(s.section, partAngle(p));
  return linearLocalPoly(p, f.u0, f.u1);
};

afterEach(() => registerCustomModels([], materials));

describe('ručno sečenje profila', () => {
  it.each([tube, wide, up])('%s: zasebni uglovi skidaju materijal unutar najveće mere, bez pomeranja ose', (mat) => {
    const p = part('a', { materialId: mat.id, angleDeg: 31 });
    const s = materialShape(mat);
    let m = unwrap(setProfileEndCut(model([p]), p.id, 0, 32.5, s));
    m = unwrap(setProfileEndCut(m, p.id, 1, 120, s));
    const q = m.parts[0]; const pts = poly(q);
    expect(q).toMatchObject({ x: p.x, y: p.y, lengthMm: 1000, angleDeg: 31, endCuts: [32.5, 120] });
    expect(Math.min(...pts.map(([x]) => x))).toBeCloseTo(0);
    expect(Math.max(...pts.map(([x]) => x))).toBeCloseTo(1000);
    expect(profileCutData(q, s)?.ends).toEqual([[32.5], [60]]);
    expect(p.endCuts).toBeUndefined();
  });

  it('suprotan smer menja kosinu, a ravan rez vraća pravougaoni kraj', () => {
    const p = part('a'); const m = model([p]);
    const a = unwrap(setProfileEndCut(m, 'a', 0, 45, shape)).parts[0];
    const b = unwrap(setProfileEndCut(m, 'a', 0, 135, shape)).parts[0];
    expect(poly(a)[0][0]).toBeCloseTo(0); expect(poly(a)[3][0]).toBeCloseTo(40);
    expect(poly(b)[0][0]).toBeCloseTo(40); expect(poly(b)[3][0]).toBeCloseTo(0);
    const flat = unwrap(setProfileEndCut(model([a]), 'a', 0, 90, shape)).parts[0];
    expect(poly(flat)[0][0]).toBeCloseTo(0); expect(poly(flat)[3][0]).toBeCloseTo(0);
  });

  it('ne prihvata ukrštene rezove, nulu, beskonačne i neispravne uglove', () => {
    const m = model([part('a', { lengthMm: 30 })]);
    for (const deg of [0, 180, -45, NaN, Infinity, 45]) expect(setProfileEndCut(m, 'a', 0, deg, shape)).toHaveProperty('error');
    expect(m.parts[0].endCuts).toBeUndefined();
    expect(profileCutsError(model([part('short', { lengthMm: 30, endCuts: [45, 90] })]), materials)).toContain('se ukrštaju');
  });

  it('izmena rama čuva ugao suprotnog kraja, a ručni rez se ne uklapa ponovo u U vođice', () => {
    const m = model([part('a', { cut45: true, miter: 'lo' })]);
    const next = unwrap(setProfileEndCut(m, 'a', 0, 60, shape));
    expect(next.parts[0].endCuts).toEqual([60, 135]);
    expect(next.parts[0].cut45).toBeUndefined();
    expect(settleModel(next, materials, false).model.parts[0].endCuts).toEqual([60, 135]);
  });
});

describe('automatski ugaoni spoj', () => {
  it('uspravna cev i gornja prečka: dva reza 45°, bez preklapanja i bez promene spoljne mere', () => {
    const m = model([part('v', { x: 20, y: 0, angleDeg: 90 }), part('h', { y: 980 })]);
    expect(findOverlaps(m, materials)).toHaveLength(1);
    const next = unwrap(fitProfileCorner(m, 'v', 'h', materials));
    expect(findOverlaps(next, materials)).toHaveLength(0);
    next.parts.forEach((p) => expect(p.lengthMm).toBeCloseTo(1000));
    expect(profileCutData(next.parts[0], shape)?.ends).toEqual([[90], [45]]);
    expect(profileCutData(next.parts[1], shape)?.ends[0][0]).toBeCloseTo(45);
    expect(settleModel(next, materials).model.parts.map((p) => p.endCuts)).toEqual(next.parts.map((p) => p.endCuts));
  });

  it.each([[0, 60], [0, 120], [35, 145], [180, 270], [-80, 30], [270, 180]])('ose %s° i %s°: zajednička ivica i nulti preklop', (a, b) => {
    const make = (id: string, angle: number) => {
      const rad = angle * Math.PI / 180;
      return part(id, { x: -60 * Math.cos(rad), y: -60 * Math.sin(rad), angleDeg: angle, lengthMm: 1060 });
    };
    const m = model([make('a', a), make('b', b)]);
    const next = unwrap(fitProfileCorner(m, 'a', 'b', materials));
    expect(findOverlaps(next, materials)).toHaveLength(0);
    const world = (p: CustomPart) => poly(p).map(([x, y]) => [p.x + x * Math.cos(p.angleDeg * Math.PI / 180) - y * Math.sin(p.angleDeg * Math.PI / 180), p.y + x * Math.sin(p.angleDeg * Math.PI / 180) + y * Math.cos(p.angleDeg * Math.PI / 180)]);
    const A = world(next.parts[0]); const B = world(next.parts[1]);
    expect(A.filter((p) => B.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6))).toHaveLength(2);
  });

  it('različite širine profila daju različite uglove sa istom linijom spoja', () => {
    const m = model([part('v', { x: 30, y: 0, angleDeg: 90, materialId: wide.id }), part('h', { y: 980 })]);
    const next = unwrap(fitProfileCorner(m, 'v', 'h', materials));
    expect(findOverlaps(next, materials)).toHaveLength(0);
    expect(profileCutData(next.parts[0], materialShape(wide))?.ends[1][0]).toBeCloseTo(Math.atan(60 / 40) * 180 / Math.PI);
  });

  it('paralelni profili, ukrštanje na sredini, udaljeni krajevi i drugi sloj nisu ugaoni spoj', () => {
    const a = part('a');
    for (const b of [part('b', { y: 30 }), part('b', { x: 500, y: -500, angleDeg: 90 }), part('b', { x: 2000, angleDeg: 90 }), part('b', { angleDeg: 90, z: 100 })]) {
      const m = model([a, b]);
      expect(fitProfileCorner(m, 'a', 'b', materials)).toHaveProperty('error');
      expect(cornerTargets(m, 'a', materials)).toHaveLength(0);
    }
  });
});

describe('uglovi u krojnoj listi i skici', () => {
  it('isti profil i dužina sa različitim rezovima ostaju zasebne stavke', () => {
    const m = model([part('a', { endCuts: [45, 90] }), part('b', { y: 200, endCuts: [90, 45] }), part('c', { y: 400, endCuts: [135, 90] })]);
    registerCustomModels([m], materials);
    expect(customSpec(m)).toHaveLength(3);
    const project = createProject('cuts', [createFence({ modelId: m.id as FenceModelId, heightMm: 1000 })]);
    const rows = buildCutList(project, undefined, materials);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.ends && r.endShape && r.faceMm === 40 && !r.miter)).toBe(true);
    expect(new Set(rows.map((r) => JSON.stringify(r.endShape))).size).toBe(3);
    const sketch = buildSketch(m, materials);
    expect(sketch.positions).toHaveLength(3);
    expect(sketch.positions.every((p) => p.angle.includes('rezovi'))).toBe(true);
    const extraRows = buildCutList(project, { [extraSpecKey(m.id)]: [{ id: 'extra', name: 'Dodati profil', materialId: tube.id, group: 'Profili ispune' as const, qty: '1', lengthMm: '123', enabled: true }] }, materials);
    expect(extraRows.some((r) => r.part === 'Dodati profil' && r.lengthMm === 123)).toBe(true);
  });

  it('kosa cev: krojna mera prati stvarnu dužinu na drugoj veličini polja', () => {
    const m = model([part('diag', { x: 50, y: 50, angleDeg: 35, lengthMm: 800, endCuts: [35, 120] })]);
    registerCustomModels([m], materials);
    const project = createProject('cuts', [createFence({ modelId: m.id as FenceModelId, heightMm: 1500 })]);
    const w = computeLayout(project).items[0].clearWidth;
    const drawn = scaledWithReinforce(m, w, 1500);
    const rows = buildCutList(project, undefined, materials);
    expect(rows[0].lengthMm).toBe(Math.round(drawn.parts[0].lengthMm));
    expect(rows[0].ends).toEqual([[35], [60]]);
    const b = partBounds(drawn.parts[0], shape);
    expect(b.x1).toBeGreaterThan(b.x0);
  });

  it('kosa cev sa ravnim krajevima takođe ima stvarnu kosu dužinu u krojnoj listi', () => {
    const m = model([part('diag', { x: 50, y: 50, angleDeg: 35, lengthMm: 800 })]);
    registerCustomModels([m], materials);
    const project = createProject('diagonal', [createFence({ modelId: m.id as FenceModelId, heightMm: 1500 })]);
    const w = computeLayout(project).items[0].clearWidth;
    expect(buildCutList(project, undefined, materials)[0].lengthMm).toBe(Math.round(scaledWithReinforce(m, w, 1500).parts[0].lengthMm));
  });
});

describe('kosa cev uklopljena u ram (Prilagodi ugao)', () => {
  // ram 40 × 40 sa uglovima 45°, spoljna mera W × H; ose su na sredini cevi
  const frame = (W: number, H: number): CustomPart[] => [
    part('fb', { x: 0, y: 20, angleDeg: 0, lengthMm: W, cut45: true, miter: 'lo' }),
    part('fr', { x: W - 20, y: 0, angleDeg: 90, lengthMm: H, cut45: true, miter: 'lo' }),
    part('ft', { x: W, y: H - 20, angleDeg: 180, lengthMm: W, cut45: true, miter: 'lo' }),
    part('fl', { x: 20, y: H, angleDeg: 270, lengthMm: H, cut45: true, miter: 'lo' }),
  ];
  const world = (p: CustomPart) => {
    const a = p.angleDeg * Math.PI / 180;
    return poly(p).map(([x, y]) => [p.x + x * Math.cos(a) - y * Math.sin(a), p.y + x * Math.sin(a) + y * Math.cos(a)]);
  };
  const diagonal = (x0: number, y0: number, x1: number, y1: number) => part('d', { x: x0, y: y0, angleDeg: Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI, lengthMm: Math.hypot(x1 - x0, y1 - y0) });
  const inside = (p: CustomPart, W: number, H: number) => world(p).every(([x, y]) => x > 40 - 1e-6 && x < W - 40 + 1e-6 && y > 40 - 1e-6 && y < H - 40 + 1e-6);
  const hasPoint = (p: CustomPart, x: number, y: number) => world(p).some((q) => Math.hypot(q[0] - x, q[1] - y) < 1e-6);

  it('kvadrat 600 × 600: oba kraja dobijaju šiljak 45° + 45° koji naleže na obe cevi rama', () => {
    const m = model([...frame(600, 600), diagonal(0, 0, 600, 600)]);
    expect(findOverlaps(model(frame(600, 600)), materials)).toHaveLength(0);
    expect(findOverlaps(m, materials).length).toBeGreaterThan(0);
    const next = unwrap(fitProfile(m, 'd', undefined, materials));
    const d = next.parts.find((p) => p.id === 'd')!;
    expect(findOverlaps(next, materials)).toHaveLength(0);
    next.parts.filter((p) => p.id !== 'd').forEach((p, i) => expect(p).toEqual(m.parts[i]));
    expect(inside(d, 600, 600)).toBe(true);
    expect(hasPoint(d, 40, 40)).toBe(true);
    expect(hasPoint(d, 560, 560)).toBe(true);
    expect(d.lengthMm).toBeCloseTo(520 * Math.SQRT2);
    expect(d.endTips?.every(Boolean)).toBe(true);
    expect(profileCutData(d, shape)?.ends.map((e) => e.map((a) => Math.round(a * 1000) / 1000))).toEqual([[45, 45], [45, 45]]);
    expect(profileCutData(d, shape)?.endShape.every((e) => e.length === 3)).toBe(true);
  });

  it('pravougaonik 1000 × 600: šiljak sa različitim uglovima, vrh u unutrašnjem uglu rama', () => {
    const m = model([...frame(1000, 600), diagonal(0, 0, 1000, 600)]);
    const next = unwrap(fitProfile(m, 'd', undefined, materials));
    const d = next.parts.find((p) => p.id === 'd')!;
    expect(findOverlaps(next, materials)).toHaveLength(0);
    expect(inside(d, 1000, 600)).toBe(true);
    expect(hasPoint(d, 40, 40)).toBe(true);
    expect(hasPoint(d, 960, 560)).toBe(true);
    const theta = Math.atan2(600, 1000) * 180 / Math.PI;
    const ends = profileCutData(d, shape)!.ends.map((e) => [...e].sort((a, b) => a - b));
    ends.forEach((e) => { expect(e[0]).toBeCloseTo(theta); expect(e[1]).toBeCloseTo(90 - theta); });
  });

  it('kraj na sredini prečke rama: jedan rez uz unutrašnju ivicu', () => {
    const m = model([...frame(600, 600), diagonal(200, 0, 400, 600)]);
    const next = unwrap(fitProfile(m, 'd', undefined, materials));
    const d = next.parts.find((p) => p.id === 'd')!;
    expect(findOverlaps(next, materials)).toHaveLength(0);
    expect(d.endTips).toBeUndefined();
    expect(inside(d, 600, 600)).toBe(true);
    const ys = world(d).map((q) => q[1]).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(40); expect(ys[1]).toBeCloseTo(40); expect(ys[3]).toBeCloseTo(560);
  });

  it('krojna lista i skica nose dva ugla, a ručni rez kraja vraća jedan rez', () => {
    const m = unwrap(fitProfile(model([...frame(600, 600), diagonal(0, 0, 600, 600)]), 'd', undefined, materials));
    registerCustomModels([m], materials);
    const project = createProject('diag-frame', [createFence({ modelId: m.id as FenceModelId, heightMm: 600 })]);
    const row = buildCutList(project, undefined, materials).find((r) => r.ends?.[0].length === 2);
    expect(row?.endShape?.[0]).toHaveLength(3);
    expect(buildSketch(m, materials).positions.some((p) => p.angle.includes('(V)'))).toBe(true);
    const d = m.parts.find((p) => p.id === 'd')!;
    const one = unwrap(setProfileEndCut(m, 'd', 0, 90, shape)).parts.find((p) => p.id === 'd')!;
    expect(one.endTips?.[0]).toBeNull();
    expect(one.endTips?.[1]).toEqual(d.endTips?.[1]);
  });

  it('dva profila preklopljena krajevima i dalje dobijaju zajednički ugao', () => {
    const m = model([part('v', { x: 20, y: 0, angleDeg: 90 }), part('h', { y: 980 })]);
    const next = unwrap(fitProfile(m, 'v', 'h', materials));
    expect(findOverlaps(next, materials)).toHaveLength(0);
    next.parts.forEach((p) => expect(p.lengthMm).toBeCloseTo(1000));
    expect(fitProfile(model([part('a')]), 'a', undefined, materials)).toHaveProperty('error');
  });
});
