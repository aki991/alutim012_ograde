import { afterEach, describe, expect, it } from 'vitest';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import { extraSpecKey, specFor, type ModelSpecs, type SpecPart } from '../domain/models/spec';
import type { FenceModelId, Material } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildMaterialList, materialListRows, materialQtyText } from '../domain/pricing/materialList';

const mat = (id: string, sku: string, name: string, unit: Material['unit'], unitPrice: number): Material => ({ id, sku, name, unit, category: unit === 'm' ? 'profil' : 'okov', unitPrice, wastePercent: 0, demo: false });
const kv = mat('m_kv', 'KV000007', 'Kvadratna cev 80×20×1 mm', 'm', 300);
const screw = mat('m_vijak', 'V-001', 'Vijak 4,8×19 inox', 'kom', 5);
const MATS = [kv, screw];

const MODEL: CustomModel = {
  ...newCustomModel('cm_mat'), name: 'Moja ograda', widthMm: 1000, heightMm: 1000,
  parts: [{ id: 's1', materialId: kv.id, x: 100, y: 50, lengthMm: 900, angleDeg: 90, rot: 0, z: 0 }],
};
const ID = MODEL.id as FenceModelId;

const extra = (qty: string): SpecPart => ({ id: 'sp_extra', name: 'Vijak', materialId: screw.id, group: 'Vijci', qty, enabled: true });
const project = () => createProject('Probni', [createFence({ modelId: ID, widthMm: 1000, heightMm: 1000 }), createFence({ modelId: ID, widthMm: 1000, heightMm: 1000 })]);

afterEach(() => registerCustomModels([], []));

describe('sastavnica nacrtanog modela: dodat materijal', () => {
  it('dodat materijal ulazi u sastavnicu modela i u ukupan spisak materijala projekta', () => {
    registerCustomModels([MODEL], MATS);
    const specs = { [extraSpecKey(ID)]: [extra('8')] } as ModelSpecs;
    expect(specFor(ID, specs).some((p) => p.materialId === screw.id)).toBe(true);
    expect(specFor(ID, undefined).some((p) => p.materialId === screw.id)).toBe(false);

    const bom = buildBom(project(), MATS, specs);
    // dva polja × 8 vijaka
    expect(bom.find((l) => l.materialId === screw.id)?.geometricQty).toBe(16);
    expect(buildBom(project(), MATS, undefined).some((l) => l.materialId === screw.id)).toBe(false);
  });

  it('izmena crteža ne briše dodat materijal (čuva se odvojeno od delova crteža)', () => {
    registerCustomModels([MODEL], MATS);
    const specs = { [extraSpecKey(ID)]: [extra('2')] } as ModelSpecs;
    const longer: CustomModel = { ...MODEL, parts: [...MODEL.parts, { id: 's2', materialId: kv.id, x: 300, y: 50, lengthMm: 900, angleDeg: 90, rot: 0, z: 0 }] };
    registerCustomModels([longer], MATS);
    const bom = buildBom(project(), MATS, specs);
    expect(bom.find((l) => l.materialId === screw.id)?.geometricQty).toBe(4);
    expect(bom.find((l) => l.materialId === kv.id)?.geometricQty).toBeCloseTo(2 * 2 * 0.9, 6);
  });

  it('spisak materijala projekta: grupisan, bez cena i bez paušalnog sitnog materijala', () => {
    registerCustomModels([MODEL], MATS);
    const specs = { [extraSpecKey(ID)]: [extra('8')] } as ModelSpecs;
    const groups = buildMaterialList(project(), MATS, specs);
    const lines = groups.flatMap((g) => g.lines);
    expect(lines.find((l) => l.sku === 'V-001')).toMatchObject({ unit: 'kom', needed: 16, purchase: 16 });
    expect(groups.find((g) => g.group === 'Vijci')?.lines.map((l) => l.sku)).toContain('V-001');
    expect(lines.some((l) => /Dodatni sitni materijal/.test(l.name))).toBe(false);
    const rows = materialListRows(project(), 'Petrović', groups);
    expect(rows[1]).toEqual(['Projekat', 'Probni']);
    expect(rows[2]).toEqual(['Kupac', 'Petrović']);
    // materijal se razlikuje po nazivu: tabela nema kolonu šifre
    expect(rows.find((r) => r[1] === 'Vijak 4,8×19 inox')).toEqual(['Vijci', 'Vijak 4,8×19 inox', 'kom', '16', '16']);
  });

  it('količina za prikaz: komadi celi, ostalo na dve decimale sa zarezom', () => {
    expect(materialQtyText(15.6, 'kom')).toBe('16');
    expect(materialQtyText(3.456, 'm')).toBe('3,46');
  });
});
