import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS as M } from './fixtures/materials';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { registerCustomModels } from '../domain/models/customRegistry';
import { checkSizes } from '../domain/models/sizeCheck';
import { FENCE_MODELS } from '../domain/models/catalog';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import type { FenceModelId } from '../domain/models/types';

afterEach(() => registerCustomModels([], M));

const ids = Object.keys(FENCE_MODELS).filter((id) => !(FENCE_MODELS as Record<string, { terrace?: boolean }>)[id].terrace && !['rods', 'glass_rail'].includes(FENCE_MODELS[id as FenceModelId].style));

describe('provera modela na više veličina', () => {
  for (const id of ids) {
    it(`${id}: model iz kataloga nema problema na uobičajenim veličinama`, () => {
      const m = builtinToCustom(id as FenceModelId, M, 'cm_sc', 1500, 1200);
      registerCustomModels([m], M);
      expect(checkSizes(m, M).map((p) => p.msg)).toEqual([]);
    });
  }

  it('ručno nacrtan model sa preširokim delom prijavljuje deo koji izlazi iz polja', () => {
    const m: CustomModel = { ...newCustomModel('cm_bad'), widthMm: 1000, heightMm: 1000, parts: [
      { id: 'a', materialId: 'mat_alu_frame', x: 0, y: 500, lengthMm: 1000, angleDeg: 0, rot: 0, z: 0 },
      { id: 'b', materialId: 'mat_alu_frame', x: 500, y: 0, lengthMm: 2600, angleDeg: 90, rot: 0, z: 0 },
    ] };
    registerCustomModels([m], M);
    const res = checkSizes(m, M);
    expect(res.some((p) => p.kind === 'size' && p.key.includes('|outside|'))).toBe(true);
    // ključ je stabilan, pa se prihvaćeno upozorenje pamti
    expect(checkSizes(m, M).map((p) => p.key)).toEqual(res.map((p) => p.key));
  });
});
