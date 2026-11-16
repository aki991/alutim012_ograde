import { describe, expect, it } from 'vitest';
import { materialShape, solidsBounds } from '../domain/models/materialShape';
import type { Material } from '../domain/models/types';

const cap: Material = { id: 'mat_ek_k100018', sku: 'K100018', name: 'Čep tarabice pun 80×20 mm', unit: 'kom', category: 'okov', unitPrice: 120, wastePercent: 0, demo: false };

describe('čep tarabice', () => {
  it('je komad sa okovratnikom i kupolom visine 0,425 × širina, prema tarabici 80×20', () => {
    const s = materialShape(cap);
    expect(s.type).toBe('piece');
    if (s.type !== 'piece') return;
    expect(s.group).toBe('cepovi');
    const dome = s.solids.find((x) => x.prim === 'dome');
    expect(dome).toMatchObject({ w: 80, d: 20, h: 34 });
    const b = solidsBounds(s.solids);
    expect(b.x1 - b.x0).toBeCloseTo(84); // okovratnik 2 mm širi sa svake strane
    expect(b.y1).toBeCloseTo(40);        // 6 mm okovratnik + 34 mm kupola = CAPH 40
  });
});

import { newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { groupHasCaps, layoutVBars, setGroupCaps, vLayoutInfo } from '../domain/models/vbars';

describe('raspored uspravnih tarabica i čepovi', () => {
  const TAR: Material = { id: 'm_tar', sku: 'KV000007', name: 'Kvadratna cev 80×20×1 mm, sirovo', unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false };
  const MATS = [TAR, cap];
  const bar = (id: string, x: number): CustomPart => ({ id, materialId: TAR.id, x, y: 0, lengthMm: 700, angleDeg: 90, rot: 0, z: 0 });
  const start = (): CustomModel => ({ ...newCustomModel('cm_t'), widthMm: 500, heightMm: 750, parts: [bar('a', 50), bar('b', 150), bar('c', 250)] });

  it('razmak između letvica se zadaje jednim brojem i čepovi prate letvice', () => {
    let m = start();
    const withCaps = setGroupCaps(m, m.parts[0], MATS, true);
    if ('error' in withCaps) throw new Error(withCaps.error);
    m = withCaps.model;
    expect(m.parts.filter((p) => p.materialId === cap.id)).toHaveLength(3);
    expect(groupHasCaps(m, m.parts[0], MATS)).toBe(true);
    const info = vLayoutInfo(m, m.parts[0], MATS)!;
    expect(info.count).toBe(3);
    expect(info.gap).toBe(20); // 80 širina, osa na 50/150/250 → razmak 20
    const r = layoutVBars(m, 'a', MATS, { count: 3, top: info.top, bottom: info.bottom, gap: 35, auto: 'bottom' });
    if ('error' in r) throw new Error(r.error);
    expect(vLayoutInfo(r.model, r.model.parts[0], MATS)!.gap).toBe(35);
    // čepovi su i dalje iznad svojih letvica
    expect(groupHasCaps(r.model, r.model.parts[0], MATS)).toBe(true);
    // novi broj letvica dodaje letvicu sa čepom
    const more = layoutVBars(r.model, 'a', MATS, { count: 4, top: 10, bottom: 10, gap: 20, auto: 'bottom', countChange: true });
    if ('error' in more) throw new Error(more.error);
    expect(more.model.parts.filter((p) => p.materialId === TAR.id)).toHaveLength(4);
    expect(more.model.parts.filter((p) => p.materialId === cap.id)).toHaveLength(4);
    // skidanje čepova
    const off = setGroupCaps(more.model, more.model.parts[0], MATS, false);
    if ('error' in off) throw new Error(off.error);
    expect(off.model.parts.some((p) => p.materialId === cap.id)).toBe(false);
  });
});

import { findOverlaps, layerPart } from '../domain/models/overlap';
import { DEFAULT_RAILS } from '../data/modelMaterials';
import { resolveParts } from '../domain/models/custom';

describe('slojevi: delovi jedan iza drugog', () => {
  const TAR: Material = { id: 'm_tar', sku: 'KV000007', name: 'Kvadratna cev 80×20×1 mm, sirovo', unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false };
  const RAIL: Material = { id: 'm_rail', sku: 'KV000008', name: 'Kvadratna cev 40×20×1,5 mm, sirovo', unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false };
  const MATS = [TAR, RAIL];
  const picket: CustomPart = { id: 'p', materialId: TAR.id, x: 100, y: 0, lengthMm: 700, angleDeg: 90, rot: 0, z: 0 };
  const rail: CustomPart = { id: 'r', materialId: RAIL.id, x: 0, y: 200, lengthMm: 400, angleDeg: 0, rot: 0, z: 0 };

  it('nov deo preko postojećeg se stavlja iza (ili ispred) bez preklapanja po dubini', () => {
    const m = { ...newCustomModel('cm_l'), parts: [picket] };
    expect(findOverlaps({ parts: [picket, rail] }, MATS)).toHaveLength(1);
    const behind = layerPart(m, rail, 'behind', MATS);
    expect(behind.z).toBeLessThan(0);
    expect(findOverlaps({ parts: [picket, behind] }, MATS)).toEqual([]);
    const front = layerPart(m, rail, 'front', MATS);
    expect(front.z).toBeGreaterThan(0);
    expect(findOverlaps({ parts: [picket, front] }, MATS)).toEqual([]);
    // deo koji ništa ne pokriva ostaje isti
    expect(layerPart(m, { ...rail, y: 750 }, 'behind', MATS).z).toBe(0);
  });

  it('delovi se crtaju od zadnjeg ka prednjem', () => {
    const behind = { ...rail, z: -40 };
    const order = resolveParts({ parts: [picket, behind], color: 'RAL 7016' }, MATS).map((r) => r.part.id);
    expect(order).toEqual(['r', 'p']);
  });

  it('profilisan rukohvat ima presek sa žlebovima', () => {
    const s = materialShape(DEFAULT_RAILS[0]);
    expect(s.type).toBe('linear');
    if (s.type !== 'linear') return;
    expect(s.section.w).toBeCloseTo(100); expect(s.section.h).toBeCloseTo(40);
    expect(s.section.polys[0].outline.length).toBeGreaterThan(12);
  });
});

describe('raspored letvica računa samo letvice u istoj ravni', () => {
  const TAR: Material = { id: 'm_tar', sku: 'KV000007', name: 'Kvadratna cev 80×20×1 mm, sirovo', unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false };
  const TUBE: Material = { id: 'm_tube', sku: 'KV000009', name: 'Kvadratna cev 40×40×2 mm, sirovo', unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false };
  const MATS = [TAR, TUBE];
  const bar = (id: string, x: number): CustomPart => ({ id, materialId: TAR.id, x, y: 0, lengthMm: 700, angleDeg: 90, rot: 0, z: 0 });
  it('uspravne cevi iza letvica se ne broje', () => {
    const tube: CustomPart = { id: 't1', materialId: TUBE.id, x: 100, y: 0, lengthMm: 700, angleDeg: 90, rot: 0, z: -40 };
    const m: CustomModel = { ...newCustomModel('cm_z'), widthMm: 500, parts: [bar('a', 50), bar('b', 150), bar('c', 250), tube, { ...tube, id: 't2', x: 300 }] };
    expect(vLayoutInfo(m, m.parts[0], MATS)!.count).toBe(3);
  });
});
