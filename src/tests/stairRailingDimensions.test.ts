import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { createFence, createProject } from '../domain/models/factories';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels, terraceVariantId } from '../domain/models/customRegistry';
import { computeLayout, outerWidthMm, railingWidthMm } from '../domain/geometry/layout';
import { withRunPosts } from '../domain/geometry/runPosts';
import { stairOuterRunMm } from '../domain/geometry/stairOps';
import { installCost, laborCost } from '../domain/pricing/calc';
import { elementModel } from '../services/pdfSketch';

const source: CustomModel = { ...newCustomModel('Tarabice'), id: 'cm_stair_actual_length', widthMm: 1200, heightMm: 1000,
  parts: [{ id: 'lower', materialId: 'mat_kv_30x20', x: 0, y: 80, lengthMm: 1200, angleDeg: 0, rot: 0, z: -30 },
    { id: 'upper', materialId: 'mat_kv_30x20', x: 0, y: 880, lengthMm: 1200, angleDeg: 0, rot: 0, z: -30 },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `picket${i}`, materialId: 'mat_ek_kv000007', x: 100 + 200 * i, y: 0, lengthMm: 1000, angleDeg: 90, rot: 0, z: 0 }))] };
afterEach(() => registerCustomModels([], MODEL_MATERIALS, []));
function setup(up: boolean) {
  registerCustomModels([source], MODEL_MATERIALS, [source.id]); const id = terraceVariantId(source.id);
  const params = { barSizeMm: 80, gapMm: 120, frameMm: 0, slats: { postMaterialId: 'mat_ek_ktf808030' } };
  const flat = createFence({ modelId: id, widthMm: 3500, heightMm: 1000, params });
  const stair = createFence({ modelId: id, widthMm: 1700, heightMm: 1000, params, stair: { riseMm: up ? 1020 : -1020, steps: 6, group: 'g' } });
  const project = withRunPosts(createProject('Mere ograde', up ? [stair, flat] : [flat, stair]), MODEL_MATERIALS);
  return { project, stair, index: up ? 0 : 1 };
}
describe('stvarne mere ograde na stepeništu', () => {
  it.each([false, true])('prazan završetak raspona ne ulazi u dužinu ograde (penje se: %s)', (up) => {
    const { project, stair, index } = setup(up); const before = JSON.stringify(project);
    const layout = computeLayout(project);
    expect(stairOuterRunMm(project, stair.id)).toBe(1700);
    expect(outerWidthMm(project, index)).toBe(1700);
    expect(railingWidthMm(project, index)).toBeCloseTo(1315, 1);
    expect(layout.occupiedMm).toBe(5200);
    expect(layout.railingLengthMm).toBeCloseTo(4815, 1);
    expect(layout.railingEndMm - layout.railingStartMm).toBeCloseTo(layout.railingLengthMm, 6);
    expect(JSON.stringify(project)).toBe(before);
  });
  it('rad i montaža ne računaju prazan deo stepeništa', () => {
    const { project } = setup(false);
    expect(installCost(project).meters).toBeCloseTo(4.815, 6);
    expect(laborCost(project).areaM2).toBeCloseTo(4.815, 6);
  });
  it('skica elementa nema prazan okvir do kraja raspona stepeništa', () => {
    const { project, index } = setup(false);
    expect(elementModel(project, index, MODEL_MATERIALS)?.widthMm).toBeCloseTo(1315, 1);
  });
  it('ravna ograda i obični projektni stubovi zadržavaju svoje dosadašnje mere', () => {
    const p = createProject('Ravno', [createFence({ widthMm: 1500 })]); const l = computeLayout(p);
    expect(l.railingLengthMm).toBe(l.occupiedMm);
    expect(railingWidthMm(p, 0)).toBe(outerWidthMm(p, 0));
  });
});
