import { afterEach, describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { MODEL_MATERIALS, missingModelMaterials } from '../data/modelMaterials';
import { TERRACE_MATERIALS } from '../data/terraceMaterials';
import { SEED_SETTINGS } from '../data/seed';
import { withMaterialMass } from '../domain/models/materialMass';
import { materialPriceInUnit, materialUnitFactors, withMaterialUnits } from '../domain/models/materialUnits';
import { currentKgPrice, followsKgPrice, kgPriceGroupOf, kgPriceReport, withKgPrice, type KgPrice } from '../domain/pricing/kgPrice';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createProject } from '../domain/models/factories';
import type { FenceModelId, Material } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { useAppStore } from '../store/useAppStore';

const byId = new Map<string, Material>();
for (const m of [...SEED_MATERIALS, ...missingModelMaterials(SEED_MATERIALS), ...MODEL_MATERIALS, ...TERRACE_MATERIALS]) if (!byId.has(m.id)) byId.set(m.id, m);
const ALL = [...byId.values()].map(withMaterialUnits);
const KG: KgPrice = { priceRsd: 250, groups: ['tube', 'u'] };
const name = (n: string) => ALL.find((m) => m.name === n)!;

describe('jedna cena po kilogramu za cevi', () => {
  it('cevi i U profili su u grupama; stubovi, aluminijum i materijali za terase nisu', () => {
    expect(kgPriceGroupOf(name('Kvadratna cev 30×20×1'))).toBe('tube');
    expect(kgPriceGroupOf(name('Pravougaona cev 80×20×1'))).toBe('tube');
    expect(kgPriceGroupOf(name('Kvadratna cev 100×100×2'))).toBe('tube');
    expect(kgPriceGroupOf(name('U profil 20×20×1,35'))).toBe('u');
    expect(kgPriceGroupOf(name('U profil 60×20×2'))).toBe('u');
    for (const m of ALL.filter((x) => /stub/i.test(x.name) || x.terrace || /^mat_(bts|ter)_/.test(x.id))) expect(kgPriceGroupOf(m)).toBeNull();
  });

  it('provera računice za SVE materijale: cevi i U profili sa masom imaju tačno 250 RSD/kg, ostali materijali su netaknuti', () => {
    const problems: string[] = [];
    for (const m of ALL) {
      const next = withKgPrice(m, KG);
      if (!followsKgPrice(m, KG)) { if (next !== m) problems.push(`${m.name}: promenjen, a nije u grupi`); continue; }
      const f = materialUnitFactors(next).kg;
      if (!f) { if (next.unitPrice !== m.unitPrice) problems.push(`${m.name}: bez mase, a cena promenjena`); continue; }
      const perKg = materialPriceInUnit(next, 'kg');
      if (Math.abs(perKg - 250) > 0.01) problems.push(`${m.name}: ${perKg.toFixed(3)} RSD/kg`);
      const mass = withMaterialMass(next);
      // cena po metru = cena po kg × masa po metru
      if (next.unit === 'm' && mass.massUnit === 'kg/m' && Math.abs(next.unitPrice - 250 * mass.mass!) > 0.01) problems.push(`${m.name}: ${next.unitPrice} RSD/m, a treba ${250 * mass.mass!}`);
      if (!(next.unitPrice > 0)) problems.push(`${m.name}: cena ${next.unitPrice}`);
    }
    expect(problems).toEqual([]);
    const r = kgPriceReport(ALL, KG);
    expect(r.priced.length).toBeGreaterThan(5);
    // samo cevi ili samo U profili
    const onlyTubes = { ...KG, groups: ['tube'] as const } as KgPrice;
    expect(ALL.filter((m) => followsKgPrice(m, onlyTubes)).every((m) => kgPriceGroupOf(m) === 'tube')).toBe(true);
  });

  it('predlog početne cene: najčešća postojeća cena po kg', () => {
    const list = ['Kvadratna cev 30×20×1', 'Kvadratna cev 30×30×2', 'Kvadratna cev 80×80×3'].map((n) => withKgPrice(name(n), { priceRsd: 310, groups: ['tube'] }));
    expect(currentKgPrice(list, ['tube'])).toBe(310);
  });
});

describe('cena po kg u aplikaciji (Materijali i cene)', () => {
  const st = () => useAppStore.getState();
  const tube = () => st().materials.find((m) => m.name === 'Kvadratna cev 30×20×1')!;
  const post = () => st().materials.find((m) => /stub/i.test(m.name) && m.category === 'stub')!;
  afterEach(() => registerCustomModels([], []));
  const setup = () => useAppStore.setState({ ready: true, materials: ALL, settings: { ...SEED_SETTINGS, kgPrice: null } });

  it('promena cene po kg menja cene svih cevi; stub ostaje', () => {
    setup();
    const postPrice = post().unitPrice;
    st().setKgPrice({ priceRsd: 200, groups: ['tube', 'u'] });
    expect(materialPriceInUnit(tube(), 'kg')).toBeCloseTo(200, 2);
    st().setKgPrice({ priceRsd: 260, groups: ['tube', 'u'] });
    expect(materialPriceInUnit(tube(), 'kg')).toBeCloseTo(260, 2);
    expect(st().materials.filter((m) => followsKgPrice(m, st().settings.kgPrice) && materialUnitFactors(m).kg).every((m) => Math.abs(materialPriceInUnit(m, 'kg') - 260) < 0.01)).toBe(true);
    expect(post().unitPrice).toBe(postPrice);
  });

  it('nova cev i izmena mase prate cenu po kg; ručno upisana cena cevi se zamenjuje', () => {
    setup();
    st().setKgPrice({ priceRsd: 240, groups: ['tube'] });
    st().upsertMaterial({ ...tube(), unitPrice: 1 });
    expect(materialPriceInUnit(tube(), 'kg')).toBeCloseTo(240, 2);
    st().upsertMaterial({ ...tube(), mass: 2, massUnit: 'kg/m', massSource: 'manual' });
    expect(tube().unitPrice).toBeCloseTo(480, 2);
    st().upsertMaterial({ id: 'nova_cev', sku: 'X', name: 'Kvadratna cev 40×40×2', category: 'profil', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false });
    expect(materialPriceInUnit(st().materials.find((m) => m.id === 'nova_cev')!, 'kg')).toBeCloseTo(240, 2);
    // isključena cena po kg: cene ostaju poslednje izračunate i opet se menjaju ručno
    st().setKgPrice(null);
    st().upsertMaterial({ ...tube(), unitPrice: 500 });
    expect(tube().unitPrice).toBe(500);
  });

  it('obračun projekta: stavka cevi = nabavna količina × cena po kg × masa po metru', () => {
    setup();
    st().setKgPrice({ priceRsd: 220, groups: ['tube', 'u'] });
    const mats = st().materials;
    const kv = mats.find((m) => m.id === 'mat_kv_30x20')!;
    const model: CustomModel = { ...newCustomModel('cm_kg'), widthMm: 2000, heightMm: 1000, parts: [
      { id: 'a', materialId: 'mat_kv_30x20', x: 0, y: 100, lengthMm: 2000, angleDeg: 0, rot: 0, z: 0 },
      { id: 'b', materialId: 'mat_kv_30x20', x: 0, y: 500, lengthMm: 2000, angleDeg: 0, rot: 0, z: 0 },
    ] };
    registerCustomModels([model], mats);
    const line = buildBom(createProject('kg', [createFence({ modelId: model.id as FenceModelId, heightMm: 1000 })]), mats).find((l) => l.materialId === 'mat_kv_30x20')!;
    const kgPerM = withMaterialMass(kv).mass!;
    expect(line.unitPriceNet).toBeCloseTo(220 * kgPerM, 2);
    expect(line.total).toBeCloseTo(line.purchaseQty * 220 * kgPerM, 2);
  });
});
