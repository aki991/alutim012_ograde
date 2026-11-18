import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { TERRACE_MATERIALS } from '../data/terraceMaterials';
import { loadAll, saveAll, wipeAll } from '../db';
import { createDemoProject } from '../domain/models/factories';
import { materialMassBasis } from '../domain/models/materialMass';
import { materialBaseUnit, materialPriceInUnit, materialPriceToBase, materialPriceUnits, selectMaterialPriceUnit, selectedPriceUnit, withMaterialUnits } from '../domain/models/materialUnits';
import type { Material } from '../domain/models/types';
import { computePrice } from '../domain/pricing/calc';
import { applyImport, materialsToRows, planImport } from '../domain/pricing/materialsIo';
import { useAppStore } from '../store/useAppStore';
import { SEED_MATERIALS } from './fixtures/materials';

const mat = (name = 'Cev 20×20×2', extra: Partial<Material> = {}): Material => withMaterialUnits({ id: 'unit-test', sku: 'UNIT20', name, category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: false, ...extra });

describe('smislene jedinice i cena za istu količinu materijala', () => {
  it('cev 0,3888 kg/m: 100 RSD/m daje 257,20 RSD/kg, bez gubitka osnovne cene pri ponavljanju izbora', () => {
    const m = mat();
    expect(materialPriceUnits(m)).toEqual(['m', 'kg']);
    expect(materialPriceInUnit(m, 'kg')).toBeCloseTo(100 / 0.3888, 12);
    let selected = m;
    for (let i = 0; i < 100; i++) selected = selectMaterialPriceUnit(selectMaterialPriceUnit(selected, 'kg'), 'm');
    expect(selected.unitPrice).toBe(100);
    expect(selected.unit).toBe('m');
    expect(materialPriceToBase(selectMaterialPriceUnit(m, 'kg'), 300)).toBeCloseTo(116.64, 12);
  });

  it('lim 2 mm: cena 540 RSD/m² daje 100 RSD/kg; kapu vezuje za komad', () => {
    const sheet = mat('Aluminijumski lim 2 mm', { category: 'panel', unit: 'm2', unitPrice: 540 });
    expect(materialPriceUnits(sheet)).toEqual(['m2', 'kg']);
    expect(materialPriceInUnit(sheet, 'kg')).toBe(100);
    const cap = mat('Kapa pismo 80×80', { category: 'zavrsetak', unit: 'kom', unitPrice: 50, mass: 0.1, massUnit: 'kg/kom', massSource: 'manual' });
    expect(materialPriceUnits(cap)).toEqual(['kom', 'kg']);
    expect(materialPriceInUnit(cap, 'kg')).toBe(500);
  });

  it('poznata šipka i format ploče nude komad; procenjena dužina ga ne otključava', () => {
    const bar = mat('Cev 20×20×2, šipka 6 m');
    expect(materialPriceUnits(bar)).toEqual(['m', 'kom', 'kg']);
    expect(materialPriceInUnit(bar, 'kom')).toBe(600);
    expect(materialPriceUnits(mat('Cev 20×20×2'))).not.toContain('kom');
    const plate = mat('Aluminijumska ploča 2000×1000×2', { category: 'panel', unit: 'm2', unitPrice: 540 });
    expect(materialPriceInUnit(plate, 'kom')).toBe(1080);
    expect(materialPriceUnits(plate)).toEqual(['m2', 'kom', 'kg']);
  });

  it('poznat set od 2 dela: 100 RSD/set daje 50 RSD/kom i 500 RSD/kg za set mase 0,2 kg', () => {
    const set = mat('Završeci, levi i desni', { category: 'zavrsetak', unit: 'set', mass: 0.2, massUnit: 'kg/kom', massSource: 'manual' });
    expect(materialPriceUnits(set)).toEqual(['set', 'kom', 'kg']);
    expect(materialPriceInUnit(set, 'kom')).toBe(50);
    expect(materialPriceInUnit(set, 'kg')).toBe(500);
    expect(materialPriceUnits(mat('Juliet set J100', { unit: 'set', category: 'montaza' }))).not.toContain('kom');
  });

  it('brava i staklo ne nude kg; nosač i profil za staklo ne postaju ploče', () => {
    expect(materialPriceUnits(mat('Brava standardna', { category: 'okov', unit: 'kom' }))).toEqual(['kom']);
    expect(materialPriceUnits(mat('Kaljeno staklo 8 mm', { category: 'staklo', unit: 'm2' }))).toEqual(['m2']);
    expect(materialPriceUnits(mat('Staklo kaljeno 2000×1000×8', { category: 'staklo', unit: 'm2' }))).toEqual(['m2', 'kom']);
    expect(materialBaseUnit(mat('Nosač stakla', { unit: 'kom', category: 'montaza' }))).toBe('kom');
    expect(materialPriceUnits(mat('Spigot za staklo 50×140', { unit: 'kom', category: 'montaza' }))).not.toContain('m2');
    expect(materialBaseUnit(mat('U profil za staklo 46×125', { unit: 'm' }))).toBe('m');
    expect(materialBaseUnit(mat('Flanša Ø40 sa pločom i ankerom', { unit: 'kom', category: 'okov' }))).toBe('kom');
  });

  it('opravlja stare nelogične jedinice; kad je poznata dužina preračunava cenu bez promene vrednosti šipke', () => {
    const wrongCap = mat('Kapa ravna 80×80', { unit: 'm', category: 'zavrsetak', unitPrice: 50 });
    expect(wrongCap).toMatchObject({ unit: 'kom', unitPrice: 50, unitCorrection: { from: 'm', to: 'kom', originalPrice: 50 } });
    const bar = mat('Cev 20×20×2, šipka 6 m', { unit: 'kom', unitPrice: 600 });
    expect(bar).toMatchObject({ unit: 'm', unitPrice: 100, priceUnit: 'kom' });
    expect(materialPriceInUnit(bar)).toBe(600);
    const byKg = mat('Cev 20×20×2', { unit: 'kg', unitPrice: 300 });
    expect(byKg.unitPrice).toBeCloseTo(116.64, 12);
    expect(selectedPriceUnit(byKg)).toBe('kg');
    expect(withMaterialUnits(byKg)).toBe(byKg);
  });

  it('svi materijali lokalnih definicija već imaju odgovarajuće fizičke jedinice', () => {
    for (const m of [...MODEL_MATERIALS, ...TERRACE_MATERIALS]) expect(materialBaseUnit(m), m.name).toBe(m.unit);
  });

  it('izbor kg na svim dostupnim materijalima ne menja cenu ni količine projekta', () => {
    const p = createDemoProject(null);
    const original = SEED_MATERIALS.map(withMaterialUnits);
    const next = original.map((m) => selectMaterialPriceUnit(m, 'kg'));
    expect(computePrice(p, next)).toEqual(computePrice(p, original));
  });

  it('CSV prikazuje izabranu jedinicu, a uvoz pravilno vraća cenu i procenjenu/ručnu masu', () => {
    for (const source of ['manual', 'estimated'] as const) {
      const m = selectMaterialPriceUnit(mat('Specijalni profil 80×20', { mass: 1.23456789, massUnit: 'kg/m', massSource: 'manual' }), 'kg');
      m.massSource = source;
      m.massBasis = materialMassBasis(m);
      const rows = materialsToRows([m]).map((r) => r.map(String));
      expect(rows[1][2]).toBe('kg');
      expect(Number(rows[1][3].replace(',', '.'))).toBeCloseTo(100 / 1.23456789, 12);
      expect(planImport([m], rows).counts.same).toBe(1);
      rows[0].push('Šifra'); rows[1].push(m.sku);
      const added = applyImport([], planImport([], rows, true))[0];
      expect(added.unit).toBe('m');
      expect(added.mass).toBe(1.23456789);
      expect(added.massSource).toBe(source);
      expect(added.unitPrice).toBeCloseTo(100, 12);
      expect(selectedPriceUnit(added)).toBe('kg');
    }
  });

  it('uvoz nove cene po kg se prevodi u cenu po metru; nepoveziva jedinica se odbija', () => {
    const m = mat();
    const p = planImport([m], `Šifra;Cena;Jedinica\n${m.sku};300;kg`);
    expect(p.counts.changed).toBe(1);
    expect(p.rows[0].result?.unitPrice).toBeCloseTo(116.64, 12);
    expect(p.rows[0].result?.priceUnit).toBe('kg');
    expect(planImport([m], `Šifra;Cena;Jedinica\n${m.sku};300;m2`).counts.error).toBe(1);
    const stock = planImport([m], `Šifra;Cena;Jedinica\n${m.sku};600;6m`);
    expect(stock.rows[0].result?.stockLengthM).toBe(6);
    expect(stock.rows[0].result?.unitPrice).toBe(100);
  });

  it('izbor i izmenjena cena po kg ostaju sačuvani posle novog učitavanja baze', async () => {
    await wipeAll();
    let m = selectMaterialPriceUnit(mat(), 'kg');
    m = { ...m, unitPrice: materialPriceToBase(m, 300) };
    await saveAll({ ...createSeedData(), materials: [m] });
    await useAppStore.getState().init();
    const stored = (await loadAll()).materials.find((x) => x.id === m.id)!;
    expect(stored.unit).toBe('m');
    expect(selectedPriceUnit(stored)).toBe('kg');
    expect(materialPriceInUnit(stored)).toBeCloseTo(300, 12);
    expect(stored.unitPrice).toBeCloseTo(116.64, 12);
  });
});
