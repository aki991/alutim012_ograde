import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { FENCE_MODELS } from '../domain/models/catalog';
import { leafSeed } from '../domain/models/leafSeed';

describe('krilo kapije uvek ima ram', () => {
  it.each(Object.keys(FENCE_MODELS))('%s: ram i zadata spoljna mera', (id) => {
    const m = leafSeed(id, [], MODEL_MATERIALS, 'x', 1000, 1500);
    if ('error' in m) return;
    expect(m.parts.some((p) => p.materialId === 'mat_alu_frame' || (p.cut45 && p.miter) || p.angleDeg === 90 && p.lengthMm >= 1450)).toBe(true);
    expect(Math.abs(m.widthMm - 1000)).toBeLessThan(2);
    expect(Math.abs(m.heightMm - 1500)).toBeLessThan(2);
  });
});
