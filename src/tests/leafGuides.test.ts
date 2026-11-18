import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { registerCustomModels } from '../domain/models/customRegistry';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { leafSeed } from '../domain/models/leafSeed';
import { repairBrokenGuides } from '../domain/models/materialRemap';
import { findOverlaps } from '../domain/models/overlap';

const U = 'mat_u_60x28';
const BAR = 'mat_ek_kv000007';
/** ograda: dva U profila 60 × 28 (otvori ka unutra) i prečke 80 × 20 uvučene u njih */
const fence: CustomModel = {
  ...newCustomModel('cm_fence'), name: 'U profil 60×28 i prečke 80×20', widthMm: 1000, heightMm: 1500,
  parts: [
    { id: 'part_u1', materialId: U, x: 74, y: 0, lengthMm: 1500, angleDeg: 90, rot: 270, z: 0 },
    { id: 'part_u2', materialId: U, x: 926, y: 0, lengthMm: 1500, angleDeg: 90, rot: 90, z: 0 },
    ...[200, 500, 800, 1100].map((y, i) => ({ id: `part_b${i}`, materialId: BAR, x: 62, y, lengthMm: 876, angleDeg: 0, rot: 0, z: 0, guides: ['part_u1', 'part_u2'] as [string, string] })),
  ],
};

describe('crtež kapije od ograde: prečke ostaju u svojim U profilima', () => {
  it('posle novih ID-eva prečke pokazuju na U profile iz crteža kapije', () => {
    registerCustomModels([fence], MODEL_MATERIALS);
    const seed = leafSeed('cm_fence', [fence], MODEL_MATERIALS, 'tst', 1040, 1640);
    if ('error' in seed) throw new Error(seed.error);
    const ids = new Set(seed.parts.map((p) => p.id));
    const bars = seed.parts.filter((p) => p.materialId === BAR);
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.guides).toBeDefined();
      for (const g of b.guides!) {
        expect(ids.has(g)).toBe(true);
        expect(seed.parts.find((p) => p.id === g)!.materialId).toBe(U);
      }
    }
    // U profil i prečke koje ulaze u njega nisu preklapanje
    expect(findOverlaps(seed, MODEL_MATERIALS).filter((o) => o.a.materialId === U || o.b.materialId === U)).toEqual([]);
  });

  it('već sačuvan crtež sa pokidanim vezama se popravlja pri učitavanju', () => {
    const broken: CustomModel = {
      ...fence, id: 'cm_gate',
      parts: fence.parts.map((p) => (p.guides ? { ...p, id: `g_${p.id}`, guides: ['part_old1', 'part_old2'] as [string, string] } : { ...p, id: `g_${p.id}` })),
    };
    const fixed = repairBrokenGuides([broken], MODEL_MATERIALS);
    expect(fixed).not.toBeNull();
    const bars = fixed![0].parts.filter((p) => p.materialId === BAR);
    for (const b of bars) expect(b.guides).toEqual(['g_part_u1', 'g_part_u2']);
    expect(repairBrokenGuides(fixed!, MODEL_MATERIALS)).toBeNull();
  });
});
