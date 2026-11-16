import { afterEach, describe, expect, it } from 'vitest';
import { colorHex } from '../domain/models/catalog';
import { newCustomModel, partHex, resolveParts, scaleModel, setPartsColor, type CustomModel } from '../domain/models/custom';
import { customPartsFor, registerCustomModels } from '../domain/models/customRegistry';
import type { Material } from '../domain/models/types';

const mat = (id: string, name: string): Material => ({ id, sku: id, name, unit: 'm', category: 'profil', unitPrice: 100, wastePercent: 0, demo: false });
const kv = mat('m_kv', 'Kvadratna cev 40×40×2');
const u = mat('m_u', 'U profil 60×28×2');
const ral = mat('m_ral', 'Lajsna RAL 9010 20×2');
const MATS = [kv, u, ral];
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number) => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
const MODEL: CustomModel = {
  ...newCustomModel('cm_color'), name: 'Ram i prečke', widthMm: 1000, heightMm: 1000, color: 'RAL 7016',
  parts: [part('ram1', kv.id, 0, 0, 1000, 0), part('ram2', kv.id, 0, 960, 1000, 0), part('u1', u.id, 50, 40, 900, 90), part('b1', kv.id, 100, 500, 800, 0), part('l1', ral.id, 0, 300, 1000, 0)],
};

afterEach(() => registerCustomModels([], []));

describe('boja pojedinačnih delova modela', () => {
  it('izabrani delovi dobijaju svoju boju, ostali ostaju u boji modela', () => {
    const black = setPartsColor(MODEL, ['ram1', 'ram2'], 'RAL 9005');
    const grey = setPartsColor(black, ['u1', 'b1'], 'RAL 7035');
    const hex = new Map(resolveParts(grey, MATS).map((r) => [r.part.id, r.hex]));
    expect(hex.get('ram1')).toBe(colorHex('RAL 9005'));
    expect(hex.get('ram2')).toBe(colorHex('RAL 9005'));
    expect(hex.get('u1')).toBe(colorHex('RAL 7035'));
    expect(hex.get('b1')).toBe(colorHex('RAL 7035'));
    // deo bez sopstvene boje: RAL iz naziva materijala, inače boja modela
    expect(hex.get('l1')).toBe(colorHex('RAL 9010'));
    expect(grey.parts.find((p) => p.id === 'ram1')?.color).toBe('RAL 9005');
  });

  it('sopstvena boja ima prednost nad RAL oznakom iz naziva; „Boja modela“ briše sopstvenu boju', () => {
    const m = setPartsColor(MODEL, ['l1'], 'RAL 3000');
    expect(resolveParts(m, MATS).find((r) => r.part.id === 'l1')?.hex).toBe(colorHex('RAL 3000'));
    const back = setPartsColor(m, ['l1'], null);
    expect(back.parts.find((p) => p.id === 'l1')).not.toHaveProperty('color');
    expect(partHex(kv, MODEL, {})).toBe(colorHex('RAL 7016'));
  });

  it('promena boje modela ne menja delove sa sopstvenom bojom', () => {
    const m = { ...setPartsColor(MODEL, ['ram1'], 'RAL 9005'), color: 'RAL 9010' };
    const hex = new Map(resolveParts(m, MATS).map((r) => [r.part.id, r.hex]));
    expect(hex.get('ram1')).toBe(colorHex('RAL 9005'));
    expect(hex.get('b1')).toBe(colorHex('RAL 9010'));
  });

  it('boja dela se vidi i u projektu (boja polja menja samo delove bez sopstvene boje) i posle razvlačenja', () => {
    const m = setPartsColor(MODEL, ['ram1', 'ram2'], 'RAL 9005');
    expect(scaleModel(m, 2000, 1200).parts.find((p) => p.id === 'ram1')?.color).toBe('RAL 9005');
    registerCustomModels([m], MATS);
    const parts = customPartsFor(m.id, 2000, 1000, colorHex('RAL 7035'));
    const hex = new Map(parts.map((r) => [r.part.id, r.hex]));
    expect(hex.get('ram1')).toBe(colorHex('RAL 9005'));
    expect(hex.get('b1')).toBe(colorHex('RAL 7035'));
  });
});
