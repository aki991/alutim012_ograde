import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { loadAll, saveAll, wipeAll } from '../db';
import { createFence, createProject } from '../domain/models/factories';
import { updatePost } from '../domain/geometry/operations';
import { makeStair } from '../domain/geometry/stairOps';
import { selectMaterialPriceUnit, withMaterialUnits } from '../domain/models/materialUnits';
import type { Material } from '../domain/models/types';
import { buildBom, buildElementFinishing, buildProjectFinishing, computePrice } from '../domain/pricing/calc';
import { scopedProject } from '../domain/pricing/cutting';
import { finishingArea, finishingMass, measureFinishing } from '../domain/pricing/finishing';
import { buildLouver08Sheet } from '../domain/pricing/louverSpec';
import { buildWorkOrder } from '../domain/pricing/workorder';
import { useAppStore } from '../store/useAppStore';
import { FINISHING_MATERIALS as MATS, FINISHING_SPECS as SPECS, finishingProject } from './fixtures/finishing';
import { SEED_MATERIALS } from './fixtures/materials';

const measure = (m: Material, qty: number) => measureFinishing([{ materialId: m.id, name: m.name, unit: m.unit, geometricQty: qty }], [m]);
const pipe = MATS[0];

describe('neto masa i razvijena površina za plastificiranje', () => {
  it('cev 20×20×2, 6 m: 2,3328 kg i spoljašnja površina 0,48 m² (bez unutrašnjosti)', () => {
    const s = measure(pipe, 6);
    expect(s.massKg).toBeCloseTo(2.3328, 12);
    expect(s.areaM2).toBeCloseTo(0.48, 12);
    expect(s.missingMass).toEqual([]); expect(s.missingArea).toEqual([]);
    expect(finishingMass(s)).toBe('2,333 kg'); expect(finishingArea(s)).toBe('0,48 m²');
  });
  it('otvoreni U profil uključuje unutrašnje dostupne zidove; okrugla cev samo spoljašnji obim', () => {
    expect(measure({ ...pipe, name: 'U profil 20×20×2' }, 1).areaM2).toBeCloseTo(0.116, 12);
    expect(measure({ ...pipe, name: 'Okrugla cev Ø40×2' }, 3).areaM2).toBeCloseTo(Math.PI * 0.04 * 3, 12);
  });
  it('lim se plastificira sa obe strane; masa koristi jednu zapreminu', () => {
    const s = measure({ ...pipe, name: 'Aluminijumski lim 2 mm', category: 'panel', unit: 'm2' }, 2.5);
    expect(s.areaM2).toBe(5); expect(s.massKg).toBeCloseTo(13.5, 12);
  });
  it('kape ulaze u zbir kao procena, šarke i staklo se izuzimaju, inox ne ide na plastificiranje', () => {
    const cap = measure(MATS[1], 4); expect(cap.massKg).toBeGreaterThan(0); expect(cap.areaM2).toBeGreaterThan(0); expect(cap.massEstimated).toBe(true); expect(cap.areaEstimated).toBe(true);
    for (const m of [MATS[2], { ...pipe, name: 'Staklo kaljeno 8 mm', category: 'staklo' as const, unit: 'm2' as const }]) {
      expect(measure(m, 100)).toMatchObject({ areaM2: 0, massKg: 0, missingMass: [], missingArea: [] });
    }
    const inox = measure({ ...pipe, name: 'Inox cev 20×20×2' }, 2);
    expect(inox.massKg).toBeGreaterThan(0); expect(inox.areaM2).toBe(0);
    for (const name of ['Čelična cev 20×20×2', 'Plastični profil 20×20×2', 'Prohrom cev 20×20×2']) expect(measure({ ...pipe, name }, 2).areaM2).toBe(0);
  });
  it('gotov stub sa poznatom dužinom i masom u kg/m se meri po komadu', () => {
    const m = { ...pipe, name: 'Gotov stub 20×20×2', category: 'stub' as const, unit: 'kom' as const, stockLengthM: 1.5, mass: 0.3888, massUnit: 'kg/m' as const, massSource: 'manual' as const };
    expect(measure(m, 2).massKg).toBeCloseTo(1.1664, 12);
    expect(measure(m, 2).areaM2).toBeCloseTo(0.24, 12);
  });
  it('obrisan materijal ostavlja vidljivo nepotpun zbir, a rezerva u novcu se preskače', () => {
    const s = measureFinishing([{ materialId: 'gone', name: 'Obrisan profil', unit: 'm', geometricQty: 2 }, { materialId: 'extra', name: 'Rezerva', unit: 'set', geometricQty: 1 }], []);
    expect(s.missingArea).toEqual(['Obrisan profil']); expect(s.missingMass).toEqual(['Obrisan profil']); expect(finishingMass(s)).toBe('≥ 0 kg');
  });
  it('zajednički stubovi se sabiraju jednom; svaki element ima sopstvenu masu i površinu', () => {
    const p = finishingProject(); const s = buildProjectFinishing(p, MATS, SPECS);
    expect(s.massKg).toBeCloseTo(12 * 0.3888, 12); expect(s.areaM2).toBeCloseTo(12 * 0.08, 12);
    const wo = buildWorkOrder(p, SPECS, MATS, { stockMm: 6000, kerfMm: 3 });
    expect(wo.finishing).toEqual(s); expect(wo.elements).toHaveLength(3);
    for (const e of wo.elements) { expect(e.finishing.massKg).toBeCloseTo(2 * 0.3888, 12); expect(e.facts.some((f) => f.label === 'Masa (bez stubova)')).toBe(true); }
    const changed = { ...p, posts: p.posts.map((post) => ({ ...post, heightMm: 3000 })) };
    expect(buildElementFinishing(changed, [0], MATS, SPECS)).toEqual(buildElementFinishing(p, [0], MATS, SPECS));
    expect(buildProjectFinishing(changed, MATS, SPECS).areaM2).toBeCloseTo(18 * 0.08, 12);
  });
  it('izabrana cena po kilogramu, otpad, šipka i širina reza ne menjaju ugrađene količine', () => {
    const p = finishingProject();
    const selected = MATS.map((m) => selectMaterialPriceUnit(withMaterialUnits({ ...m, wastePercent: 99, stockLengthM: 6 }), 'kg'));
    expect(buildProjectFinishing(p, selected, SPECS)).toEqual(buildProjectFinishing(p, MATS, SPECS));
    const a = buildWorkOrder(p, SPECS, MATS, { stockMm: 6000, kerfMm: 3 });
    const b = buildWorkOrder(p, SPECS, MATS, { stockMm: 8000, kerfMm: 8, saveMaterial: true });
    expect(a.finishing).toEqual(b.finishing);
  });
  it('model 08 po nabavnoj šipki ipak plastificira samo dužine isečenih delova', () => {
    const p = { ...createProject('08', [createFence({ modelId: 'louver_light', widthMm: 1100, heightMm: 1000 })]), louverSpec: { priceBasis: 'per_bar' as const } };
    const sheet = buildLouver08Sheet(p)!;
    const physical = buildBom(p, SEED_MATERIALS, undefined, { netLengths: true });
    expect(physical.find((l) => l.materialId === 'mat_ek_kv000007')!.geometricQty).toBeCloseTo(sheet.quantities.fillLens.reduce((sum, v) => sum + v, 0) / 1000, 12);
    expect(buildProjectFinishing(p, SEED_MATERIALS)).toEqual(buildProjectFinishing({ ...p, louverSpec: { priceBasis: 'per_m' } }, SEED_MATERIALS));
  });
  it('štampa samo kapija ili samo ograde daje isti zbir u nalogu i krojnoj listi', () => {
    const p = finishingProject();
    for (const scope of ['gates', 'fence'] as const) {
      const wo = buildWorkOrder(p, SPECS, MATS, { stockMm: 6000, kerfMm: 3, scope });
      expect(wo.finishing).toEqual(buildProjectFinishing(scopedProject(p, scope), MATS, SPECS));
      expect(wo.elements).toHaveLength(scope === 'gates' ? 1 : 2);
      expect(wo.finishing.areaM2).toBeLessThan(buildProjectFinishing(p, MATS, SPECS).areaM2);
    }
  });
  it('ugaono parče uz stepenište ima sopstvenu masu u radnom nalogu', () => {
    let p = createProject('ugao', [1700, 1000, 1000].map((widthMm) => createFence({ modelId: 'rail_inox', heightMm: 1000, widthMm })));
    p = makeStair(p, p.items[0].id, 1020);
    const post = p.posts[p.items.length - 2];
    p = updatePost(p, post.id, { turnDeg: -90 });
    const order = buildWorkOrder(p, undefined, SEED_MATERIALS, { stockMm: 6000, kerfMm: 3 });
    const corner = order.elements.find((e) => /^US/.test(e.key));
    expect(corner).toBeDefined(); expect(corner!.finishing.massKg).toBeGreaterThan(0);
    expect(corner!.finishing.areaM2).toBeGreaterThan(0);
    expect(order.finishing.massKg).toBeGreaterThan(corner!.finishing.massKg);
  });
  it('cena plastificiranja ulazi u trošak pre zarade, popusta i PDV-a; stari projekti imaju 0', () => {
    const p = finishingProject(); const before = computePrice(p, MATS, SPECS);
    p.settings.pricing.coatingPerM2Rsd = 1000;
    const after = computePrice(p, MATS, SPECS);
    expect(after.coatingTotal).toBeCloseTo(960, 10);
    expect(after.grossTotal - before.grossTotal).toBeCloseTo(960 * 1.1 * 0.95 * 1.2, 10);
    expect(after.materialTotal).toBe(before.materialTotal);
    delete p.settings.pricing.coatingPerM2Rsd;
    expect(computePrice(p, MATS, SPECS)).toEqual(before);
  });
  it('cena u podešavanjima važi za postojeći i novi projekat i ostaje u bazi', async () => {
    await wipeAll();
    const data = createSeedData(); const p = finishingProject();
    useAppStore.setState({ ...data, ready: true, projects: [p] });
    const s = useAppStore.getState(); s.updateSettings({ pricing: { ...s.settings.pricing, coatingPerM2Rsd: 750.25 } });
    let state = useAppStore.getState(); expect(state.projects[0].settings.pricing.coatingPerM2Rsd).toBe(750.25);
    const id = state.newProject({ name: 'nov' }); state = useAppStore.getState(); expect(state.projects.find((x) => x.id === id)!.settings.pricing.coatingPerM2Rsd).toBe(750.25);
    await saveAll(state); const back = await loadAll();
    expect(back.settings?.pricing.coatingPerM2Rsd).toBe(750.25); expect(back.projects.every((x) => x.settings.pricing.coatingPerM2Rsd === 750.25)).toBe(true);
  });
});
