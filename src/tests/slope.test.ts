import { describe, expect, it } from 'vitest';
import { newCustomModel, partBounds, sheetAreaMm2, sheetPoly, type CustomModel, type CustomPart } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { findOverlaps } from '../domain/models/overlap';
import { addSlope } from '../domain/models/slope';
import type { Material } from '../domain/models/types';

const mk = (id: string, sku: string, name: string, unit: Material['unit'] = 'm'): Material => ({ id, sku, name, unit, category: unit === 'm2' ? 'panel' : 'profil', unitPrice: 1, wastePercent: 0, demo: false });
const KV = mk('kv', 'KV000010', 'Kvadratna cev 40×40×2 mm, sirovo');
const LIM = mk('lim', 'LIM-2', 'Lim 2 mm', 'm2');
const MATS = [KV, LIM];
const part = (id: string, x: number, y: number, len: number, a: number): CustomPart => ({ id, materialId: KV.id, x, y, lengthMm: len, angleDeg: a, rot: 0, z: 0 });
/** krilo 1000 × 1000: dve bočne cevi cele visine, gornja i donja između njih */
const gate = (): CustomModel => ({ ...newCustomModel('cm_s'), widthMm: 1000, heightMm: 1000, parts: [part('L', 20, 0, 1000, 90), part('R', 980, 0, 1000, 90), part('B', 40, 20, 920, 0), part('T', 40, 980, 920, 0)] });

describe('pad terena', () => {
  it('ploča sa kosom donjom ivicom: obris i površina', () => {
    const p = { x: 0, y: 0, lengthMm: 1000, heightMm: 300, bottomSlopeMm: 200 };
    expect(sheetPoly(p)).toEqual([[0, 0], [1000, 200], [1000, 300], [0, 300]]);
    expect(sheetAreaMm2(p)).toBe(1000 * 200);
  });

  it('bočne cevi idu do terena sa donjim krajem sečenim pod uglom pada, lim je u ravni sa njima, ispod nema ničega', () => {
    expect(materialShape(LIM).type).toBe('sheet');
    const r = addSlope(gate(), MATS, { dropMm: 150, low: 'left', minPlateMm: 80, plateId: LIM.id });
    if ('error' in r) throw new Error(r.error);
    const m = r.model;
    expect(findOverlaps(m, MATS)).toEqual([]);
    // nema kose cevi: samo četiri cevi i lim
    expect(m.parts).toHaveLength(5);
    const L = m.parts.find((p) => p.id === 'L')!; const R = m.parts.find((p) => p.id === 'R')!;
    const deg = (Math.atan2(150, 1000) * 180) / Math.PI;
    expect(L.cutStartDeg).toBeCloseTo(deg, 2); expect(R.cutStartDeg).toBeCloseTo(deg, 2);
    const plate = m.parts.find((p) => p.materialId === LIM.id)!;
    const lb = partBounds(L, materialShape(KV)); const rb = partBounds(R, materialShape(KV));
    // lim je između bočnih cevi, donja ivica mu je na istoj liniji kao donji krajevi cevi
    expect(plate.x).toBeCloseTo(lb.x1, 2); expect(plate.x + plate.lengthMm).toBeCloseTo(rb.x0, 2);
    const ground = (x: number) => (x - lb.x0) * Math.tan((deg * Math.PI) / 180) + lb.y0;
    const poly = sheetPoly(plate);
    expect(poly[0][1]).toBeCloseTo(ground(plate.x), 1);
    expect(poly[1][1]).toBeCloseTo(ground(plate.x + plate.lengthMm), 1);
    // najniža tačka leve cevi je na terenu (0), desna cev je kraća za pad
    expect(lb.y0).toBeCloseTo(0, 1);
    expect(L.lengthMm - R.lengthMm).toBeCloseTo(150 * (980 - 20) / 1000, 0);
    // gornja ivica lima dodiruje stari donji profil, a na višoj strani lim ima zadatu visinu
    const B = m.parts.find((p) => p.id === 'B')!;
    const bb = partBounds(B, materialShape(KV));
    expect(plate.y + plate.heightMm!).toBeCloseTo(bb.y0, 2);
    expect(plate.heightMm! - plate.bottomSlopeMm!).toBeCloseTo(80, 0);
  });

  it('niža desna strana daje pad na drugu stranu', () => {
    const r = addSlope(gate(), MATS, { dropMm: 100, low: 'right', minPlateMm: 50, plateId: LIM.id });
    if ('error' in r) throw new Error(r.error);
    const L = r.model.parts.find((p) => p.id === 'L')!; const R = r.model.parts.find((p) => p.id === 'R')!;
    expect(R.lengthMm).toBeGreaterThan(L.lengthMm);
    expect(findOverlaps(r.model, MATS)).toEqual([]);
  });
});
