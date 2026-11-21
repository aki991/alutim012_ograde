import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { SQUARE_GLASS_MATERIALS, withSquareGlassMaterials, withTerraceMaterials } from '../data/terraceMaterials';
import { customBom, newTerraceModel, resolveParts, type CustomModel, type CustomPart } from '../domain/models/custom';
import { hwDimsOf, materialDimFields, materialShape, materialShapeWith, solidsBounds } from '../domain/models/materialShape';
import { fillHardware, compatibleHardware } from '../domain/models/terraceHardware';
import { settleModel } from '../domain/models/settle';

const materials = withTerraceMaterials(MODEL_MATERIALS)!;
const bySku = (sku: string) => materials.find((m) => m.sku === sku)!;
const part = (id: string, sku: string, x: number, y: number, lengthMm: number, angleDeg = 0, extra: Partial<CustomPart> = {}): CustomPart => ({
  id, materialId: bySku(sku).id, x, y, lengthMm, angleDeg, rot: 0, z: 0, ...extra,
});
const glassFence = (): CustomModel => ({ ...newTerraceModel('Staklena ograda'), widthMm: 1200, heightMm: 1100, parts: [
  part('p1', 'P-1057', 100, 8, 1000, 90), part('p2', 'P-1057', 1100, 8, 1000, 90),
  part('rail', 'P-1072', 0, 1040, 1200, 0, { rot: 90 }),
  part('glass', 'TER-VSG-66', 140, 150, 920, 0, { heightMm: 750 }),
  ...[250, 800].flatMap((y, i) => [part(`clamp-l${i}`, 'AK-5205', 120, y, 0), part(`clamp-r${i}`, 'AK-5205', 1080, y, 0, 180)]),
] });

describe('kvadratni sistem staklene ograde', () => {
  it('dopunjava komplet bez dodavanja stakla, duplikata i izmene postojećih cena', () => {
    const glass = { ...bySku('TER-VSG-66'), unitPrice: 13500 };
    const post = { ...bySku('P-1057'), id: 'moj-stub', sku: ' p-1057 ', name: 'Moj stub 40×40×2', unitPrice: 1900, terrace: false };
    const next = withSquareGlassMaterials([glass, post])!;
    expect(next.find((m) => m.id === post.id)).toMatchObject({ name: post.name, unitPrice: 1900, terrace: true });
    expect(next.filter((m) => m.sku.trim().toUpperCase() === 'P-1057')).toHaveLength(1);
    expect(next.filter((m) => m.category === 'staklo')).toEqual([glass]);
    expect(next).toHaveLength(SQUARE_GLASS_MATERIALS.length + 1);
    expect(withSquareGlassMaterials(next)).toBeNull();
    expect(SQUARE_GLASS_MATERIALS.every((m) => m.terrace && m.unit !== 'm2')).toBe(true);
  });

  it('stub i rukohvat su pravougaoni profili, a stopa, nosač i završeci ravni komadni delovi', () => {
    for (const sku of ['P-1057', 'P-1633', 'P-1072', 'P-1634']) {
      const shape = materialShape(bySku(sku));
      expect(shape.type).toBe('linear');
      expect(shape.type === 'linear' && shape.section.round).not.toBe(true);
    }
    for (const sku of ['AK-5200', 'AK-5141', 'AK-5126', 'AK-5125', 'AK-5134', 'AK-5104']) {
      const shape = materialShape(bySku(sku));
      expect(shape.type).toBe('piece');
      expect(shape.type === 'piece' && shape.solids.every((s) => s.prim === 'box')).toBe(true);
    }
    const dims = hwDimsOf({ connectorH: 45, capH: 12, plateH: 10 });
    const connector = materialShapeWith(bySku('AK-5126'), dims);
    expect(connector.type === 'piece' && solidsBounds(connector.solids).y1).toBe(45);
    const cap = materialShapeWith(bySku('AK-5134'), dims);
    expect(cap.type === 'piece' && solidsBounds(cap.solids).y1).toBe(12);
  });

  it('čeljusti držača ostavljaju stvaran otvor za izabranu debljinu stakla', () => {
    for (const sku of ['AK-5105', 'AK-5205']) {
      const material = { ...bySku(sku), dims: { glassT: 17.52, clampW: 45, clampH: 55 } };
      const shape = materialShape(material);
      expect(shape.type).toBe('piece');
      if (shape.type !== 'piece') continue;
      const jaws = shape.solids.filter((s) => s.prim === 'box' && s.size[1] === 55);
      expect(jaws).toHaveLength(2);
      for (const jaw of jaws) if (jaw.prim === 'box') expect(Math.abs(jaw.pos[2]) - jaw.size[2] / 2).toBeCloseTo(17.52 / 2, 6);
      expect(solidsBounds(shape.solids).x1).toBe(45);
      expect(materialDimFields(material).find((f) => f.key === 'glassT')?.value).toBe(17.52);
    }
  });

  it('Dopuni okov bira kvadratnu stopu, kapu, nosač i završetke; obračun uključuje četiri držača i postojeće staklo', () => {
    const original = glassFence();
    const picks = fillHardware(original, materials);
    expect(picks.parts.find((p) => p.id === 'p1')?.hwPick).toMatchObject({
      flange: bySku('AK-5200').id, postCap: bySku('AK-5134').id, connector: bySku('AK-5126').id,
    });
    expect(compatibleHardware('flange', original.parts[0], original, materials).some((m) => m.sku === 'AK-5107')).toBe(false);
    const model = settleModel(picks, materials, false).model;
    expect(model.parts.find((p) => p.id === 'rail')?.y).toBe(1008 + 14 + 30 + 12.5);
    const caps = resolveParts(model, materials).filter((p) => p.part.hw?.kind === 'railCap');
    expect(caps).toHaveLength(2);
    for (const cap of caps) expect(cap.shape.type === 'piece' && solidsBounds(cap.shape.solids).y1).toBe(13.5);
    const bom = customBom(model, materials);
    const count = (sku: string) => bom.find((row) => row.sku === sku)?.count;
    expect(count('AK-5205')).toBe(4);
    expect(count('AK-5126')).toBe(2);
    expect(count('AK-5200')).toBe(2);
    expect(count('BTS-VT75100')).toBe(6);
    expect(count('BTS-VP4219')).toBe(6);
    expect(bom.find((row) => row.sku === 'TER-VSG-66')?.qty).toBeCloseTo(0.69, 6);
    expect(settleModel(model, materials, false).model).toEqual(model);
  });
});
