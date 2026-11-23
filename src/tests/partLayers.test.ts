import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { customBom, newCustomModel, type CustomModel, type CustomPart } from '../domain/models/custom';
import { depthRange, findOverlaps, layerPart, layerParts } from '../domain/models/overlap';
import { picketSupports, supportsBehindPickets } from '../domain/models/picketLayers';
import { customPartsFor, registerCustomModels, terraceVariantId } from '../domain/models/customRegistry';

const mats = MODEL_MATERIALS;
const picketMat = 'mat_ek_kv000007';
const railMat = 'mat_kv_30x20';
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number, z = 0): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z });
const model = (): CustomModel => ({ ...newCustomModel('Tarabice 80×20'), id: 'cm_depth_pickets', widthMm: 500, heightMm: 670,
  parts: [...Array.from({ length: 5 }, (_, i) => part(`p${i}`, picketMat, 50 + i * 100, 0, 670, 90)),
    ...[100, 570].map((y, i) => part(`rail${i}`, railMat, 0, y, 500, 0))],
});
afterEach(() => registerCustomModels([], mats, []));

describe('položaj postojećih nosača tarabica po dubini', () => {
  it('obe prečke naležu iza tarabica, bez promene mera ili količina', () => {
    const original = model();
    expect(findOverlaps(original, mats)).toHaveLength(10);
    expect(picketSupports(original, mats).map((p) => p.id)).toEqual(['rail0', 'rail1']);
    const next = supportsBehindPickets(original, mats);
    expect(findOverlaps(next, mats)).toEqual([]);
    const back = depthRange(next.parts[0], mats)!.z0;
    for (const p of next.parts) {
      const before = original.parts.find((q) => q.id === p.id)!;
      if (p.materialId === railMat) {
        expect(depthRange(p, mats)!.z1).toBeCloseTo(back, 6);
        expect({ ...p, z: before.z }).toEqual(before);
      } else expect(p).toBe(before);
    }
    expect(customBom(next, mats)).toEqual(customBom(original, mats));
    expect(supportsBehindPickets(next, mats)).toBe(next);
  });

  it('već pomerena prečka se ne odmiče dalje kada se popravi i druga', () => {
    const original = model(); original.parts[5] = { ...original.parts[5], z: -20 };
    const next = supportsBehindPickets(original, mats);
    expect(next.parts.slice(5).map((p) => p.z)).toEqual([-20, -20]);
  });

  it('izabrane prečke se zajedno pomeraju iza i ispred bez međusobnog slaganja', () => {
    const original = model();
    const behind = layerParts(original, ['rail0', 'rail1'], 'behind', mats);
    expect(behind.parts.slice(5).map((p) => p.z)).toEqual([-20, -20]);
    expect(layerParts(behind, ['rail0', 'rail1'], 'behind', mats)).toBe(behind);
    const front = layerParts(behind, ['rail0', 'rail1'], 'front', mats);
    expect(front.parts.slice(5).map((p) => p.z)).toEqual([20, 20]);
    expect(findOverlaps(front, mats)).toEqual([]);
    expect(front.parts.slice(0, 5)).toEqual(original.parts.slice(0, 5));
  });

  it('sklop tarabice i čepa čuva međusobni položaj i razliku dubina', () => {
    const original = model();
    original.parts.push(part('cap', 'mat_ek_k100018', 250, 670, 0, 0));
    const next = layerParts(original, ['p2', 'cap'], 'front', mats);
    expect(next.parts.find((p) => p.id === 'p2')?.z).toBe(20);
    expect(next.parts.find((p) => p.id === 'cap')?.z).toBe(20);
    expect(next.parts.filter((p) => p.id !== 'p2' && p.id !== 'cap')).toEqual(original.parts.filter((p) => p.id !== 'p2' && p.id !== 'cap'));
  });

  it('položaj iza tarabica ostaje isti posle skaliranja i prenosa na terasu', () => {
    const fixed = supportsBehindPickets(model(), mats);
    registerCustomModels([fixed], mats, [fixed.id]);
    for (const id of [fixed.id, terraceVariantId(fixed.id)]) {
      const parts = customPartsFor(id, 2400, 1000, '#ffffff').map((r) => r.part);
      const bars = parts.filter((p) => p.materialId === picketMat);
      const rails = parts.filter((p) => p.materialId === railMat);
      expect(bars.length).toBeGreaterThan(5);
      expect(rails.length).toBeGreaterThanOrEqual(2);
      for (const r of rails) for (const p of bars) expect(depthRange(r, mats)!.z1).toBeLessThanOrEqual(depthRange(p, mats)!.z0 + 0.001);
    }
  });

  it('nagnuti presek ostaje izvan tarabica i posle zaokruživanja dubine', () => {
    const original = model();
    const rail = { ...original.parts[5], tiltDeg: 17 };
    const behind = layerPart(original, rail, 'behind', mats);
    expect(depthRange(behind, mats)!.z1).toBeLessThanOrEqual(depthRange(original.parts[0], mats)!.z0);
  });
});
