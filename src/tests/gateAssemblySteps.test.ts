import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { SketchSvg } from '../components/designer/Sketch';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels, scaledWithReinforce } from '../domain/models/customRegistry';
import { modelWithFrame } from '../domain/models/frame';
import { buildSketch } from '../domain/models/sketch';
import { frameStepChains, gateStepParts, isGateFramePart } from '../services/pdfSketch';
import { partBounds } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';

const U = 'mat_u_60x28';
const BAR = 'mat_ek_kv000007';
const tube = MODEL_MATERIALS.find((m) => /^Kvadratna cev/.test(m.name))!;
const inner: CustomModel = {
  ...newCustomModel('cm_kapija_ispuna'), name: 'U profil i prečke', widthMm: 2000, heightMm: 1400,
  parts: [
    { id: 'a', materialId: U, x: 74, y: 0, lengthMm: 1400, angleDeg: 90, rot: 270, z: 0 },
    { id: 'b', materialId: U, x: 1926, y: 0, lengthMm: 1400, angleDeg: 90, rot: 90, z: 0 },
    ...[200, 500, 800, 1100].map((y, i) => ({ id: `c${i}`, materialId: BAR, x: 62, y, lengthMm: 1876, angleDeg: 0, rot: 0, z: 0, guides: ['a', 'b'] as [string, string] })),
  ],
};

afterEach(() => registerCustomModels([], []));

describe('radni nalog kapije: prvo ram, pa ispuna', () => {
  const framed = () => { const f = modelWithFrame(inner, tube, MODEL_MATERIALS, 0); if ('error' in f) throw new Error(f.error); return f; };

  it('krilo šire od 2,5 m: ram i uspravna cev su prvi korak, bočni U profili (i oni uz cev) i prečke drugi', () => {
    const f = framed();
    registerCustomModels([f], MODEL_MATERIALS);
    const leaf = scaledWithReinforce(f, 3200, f.heightMm);
    const sp = gateStepParts(leaf, MODEL_MATERIALS)!;
    expect(sp).not.toBeNull();
    const byId = new Map(leaf.parts.map((p) => [p.id, p]));
    expect(sp.frame.some((id) => id.startsWith('rf_v'))).toBe(true);
    expect(sp.frame.every((id) => isGateFramePart(byId.get(id)!))).toBe(true);
    expect(sp.frame.filter((id) => byId.get(id)!.cut45).length).toBe(4);
    expect(sp.infill.some((id) => id.startsWith('rf_u'))).toBe(true);
    expect(sp.infill).toEqual(expect.arrayContaining(['a', 'b']));
    expect(sp.infill.some((id) => id.startsWith('c0_c'))).toBe(true);
    // svaka pozicija sklopnog crteža je u tačno jednom koraku
    const all = buildSketch(leaf, MODEL_MATERIALS).positions.map((p) => p.no);
    expect([...sp.frameNos, ...sp.infillNos].sort((x, y) => x - y)).toEqual(all);
  });

  it('crtež koraka: sakriveni delovi se ne crtaju, bledi nemaju broj, brojevi su kao na sklopnom crtežu', () => {
    const f = framed();
    registerCustomModels([f], MODEL_MATERIALS);
    const leaf = scaledWithReinforce(f, 3200, f.heightMm);
    const sp = gateStepParts(leaf, MODEL_MATERIALS)!;
    const tags = (svg: string) => [...svg.matchAll(/data-testid="sketch-tag"[\s\S]*?<text[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1])).sort((x, y) => x - y);
    const step1 = renderToStaticMarkup(createElement(SketchSvg, { model: leaf, materials: MODEL_MATERIALS, bare: true, hide: sp.infill, title: 'Korak 1' }));
    const step2 = renderToStaticMarkup(createElement(SketchSvg, { model: leaf, materials: MODEL_MATERIALS, bare: true, mute: sp.frame, title: 'Korak 2' }));
    expect(tags(step1)).toEqual([...sp.frameNos].sort((x, y) => x - y));
    expect(tags(step2)).toEqual([...sp.infillNos].sort((x, y) => x - y));
    expect(step1).toContain('Korak 1');
    expect(step2).toContain('#e5e7eb');
  });

  it('kote ojačanja u ramu: od unutrašnje ivice rama do uspravne cevi, širina cevi, do druge ivice; po visini za vodoravno ojačanje', () => {
    const f = framed();
    registerCustomModels([f], MODEL_MATERIALS);
    const leaf = scaledWithReinforce(f, 3200, f.heightMm, { reinforce: { hYs: [600] } });
    const b = (id: string) => { const p = leaf.parts.find((q) => q.id === id)!; return partBounds(p, materialShape(MODEL_MATERIALS.find((m) => m.id === p.materialId)!)); };
    const { bottom, left } = frameStepChains(leaf, MODEL_MATERIALS);
    const tube = b('rf_v1');
    expect(bottom).toHaveLength(3);
    expect(bottom[0].b).toBeCloseTo(tube.x0, 3); // radnik meri od unutrašnje ivice rama do cevi
    expect(bottom[1].value).toBeCloseTo(tube.x1 - tube.x0, 1);
    expect(bottom[2].a).toBeCloseTo(tube.x1, 3);
    const frameV = leaf.parts.filter((p) => p.cut45 && p.angleDeg % 180 !== 0).map((p) => partBounds(p, materialShape(MODEL_MATERIALS.find((m) => m.id === p.materialId)!)));
    expect(bottom[0].a).toBeCloseTo(Math.min(...frameV.map((q) => q.x1)), 3);
    expect(bottom.reduce((n, d) => n + d.value, 0)).toBeCloseTo(Math.max(...frameV.map((q) => q.x0)) - Math.min(...frameV.map((q) => q.x1)), 0);
    const h = b('rf_h1_1');
    expect(left).toHaveLength(3);
    expect(left[0].b).toBeCloseTo(h.y0, 3);
    expect(left[1].value).toBeCloseTo(h.y1 - h.y0, 1);
    // kote se vide na crtežu koraka 1
    const sp = gateStepParts(leaf, MODEL_MATERIALS)!;
    const svg = renderToStaticMarkup(createElement(SketchSvg, { model: leaf, materials: MODEL_MATERIALS, bare: true, hide: sp.infill, chains: { bottom, left } }));
    expect((svg.match(/data-testid="sketch-dim-h"/g) ?? []).length).toBe(3);
    expect((svg.match(/data-testid="sketch-dim-v"/g) ?? []).length).toBe(3);
  });

  it('kapija bez rama nema korake', () => {
    registerCustomModels([inner], MODEL_MATERIALS);
    expect(gateStepParts(scaledWithReinforce(inner, 1800, 1400), MODEL_MATERIALS)).toBeNull();
  });
});
