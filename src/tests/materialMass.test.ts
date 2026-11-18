import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSeedData } from '../data/seed';
import { DEFAULT_PLATES, DEFAULT_RAILS, MODEL_MATERIALS } from '../data/modelMaterials';
import { TERRACE_MATERIALS } from '../data/terraceMaterials';
import { loadAll, saveAll, wipeAll } from '../db';
import { createDemoProject } from '../domain/models/factories';
import { excludesMaterialMass, formatMaterialMass, withMaterialMass } from '../domain/models/materialMass';
import type { Material } from '../domain/models/types';
import { computePrice } from '../domain/pricing/calc';
import { applyImport, planImport } from '../domain/pricing/materialsIo';
import { useAppStore } from '../store/useAppStore';
import { SEED_MATERIALS } from './fixtures/materials';

const mat = (name: string, extra: Partial<Material> = {}): Material => ({ id: 'mass-test', sku: '', name, category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: false, ...extra });

describe('masa aluminijumskog materijala', () => {
  it('čuva punu preciznost; cev 20×20×2 prikazuje 0,389 kg/m i za šipku od 6 m', () => {
    const m = withMaterialMass(mat('Kvadratna cev 20×20×2 mm, šipka 6 m', { unit: 'kom' }));
    expect(m.mass).toBeCloseTo(0.3888, 12);
    expect(m.mass).not.toBe(0.389);
    expect(m.mass! * 6).toBeCloseTo(2.3328, 12);
    expect(formatMaterialMass(m)).toBe('0,389 kg/m');
    expect(withMaterialMass(m)).toBe(m);
  });

  it('računa pravougaone cevi; nedostajuća ili nemoguća debljina se zamenjuje označenom procenom', () => {
    expect(withMaterialMass(mat('Pravougaona cev 60×40×3')).mass).toBeCloseTo(1.5228, 12);
    expect(withMaterialMass(mat('Cev 20×20', { wallMm: 2 })).mass).toBeCloseTo(0.3888, 12);
    const m = withMaterialMass(mat('Cev 20×20×2'));
    expect(withMaterialMass({ ...m, dims: { a: 40, b: 20 }, wallMm: 1 }).mass).toBeCloseTo(0.3132, 12);
    expect(withMaterialMass(mat('Cev 20×20'))).toMatchObject({ massSource: 'estimated', mass: 0.2997 });
    expect(withMaterialMass(mat('Cev 20×20×12')).massSource).toBe('estimated');
  });

  it('lim po površini dobija kg/m²; perforacije se računaju sa označenom pretpostavkom', () => {
    expect(withMaterialMass(DEFAULT_PLATES[0])).toMatchObject({ mass: 5.4, massUnit: 'kg/m²', massSource: 'calculated' });
    expect(withMaterialMass({ ...withMaterialMass(DEFAULT_PLATES[0]), dims: { t: 1.5 } }).mass).toBeCloseTo(4.05, 12);
    expect(withMaterialMass(mat('Aluminijumska ploča 2000×1000×2', { unit: 'm2' })).mass).toBe(5.4);
    expect(withMaterialMass(mat('Aluminijumski lim 2000mmx1000mm debljina 2mm', { unit: 'm2' })).mass).toBe(5.4);
    expect(withMaterialMass(mat('Perforirani aluminijumski lim 2 mm', { unit: 'm2' }))).toMatchObject({ massSource: 'estimated', mass: 3.24 });
  });

  it('specijalni profili koriste tačnu katalošku šifru i nikad formulu obične cevi', () => {
    for (const known of TERRACE_MATERIALS.filter((m) => m.kgPerM !== undefined)) {
      expect(withMaterialMass(known), known.name).toMatchObject({ mass: known.kgPerM, massUnit: 'kg/m', massSource: 'catalog' });
    }
    const m = withMaterialMass(mat('Stub kvadratni 40×40×1,3 sa kanalom', { sku: 'P-1057' }));
    expect(m).toMatchObject({ mass: 1.09, massSource: 'catalog', massUnit: 'kg/m' });
    expect(withMaterialMass(mat('Stub okrugli Ø40×2 sa kanalom', { sku: 'P-1054' })).mass).toBe(1.163);
    expect(formatMaterialMass(withMaterialMass(DEFAULT_RAILS[0]))).toBe('≈ 2,851 kg/m');
    for (const name of ['Lamela 80×20×1', 'Višekomorni profil 80×20×1', 'Cev sa žlebom 40×40×2']) {
      expect(withMaterialMass(mat(name)).massSource, name).toBe('estimated');
    }
    expect(withMaterialMass(mat('U profil 25×20×1,35'))).toMatchObject({ massSource: 'calculated', mass: 0.2270835 });
  });

  it('promenjen kataloški presek gubi potvrdu i ne vraća staru masu posle narednog učitavanja', () => {
    const original = withMaterialMass(TERRACE_MATERIALS.find((m) => m.sku === 'P-1057')!);
    const changed = withMaterialMass({ ...original, wallMm: 3 });
    expect(changed.massSource).toBe('estimated');
    expect(changed.mass).not.toBe(original.mass);
    expect(withMaterialMass(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  });

  it('isključuje okov i staklo čak i sa unetom masom', () => {
    for (const m of [mat('Brava 40×20×2'), mat('Kvaka'), mat('Cilindar'), mat('Šarka'), mat('Zasun'), mat('Vijak', { category: 'okov' }), mat('Kaljeno staklo 8 mm', { category: 'staklo' })]) {
      expect(excludesMaterialMass(m), m.name).toBe(true);
      expect(formatMaterialMass({ ...m, mass: 1, massUnit: 'kg/kom' })).toBe('—');
    }
  });

  it('zadržava stare i ručno unete podatke uključujući masu gotovog komada', () => {
    expect(withMaterialMass(mat('Specijalni profil', { kgPerM: 1.23456 }))).toMatchObject({ mass: 1.23456, massUnit: 'kg/m', massSource: 'manual' });
    const m = mat('Aluminijumski stub gotov 1800 mm', { category: 'stub', unit: 'kom', mass: 2.345678, massUnit: 'kg/kom', massSource: 'manual' });
    expect(withMaterialMass(m)).toBe(m);
    expect(formatMaterialMass(m)).toBe('2,346 kg/kom');
  });

  it('dopunjava sve profile Ekoluke: 32 nominalne mase i 12 procena', () => {
    const csv = readFileSync('ekoluka-cenovnik-2026.csv', 'utf8');
    const list = applyImport([], planImport([], csv, true)).map(withMaterialMass);
    expect(list.filter((m) => m.massSource === 'calculated')).toHaveLength(32);
    expect(list.filter((m) => m.category === 'profil' && m.massSource === 'estimated')).toHaveLength(12);
    expect(list.filter((m) => m.category === 'zavrsetak')).toHaveLength(21);
    expect(list.filter((m) => m.category === 'montaza')).toHaveLength(7);
    expect(list.filter((m) => m.category === 'profil' && m.mass === undefined)).toHaveLength(0);
    expect(list.filter((m) => m.category === 'okov').every((m) => formatMaterialMass(m) === '—')).toBe(true);
  });

  it('računa otvorene i okrugle preseke, oduzima šupljine i navodi usvojene mere', () => {
    expect(withMaterialMass(mat('L profil 20×20×1,5', { sku: 'KL000001' })).mass).toBeCloseTo(0.155925, 12);
    expect(withMaterialMass(mat('H profil', { sku: 'KH000001' })).mass).toBeCloseTo(0.3888, 12);
    expect(withMaterialMass(mat('Okrugla cev Ø50×2')).mass).toBeCloseTo(Math.PI * 96 * 0.0027, 12);
    const hollow = mat('Nacrtan profil', { drawn: { kind: 'kv', pts: [], wall: 2, closed: true, polys: [{ outline: [[0,0], [20,0], [20,20], [0,20]], holes: [[[2,2], [18,2], [18,18], [2,18]]] }] } });
    expect(withMaterialMass(hollow)).toMatchObject({ massSource: 'estimated' });
    expect(withMaterialMass(hollow).mass).toBeCloseTo(0.3888, 12);
    expect(withMaterialMass({ ...hollow, name: 'Okrugla cev Ø50×2', sku: 'KU000001' }).mass).toBeCloseTo(0.3888, 12);
    expect(withMaterialMass(mat('Puna aluminijumska šipka Ø10')).mass).toBeCloseTo(Math.PI * 25 * 0.0027, 12);
    expect(withMaterialMass(mat('Puna aluminijumska šipka 40×10')).mass).toBeCloseTo(1.08, 12);
    expect(withMaterialMass(mat('Cev 40×40')).massReference).toContain('Usvojen zid');
  });

  it('popunjava sve fizičke materijale iz definicija modela i terasa, a za druge materijale koristi odgovarajuću gustinu', () => {
    for (const m of [...MODEL_MATERIALS, ...TERRACE_MATERIALS].filter((m) => !excludesMaterialMass(m))) {
      const next = withMaterialMass(m);
      expect(next.mass, m.name).toBeGreaterThan(0);
      expect(Number.isFinite(next.mass), m.name).toBe(true);
      expect(next.massUnit, m.name).toBeDefined();
    }
    expect(withMaterialMass(mat('Inox cev 20×20×2')).mass).toBeCloseTo(144 * 0.0079, 12);
    expect(withMaterialMass(mat('Betonski stub', { unit: 'kom', category: 'stub' }))).toMatchObject({ massSource: 'estimated', massUnit: 'kg/kom' });
    expect(withMaterialMass(mat('Gumena traka EPDM 8×4')).mass).toBeCloseTo(0.0384, 12);
  });

  it('stare kataloške mase opstaju posle nadogradnje; promena jedinice ploče računa masu konkretnog komada', () => {
    const m = withMaterialMass(mat('Stub kvadratni 40×40×1,3 sa kanalom', { sku: 'P-1057' }));
    const legacy = { ...m, massBasis: JSON.stringify(JSON.parse(m.massBasis!).slice(0, 5)) };
    expect(withMaterialMass(legacy)).toMatchObject({ mass: 1.09, massSource: 'catalog' });
    const plate = withMaterialMass(mat('Aluminijumska ploča 2000×1000×2', { unit: 'm2', category: 'panel' }));
    expect(withMaterialMass({ ...plate, unit: 'kom' })).toMatchObject({ mass: 10.8, massUnit: 'kg/kom', massSource: 'estimated' });
  });

  it('dopuna i ručna promena mase ne menjaju cene i obračun projekta', () => {
    const p = createDemoProject(null);
    const before = computePrice(p, SEED_MATERIALS);
    const after = SEED_MATERIALS.map(withMaterialMass).map((m) => ({ ...m, mass: 9.876543, massUnit: 'kg/m' as const, massSource: 'manual' as const }));
    const { finishing: _oldPhysical, ...beforePrice } = before;
    const { finishing: _newPhysical, ...afterPrice } = computePrice(p, after);
    expect(afterPrice).toEqual(beforePrice);
    expect(after.map((m) => [m.unitPrice, m.unit, m.wastePercent])).toEqual(SEED_MATERIALS.map((m) => [m.unitPrice, m.unit, m.wastePercent]));
  });

  it('stari materijali i projekti se učitavaju, dopuna se upisuje, a ručni unos ostaje posle ponovnog init-a', async () => {
    await wipeAll();
    const seed = createSeedData();
    const old = mat('Kvadratna cev 20×20×2');
    await saveAll({ ...seed, materials: [old] });
    await useAppStore.getState().init();
    expect(useAppStore.getState().projects).toHaveLength(seed.projects.length);
    expect((await loadAll()).materials[0].mass).toBeCloseTo(0.3888, 12);
    const manual = mat('Lamela specijalna 120×20', { mass: 1.23456789, massUnit: 'kg/m', massSource: 'manual' });
    useAppStore.getState().upsertMaterial(manual);
    const st = useAppStore.getState();
    await saveAll({ projects: st.projects, customers: st.customers, settings: st.settings, materials: st.materials });
    await useAppStore.getState().init();
    expect(useAppStore.getState().materials.find((m) => m.id === manual.id)).toMatchObject(manual);
  });
});
