import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { customSlatCount, customSlatLayout, registerCustomModels, scaledModel } from '../domain/models/customRegistry';
import { defaultSpec, evaluateItemSpec, evaluateSpec, specVars } from '../domain/models/spec';
import { createGate } from '../domain/models/factories';
import type { FenceModelId } from '../domain/models/types';

afterEach(() => registerCustomModels([], SEED_MATERIALS));

describe('letvice kapije iz modela u krojnoj listi', () => {
  it('broj letvica prati širinu krila, ne broj sa crteža', () => {
    const m = { ...builtinToCustom('picket_narrow', SEED_MATERIALS, 'cm_slat', 3000, 1400), kind: 'gate' as const, baseModelId: undefined, gate: undefined };
    registerCustomModels([m], SEED_MATERIALS);
    const drawn = m.parts.filter((p) => p.materialId === 'mat_alu_picket').length;
    const g = createGate('single', { infillModelId: 'cm_slat' as FenceModelId });
    for (const w of [3000, 1500, 1000]) {
      const layout = customSlatLayout('cm_slat', w, 1400)!;
      expect(customSlatCount('cm_slat', w, 1400)).toBe(layout.count);
      const vars = specVars({ modelId: 'cm_slat' as FenceModelId, widthMm: w, heightMm: 1400, axisMm: w, params: g.params });
      const row = evaluateSpec(defaultSpec('cm_slat' as FenceModelId), vars).find((e) => e.part.materialId === 'mat_alu_picket')!;
      expect(row.qty).toBe(layout.count);
    }
    expect(customSlatCount('cm_slat', 1000, 1400)).toBeLessThan(drawn);
  });
});

describe('vodoravne prečke modela u krojnoj listi i dužine delova', () => {
  const fences = ['h_boards', 'h_combo', 'panel_lines', 'h_white', 'h_wide', 'louver_dark'] as const;
  for (const id of fences) {
    it(`${id}: broj prečki u specifikaciji = broj prečki na crtežu, za više visina`, () => {
      const m = builtinToCustom(id, SEED_MATERIALS, 'cm_hb');
      registerCustomModels([m], SEED_MATERIALS);
      const g = createGate('single', { infillModelId: 'cm_hb' as FenceModelId });
      for (const [w, h] of [[1500, 1200], [1500, 1600], [1000, 1000]] as const) {
        const vars = specVars({ modelId: 'cm_hb' as FenceModelId, widthMm: w, heightMm: h, axisMm: w, params: g.params });
        const rows = evaluateSpec(defaultSpec('cm_hb' as FenceModelId), vars).filter((e) => e.part.group === 'Profili ispune' && e.part.materialId !== 'mat_alu_frame');
        const total = rows.reduce((n, e) => n + e.qty, 0);
        const drawn = scaledModel(m, w, h).parts.filter((p) => p.materialId !== 'mat_alu_frame').length;
        expect(total, `${id} ${w}x${h}`).toBe(drawn);
      }
    });
  }
});

describe('dvokrilna kapija iz nacrtanog modela', () => {
  it('stavke se računaju po krilu: dužine prečki su dužine krila, a količine su zbir oba krila', () => {
    const m = builtinToCustom('h_boards', SEED_MATERIALS, 'cm_dk');
    registerCustomModels([m], SEED_MATERIALS);
    const g = createGate('double', { infillModelId: 'cm_dk' as FenceModelId });
    const ctx = { modelId: 'cm_dk' as FenceModelId, widthMm: 3260, heightMm: 1600, axisMm: 3380, params: g.params, doubleGate: true };
    const dbl = evaluateItemSpec(defaultSpec('cm_dk' as FenceModelId), { ...ctx, leafWidthsMm: [1630, 1630] }).filter((e) => e.part.materialId !== 'mat_alu_frame');
    const one = evaluateItemSpec(defaultSpec('cm_dk' as FenceModelId), { ...ctx, widthMm: 1630, axisMm: 1630, doubleGate: false }).filter((e) => e.part.materialId !== 'mat_alu_frame');
    expect(Math.max(...dbl.map((e) => e.lengthMm ?? 0))).toBeLessThan(1700);
    expect(dbl.reduce((n, e) => n + e.qty, 0)).toBe(2 * one.reduce((n, e) => n + e.qty, 0));
  });
});
