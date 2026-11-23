import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { TERRACE_MATERIALS } from '../data/terraceMaterials';
import { newTerraceModel, partBounds, sheetPoly, type CustomPart } from '../domain/models/custom';
import { registerCustomModels, scaledWithReinforce } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { materialShape } from '../domain/models/materialShape';
import { developStairSketch } from '../domain/models/stairSketch';
import { buildSketch } from '../domain/models/sketch';
import { elementModel } from '../services/pdfSketch';

const materials = [...MODEL_MATERIALS, ...TERRACE_MATERIALS];
const mat = (sku: string) => materials.find((m) => m.sku === sku)!;
const part = (id: string, sku: string, x: number, y: number, lengthMm: number, angleDeg = 0): CustomPart => ({ id, materialId: mat(sku).id, x, y, lengthMm, angleDeg, z: 0, rot: 0 });
const model = { ...newTerraceModel('cm_stair_sketch'), parts: [part('post', 'P-1054', 100, 0, 1000, 90), part('rail', 'P-1037', 0, 1050, 2000), part('rod', 'P-1146', 0, 500, 2000)] };

afterEach(() => registerCustomModels([], []));

describe('skica i sklopni crtež stepeništa', () => {
  for (const tan of [0.5, -0.5]) it(`nagib ${tan}: cevi su kose, stubovi uspravni, dužine su stvarne`, () => {
    registerCustomModels([model], materials);
    const scaled = scaledWithReinforce(model, 2000, 1100, { stairTan: tan });
    const developed = developStairSketch(scaled, materials, tan);
    for (const id of ['rail', 'rod']) {
      const before = scaled.parts.find((p) => p.id === id)!;
      const after = developed.parts.find((p) => p.id === id)!;
      expect(after.angleDeg).toBeCloseTo(Math.atan(tan) * 180 / Math.PI);
      expect(after.lengthMm).toBeCloseTo(before.tube3d!.lengthMm);
      expect(after.tube3d).toBeUndefined();
    }
    expect(developed.parts.find((p) => p.id === 'post')!.angleDeg).toBe(90);
    expect(developed.parts.find((p) => p.id === 'post')!.lengthMm).toBe(scaled.parts.find((p) => p.id === 'post')!.lengthMm);
    for (const p of developed.parts) expect(partBounds(p, materialShape(materials.find((m) => m.id === p.materialId)!)).y0).toBeGreaterThanOrEqual(-0.001);
    expect(buildSketch(developed, materials).positions.some((p) => p.angle.includes('ugao'))).toBe(true);
  });

  it('obične prečke prate nagib, a tarabice i čepovi ostaju uspravni', () => {
    const p = part('bar', 'KV000007', 0, 500, 1000);
    const picket = { ...p, id: 'picket', x: 300, angleDeg: 90, lengthMm: 700, unshearTan: -0.5 };
    const cap = { ...part('cap', 'K100018', 300, 1200, 0), unshearTan: -0.5 };
    const developed = developStairSketch({ ...model, parts: [p, picket, cap] }, materials, -0.5);
    expect(developed.parts[0].angleDeg).toBeCloseTo(-26.565, 3);
    expect(developed.parts[0].lengthMm).toBeCloseTo(1118.034, 3);
    expect(developed.parts[1].angleDeg).toBe(90);
    expect(developed.parts[1].lengthMm).toBe(700);
    expect(developed.parts[2].y - developed.parts[1].y).toBeCloseTo(700);
  });

  it('staklo je paralelogram sa istim nagibom obe ivice', () => {
    const glass = { ...part('glass', 'TER-VSG-66', 100, 50, 1000), heightMm: 800 };
    const developed = developStairSketch({ ...model, parts: [glass] }, materials, -0.5);
    const polygon = sheetPoly(developed.parts[0]);
    expect(polygon[1][1] - polygon[0][1]).toBe(-500);
    expect(polygon[2][1] - polygon[3][1]).toBe(-500);
  });

  for (const modelId of ['rail_inox', 'rail_black'] as const) it(`${modelId}: ugrađeni terasni model dobija kose cevi u izvozu`, () => {
    registerCustomModels([], materials);
    const project = createProject('Ugrađeni model', [createFence({ modelId, widthMm: 2000, heightMm: 1100, stair: { riseMm: -1000, steps: 6 } })]);
    const developed = elementModel(project, 0, materials)!;
    expect(developed).not.toBeNull();
    expect(developed.parts.some((p) => Math.abs(p.angleDeg + 26.565) < 0.01)).toBe(true);
    expect(developed.stairSketchTan).toBe(-0.5);
  });

  it('zajednički izvozni model koristi nagib rasporeda, a ravno polje ostaje ravno', () => {
    registerCustomModels([model], materials);
    const project = createProject('Provera', [createFence({ modelId: 'cm_stair_sketch', widthMm: 2000, heightMm: 1100, stair: { riseMm: -1000, steps: 6 } }), createFence({ modelId: 'cm_stair_sketch', widthMm: 2000, heightMm: 1100 })]);
    const stair = elementModel(project, 0, materials)!;
    const flat = elementModel(project, 1, materials)!;
    expect(stair.parts.find((p) => p.id === 'rail')!.angleDeg).toBeCloseTo(-26.565, 3);
    expect(flat.parts.find((p) => p.id === 'rail')!.angleDeg).toBe(0);
    expect(stair.stairSketchTan).toBe(-0.5);
    expect(flat.stairSketchTan).toBeUndefined();
    expect(model.parts.find((p) => p.id === 'rail')!.angleDeg).toBe(0);
  });
});
