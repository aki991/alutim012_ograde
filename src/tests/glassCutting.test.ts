import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { createFence, createProject } from '../domain/models/factories';
import { newTerraceModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels, terraceEvaluated } from '../domain/models/customRegistry';
import { buildCuttingList } from '../domain/pricing/cutting';
import { buildCutList } from '../domain/pricing/production';
import { buildGlassCutPieces, glassPolygon } from '../domain/pricing/glassCutting';
import { glassCutSvg } from '../services/glassCutSvg';

const materials = withTerraceMaterials(MODEL_MATERIALS)!;
const bySku = (sku: string) => materials.find((m) => m.sku === sku)!;
const model = (): CustomModel => ({ ...newTerraceModel('Staklo'), id: 'cm_cut_glass', widthMm: 1200, heightMm: 1000,
  parts: [100, 1100].map((x, i) => ({ id: `post${i}`, materialId: bySku('P-1057').id, x, y: 0, lengthMm: 1000, angleDeg: 90, rot: 0, z: 0 })),
  glassRailing: { clampMaterialId: bySku('AK-5205').id, glassMaterialId: bySku('TER-VSG-66').id },
});
const project = (rise = 0, toleranceMm?: number) => {
  const m = model();
  registerCustomModels([{ ...m, glassRailing: { ...m.glassRailing!, toleranceMm } }], materials, []);
  return createProject('Krojna stakla', [createFence({ modelId: 'cm_cut_glass', widthMm: 1200, heightMm: 1000, ...(rise ? { stair: { riseMm: rise, steps: 4, group: 's' } } : {}) })]);
};

describe('staklo u krojnoj listi', () => {
  it('ravna tabla ima tačne mere i četiri prava ugla, bez ulaska u plan šipki', () => {
    const p = project();
    const list = buildCuttingList(p, undefined, materials);
    expect(list.glass).toHaveLength(1);
    const glass = list.glass[0];
    expect(glass.edgesMm).toEqual([920, 800, 920, 800]);
    expect(glass.anglesDeg).toEqual([90, 90, 90, 90]);
    expect(glass.areaM2).toBeCloseTo(0.736, 8);
    expect(glass.thicknessMm).toBe(12.76);
    expect(list.profiles.some((row) => row.profile.includes('Staklo'))).toBe(false);
    expect(buildCutList(p, undefined, materials).filter((row) => row.glass)).toHaveLength(1);
  });
  it.each([600, -600])('stepenište %s mm: kose ivice, sve četiri mere i uglovi odgovaraju smicanju na crtežu', (rise) => {
    const glass = buildGlassCutPieces(project(rise), materials)[0];
    expect(glass.edgesMm[0]).toBeCloseTo(Math.hypot(920, 460), 8);
    expect(glass.edgesMm[2]).toBeCloseTo(glass.edgesMm[0], 8);
    expect(glass.edgesMm[1]).toBe(800); expect(glass.edgesMm[3]).toBe(800);
    const deg = Math.atan(0.5) * 180 / Math.PI;
    expect(glass.anglesDeg[0]).toBeCloseTo(90 - Math.sign(rise) * deg, 8);
    expect(glass.anglesDeg[1]).toBeCloseTo(90 + Math.sign(rise) * deg, 8);
    expect(glass.anglesDeg.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 8);
    expect(glass.heightMm).toBeCloseTo(1260, 8);
    expect(glass.areaM2).toBeCloseTo(0.736, 8);
    expect(glassCutSvg(glass)).toContain('1.028,6');
  });
  it('zasebne table ostaju zasebne na različitim pozicijama i poštuju opseg štampe', () => {
    const p = project(600);
    p.items.push(createFence({ modelId: 'cm_cut_glass', widthMm: 1200, heightMm: 1000, stair: { riseMm: -600 } }));
    p.posts.push({ ...p.posts[0], id: 'new-end' });
    expect(buildCuttingList(p, undefined, materials).glass.map((g) => [g.id, Math.sign(g.slopeDeg)])).toEqual([['G1.1', 1], ['G2.1', -1]]);
    expect(buildCuttingList(p, undefined, materials, { stockMm: 6000, kerfMm: 3, scope: 'gates' }).glass).toHaveLength(0);
  });
  it('četvorougao sa kosom donjom ivicom čuva stvarnu površinu i različite bočne ivice', () => {
    const shape = glassPolygon([[0, 0], [1000, 100], [1000, 800], [0, 800]]);
    expect(shape.edgesMm[1]).toBe(700); expect(shape.edgesMm[3]).toBe(800);
    expect(shape.areaM2).toBe(0.75);
    expect(shape.anglesDeg.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 8);
  });

  it.each([0, 600, -600])('tolerancija 2 mm skraćuje širinu, a čuva visinu ravnog i kosog stakla, nagib %s', (rise) => {
    const nominal = buildGlassCutPieces(project(rise), materials)[0];
    const p = project(rise, 2);
    const cut = buildCuttingList(p, undefined, materials).glass[0];
    cut.edgesMm.forEach((edge, i) => expect(nominal.edgesMm[i] - edge).toBeCloseTo(i % 2 === 0 ? 2 : 0, 2));
    cut.anglesDeg.forEach((angle, i) => expect(angle).toBeCloseTo(nominal.anglesDeg[i], 8));
    const factor = Math.hypot(1, rise / 1200);
    expect(cut.areaM2).toBeCloseTo((920 - 2 / factor) * 800 / 1e6, 6);
    const priced = terraceEvaluated('cm_cut_glass', 1200, 1000, undefined, factor)!;
    expect(priced.find((r) => r.part.materialId === bySku('TER-VSG-66').id)?.qty).toBeCloseTo(cut.areaM2, 3);
  });

  it('tolerancija konkretnog polja važi u krojnoj listi, uključujući izričitu nulu', () => {
    const p = project(600, 2);
    if (p.items[0].kind !== 'fence') throw new Error('Očekivana ograda');
    p.items[0].params.slats = { glassToleranceMm: 4 };
    const cut = buildGlassCutPieces(p, materials)[0];
    expect(cut.edgesMm[0]).toBeCloseTo(Math.hypot(920, 460) - 4, 2);
    expect(cut.edgesMm[1]).toBeCloseTo(800, 8);
    p.items[0].params.slats.glassToleranceMm = 0;
    const reset = buildGlassCutPieces(p, materials)[0];
    expect(reset.edgesMm[0]).toBeCloseTo(Math.hypot(920, 460), 8);
    expect(reset.edgesMm[1]).toBe(800);
  });
});
