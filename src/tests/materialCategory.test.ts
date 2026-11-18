import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { loadAll, saveAll, wipeAll } from '../db';
import { withMaterialCategory } from '../domain/models/materialCategory';
import { excludesMaterialMass, withMaterialMass } from '../domain/models/materialMass';
import type { Material } from '../domain/models/types';
import { applyImport, materialsToRows, planImport } from '../domain/pricing/materialsIo';
import { useAppStore } from '../store/useAppStore';

const mat = (name: string, extra: Partial<Material> = {}): Material => ({ id: `part-${name}`, sku: '', name, category: 'okov', unit: 'kom', unitPrice: 1234.56, wastePercent: 0, demo: false, ...extra });

describe('kategorije i masa završnih i spojnih delova', () => {
  it.each(['Kapa pismo 80×80', 'Kapa ravna 60×20', 'Rozetna 80×80', 'Čep tarabice pun 80×20', 'Čep za U profil za jednu masku', 'Završetak rukohvata Ø50', 'Maska flanše Ø40'])('%s dobija kategoriju Kape i završeci i procenu po komadu', (name) => {
    const old = mat(name); const next = withMaterialMass(old);
    expect(next.category).toBe('zavrsetak');
    expect(next.massUnit).toBe('kg/kom');
    expect(next.massSource).toBe('estimated');
    expect(next.mass).toBeGreaterThan(0);
    expect(next.massReference).toContain('usvojene');
    expect([next.id, next.sku, next.name, next.unit, next.unitPrice, next.wastePercent]).toEqual([old.id, old.sku, old.name, old.unit, old.unitPrice, old.wastePercent]);
  });

  it.each(['Spoljna stopa 80×80', 'Bočna stopa 30×30', 'Spojnica rukohvata Ø50', 'Veza stub Ø40 – rukohvat Ø50', 'Obujmica stuba Ø40', 'Stezaljka stakla', 'Koleno rukohvata Ø50', 'Nepoznat spojni deo'])('%s dobija kategoriju Stope i spojni elementi i masu', (name) => {
    const next = withMaterialMass(mat(name));
    expect(next).toMatchObject({ category: 'montaza', massUnit: 'kg/kom', massSource: 'estimated' });
    expect(next.mass).toBeGreaterThan(0);
  });

  it.each(['Brava', 'Kvaka', 'Cilindar', 'Šarka standardna', 'Vertikalni zasun', 'Rozetna za kvaku', 'Prihvatnik brave', 'Vijak M8', 'Motor kapije', 'Kolica za kliznu kapiju'])('%s ostaje okov bez mase', (name) => {
    const next = withMaterialMass(mat(name));
    expect(next.category).toBe('okov');
    expect(excludesMaterialMass(next)).toBe(true);
    expect(next.mass).toBeUndefined();
  });

  it('kontinuirana maskica i profil za bravu ostaju profili sa kg/m; staklo ostaje izuzeto', () => {
    expect(withMaterialMass(mat('Maskica 22,5×6×1', { unit: 'm', category: 'profil', sku: 'KU000004' }))).toMatchObject({ category: 'profil', massUnit: 'kg/m' });
    expect(withMaterialCategory(mat('Aluminijumski profil za bravu 40×20×2', { unit: 'm' })).category).toBe('profil');
    expect(excludesMaterialMass(mat('Aluminijumski profil za bravu 40×20×2', { unit: 'm', category: 'profil' }))).toBe(false);
    expect(withMaterialCategory(mat('Staklo kaljeno 8 mm', { category: 'staklo' })).category).toBe('staklo');
  });

  it('oduzima šupljine kapa i rozeta, razlikuje pun i šupalj čep i bočne stope', () => {
    const pismo = withMaterialMass(mat('Kapa pismo 80×80'));
    const flat = withMaterialMass(mat('Kapa ravna 80×80'));
    expect(pismo.mass).toBeGreaterThan(flat.mass!);
    expect(pismo.mass).toBeLessThan(0.2);
    const rosette = withMaterialMass(mat('Rozetna 80×80'));
    expect(rosette.mass).toBeCloseTo(((124 * 124 - 82 * 82) * 2 + (124 * 124 - 120 * 120) * 16) * 0.0000027, 12);
    expect(withMaterialMass(mat('Čep tarabice pun 80×20')).mass).toBeGreaterThan(withMaterialMass(mat('Čep tarabice šuplji 80×20')).mass!);
    expect(withMaterialMass(mat('Bočna stopa 80×80')).mass).not.toBe(withMaterialMass(mat('Spoljna stopa 80×80')).mass);
    expect(withMaterialMass(mat('Kapa pismo 80×80', { wallMm: 1 })).mass).toBeLessThan(pismo.mass!);
    expect(withMaterialMass(mat('Plastična kapa 80×80')).mass).toBeLessThan(flat.mass!);
  });

  it('izvoz i ponovni uvoz razumeju nove kategorije i zadržavaju cenu', () => {
    const cap = withMaterialMass(mat('Kapa pismo 80×80', { sku: 'CAP80' }));
    const rows = materialsToRows([cap]);
    expect(rows[1][1]).toBe('Kape i završeci');
    const doc = rows.map((r) => r.map(String));
    doc[0].push('Šifra'); doc[1].push(cap.sku);
    const imported = applyImport([], planImport([], doc, true));
    expect(imported[0]).toMatchObject({ category: 'zavrsetak', unit: 'kom', unitPrice: 1234.56 });
  });

  it('stari materijal se automatski prekategoriše i upisuje; ručno potvrđena masa preživljava ponovno učitavanje', async () => {
    await wipeAll();
    const old = mat('Kapa pismo 80×80', { sku: 'CAP80' });
    await saveAll({ ...createSeedData(), materials: [old] });
    await useAppStore.getState().init();
    const stored = (await loadAll()).materials.find((m) => m.id === old.id)!;
    expect(stored).toMatchObject({ category: 'zavrsetak', massUnit: 'kg/kom', unitPrice: old.unitPrice });
    expect(stored.mass).toBeGreaterThan(0);
    const manual = withMaterialMass({ ...old, mass: 0.123456789, massUnit: 'kg/kom', massSource: 'manual' });
    expect(manual).toMatchObject({ category: 'zavrsetak', mass: 0.123456789, massSource: 'manual' });
    await saveAll({ ...createSeedData(), materials: [manual] });
    await useAppStore.getState().init();
    expect(useAppStore.getState().materials.find((m) => m.id === old.id)).toMatchObject({ mass: 0.123456789, category: 'zavrsetak', massSource: 'manual' });
  });
});
