import { describe, expect, it } from 'vitest';
import { newCustomModel, partBounds, resolveParts, type CustomPart } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import { frontSurfaceAt, hingesAlongEdge, restOnSurface } from '../domain/models/surface';
import { SEED_MATERIALS } from './fixtures/materials';
import type { Material } from '../domain/models/types';

const mk = (id: string, name: string, unit: Material['unit'] = 'm'): Material => ({ id, sku: id, name, category: unit === 'kom' ? 'okov' : 'profil', unit, unitPrice: 0, wastePercent: 0, demo: false });
const mats = [...SEED_MATERIALS, mk('lock', 'Brava standardna sa kvakom', 'kom'), mk('hinge', 'Šarka pojačana', 'kom')];
const tube = (id: string, x: number, y: number, len: number, angleDeg: number): CustomPart => ({ id, materialId: 'mat_kv_30x20', x, y, lengthMm: len, angleDeg, rot: 0, z: 0 });
const piece = (id: string, materialId: string, x: number, y: number): CustomPart => ({ id, materialId, x, y, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 });

describe('komadni delovi (brave, šarke) na kapiji', () => {
  const base = { ...newCustomModel('cm_t'), parts: [piece('lk', 'lock', 100, 500), tube('frame', 0, 0, 1000, 90), tube('bar', 0, 0, 1000, 0)] };

  it('crtaju se na kraju: brava stoji iznad rama i profila, a ne ispod njih', () => {
    const order = resolveParts(base, mats).map((r) => r.part.id);
    expect(order[order.length - 1]).toBe('lk');
  });

  it('brava postavljena preko profila naleže na njegovu prednju ravan (ne ulazi u profil)', () => {
    const lock = piece('l2', 'lock', 10, 400);
    const front = frontSurfaceAt(base, 10, 401, mats);
    expect(front).not.toBeNull();
    const placed = restOnSurface(base, lock, mats);
    expect(placed.z).toBeGreaterThan(front!);
    // zadnja strana brave (z − 22) je na prednjoj ravni profila
    expect(placed.z - 22).toBeCloseTo(front!, 0);
    // bez profila ispod ostaje na z = 0
    expect(restOnSurface(base, piece('l3', 'lock', 600, 400), mats).z).toBe(0);
  });

  it('šarke duž ivice: ravnomerno, cele unutar mera crteža, na ramu', () => {
    const model = { ...newCustomModel('cm_t'), parts: [tube('l', 0, 0, 1500, 90), tube('t', 0, 1500, 1000, 0), tube('b', 0, 0, 1000, 0), tube('r', 1000, 0, 1500, 90)] };
    const hinge = mats.find((m) => m.id === 'hinge')!;
    const made = hingesAlongEdge(model, hinge, 'left', 3, mats);
    expect(made).toHaveLength(3);
    const sh = materialShape(hinge);
    const bounds = made.map((p) => partBounds(p, sh));
    for (const b of bounds) { expect(b.x0).toBeGreaterThanOrEqual(-15 - 1e-6); expect(b.y1).toBeLessThanOrEqual(1510 + 1e-6); expect(b.y0).toBeGreaterThanOrEqual(-10 - 1e-6); }
    // srednja je po sredini između gornje i donje
    const ys = made.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1], 1);
    // desna ivica: šarke na desnoj strani
    const right = hingesAlongEdge(model, hinge, 'right', 2, mats);
    expect(right.every((p) => p.x > 500)).toBe(true);
  });
});
