import { describe, expect, it } from 'vitest';
import { computeLayout, sumModularWidths, totalStatus } from '../domain/geometry/layout';
import {
  autoFillToFixedTotal, changeColor, changeModel, duplicateItem, insertItem, moveItem, moveItemBy, removeItem, swapItems, updateItem, updatePost,
} from '../domain/geometry/operations';
import { createDemoProject, createFence, createGate, createProject } from '../domain/models/factories';
import { emptyHistory, recordChange, redo, undo } from '../domain/models/history';
import {
  buildBom, computePrice, countHorizontalBars, countVerticalBars, sellingPrice, sharedPostCount,
} from '../domain/pricing/calc';
import { colorHex } from '../domain/models/catalog';
import { SEED_MATERIALS } from '../data/materials';
import { parseProject, serializeProject } from '../domain/validation/project';
import { LIMITS, validateRange } from '../domain/validation/limits';

const demo = () => createDemoProject(null);

describe('geometrija i raspored', () => {
  it('sabira modularne širine demonstracionog projekta na 11000 mm', () => {
    const p = demo();
    expect(sumModularWidths(p.items)).toBe(11000);
    expect(computeLayout(p).totalModularMm).toBe(11000);
  });

  it('razlikuje modularnu dužinu, svetli otvor i zauzetu dužinu', () => {
    const p = demo();
    const l = computeLayout(p);
    expect(l.occupiedMm).toBeGreaterThan(l.totalModularMm);
    expect(l.items[0].clearWidth).toBeLessThan(2000);
    expect(l.items[0].clearWidth).toBe(2000 - (p.posts[0].widthMm + p.posts[1].widthMm) / 2);
  });

  it('menja širinu segmenta i pomera susedne elemente', () => {
    const p = demo();
    const before = computeLayout(p);
    const q = updateItem(p, p.items[1].id, { widthMm: 1500 });
    const after = computeLayout(q);
    expect(after.totalModularMm).toBe(10500);
    expect(after.items[2].axisStart).toBe(before.items[2].axisStart - 500);
  });

  it('dodaje element i održava n+1 stubova sa jedinstvenim ID-jevima', () => {
    const p = insertItem(demo(), createFence(), 2);
    expect(p.items).toHaveLength(6);
    expect(p.posts).toHaveLength(7);
    expect(new Set(p.posts.map((x) => x.id)).size).toBe(7);
  });

  it('briše element i selekcija se može poništiti (stubovi ostaju konzistentni)', () => {
    const p = demo();
    const id = p.items[2].id;
    const q = removeItem(p, id);
    expect(q.items.find((i) => i.id === id)).toBeUndefined();
    expect(q.posts).toHaveLength(q.items.length + 1);
    const empty = [...q.items].reduce((acc, it) => removeItem(acc, it.id), q);
    expect(empty.items).toHaveLength(0);
    expect(empty.posts).toHaveLength(0); // prazan projekat nema stubova (D1)
  });

  it('menja redosled i čuva podatke elemenata', () => {
    const p = demo();
    const gate = p.items[3];
    const q = moveItem(p, gate.id, 1);
    expect(q.items[1]).toEqual(gate);
    expect(q.items).toHaveLength(5);
    expect(sumModularWidths(q.items)).toBe(11000);
    const r = moveItemBy(q, gate.id, 1);
    expect(r.items[2].id).toBe(gate.id);
    const s = swapItems(p, p.items[0].id, p.items[4].id);
    expect(s.items[0].id).toBe(p.items[4].id);
    expect(s.items[4].id).toBe(p.items[0].id);
  });

  it('duplira element sa novim ID-jem', () => {
    const p = demo();
    const { project, newId } = duplicateItem(p, p.items[0].id);
    expect(project.items).toHaveLength(6);
    expect(newId).not.toBe(p.items[0].id);
    expect(project.items[1].id).toBe(newId);
  });

  it('broji zajedničke stubove bez dupliranja', () => {
    const p = demo();
    const l = computeLayout(p);
    expect(l.postCount).toBe(6);
    expect(l.sharedPostCount).toBe(4);
    expect(sharedPostCount(5)).toBe(4);
    expect(l.naivePostCount - l.postCount).toBe(4);
  });

  it('postavlja tip „stub kapije" uz kapije', () => {
    const p = demo();
    const types = p.posts.map((x) => x.type);
    expect(types[2]).toBe('gate');
    expect(types[3]).toBe('gate');
    expect(types[4]).toBe('gate');
    expect(types[0]).toBe('aluminium');
  });

  it('menja model (širina ostaje) i boju', () => {
    const p = demo();
    const id = p.items[0].id;
    const q = changeColor(changeModel(p, id, 'v_framed'), id, 'RAL 9005');
    const it = q.items[0];
    expect(it.kind === 'fence' && it.modelId).toBe('v_framed');
    expect(it.widthMm).toBe(2000);
    expect(it.kind !== 'opening' && it.color).toBe('RAL 9005');
  });
});

describe('fiksna ukupna dužina', () => {
  const fixed = (total: number) => {
    const p = demo();
    return { ...p, settings: { ...p.settings, totalMode: 'fixed' as const, fixedTotalMm: total } };
  };

  it('prijavljuje prekoračenje i manjak', () => {
    expect(totalStatus(fixed(11000)).state).toBe('ok');
    expect(totalStatus(fixed(10000))).toEqual({ state: 'over', diffMm: 1000 });
    expect(totalStatus(fixed(12000))).toEqual({ state: 'under', diffMm: 1000 });
    expect(totalStatus(demo()).state).toBe('auto');
  });

  it('automatski raspoređuje samo po segmentima ograde, kapije ostaju iste', () => {
    const p = fixed(12000);
    const r = autoFillToFixedTotal(p, 'proportional');
    expect(r.remainingMm).toBe(0);
    expect(sumModularWidths(r.project.items)).toBe(12000);
    expect(r.project.items[2].widthMm).toBe(4000);
    expect(r.project.items[3].widthMm).toBe(1000);
  });

  it('ravnomerna raspodela daje tačan zbir', () => {
    const r = autoFillToFixedTotal(fixed(11001), 'even');
    expect(sumModularWidths(r.project.items)).toBe(11001);
  });

  it('prijavljuje razlog kad nije moguće (min/max)', () => {
    const r = autoFillToFixedTotal(fixed(30000), 'proportional');
    expect(r.remainingMm).toBeGreaterThan(0);
    expect(r.reason).toMatch(/najveća/);
    const small = autoFillToFixedTotal(fixed(5000), 'proportional');
    expect(small.remainingMm).toBeLessThan(0);
    expect(small.reason).toMatch(/najmanja/);
  });

  it('ne radi ništa kad nema elemenata koji se smeju širiti', () => {
    const p = createProject('Samo kapije', [createGate('sliding')]);
    const r = autoFillToFixedTotal({ ...p, settings: { ...p.settings, totalMode: 'fixed', fixedTotalMm: 6000 } });
    expect(r.appliedMm).toBe(0);
    expect(r.reason).toMatch(/kapije/);
  });
});

describe('kalkulacija', () => {
  it('broji horizontalne letvice iz visine i razmaka', () => {
    expect(countHorizontalBars(1520, 100, 20)).toBe(12);
    expect(countHorizontalBars(1600, 100, 20)).toBe(13);
    expect(countHorizontalBars(0, 100, 20)).toBe(0);
  });

  it('broji vertikalne letvice iz širine i razmaka', () => {
    expect(countVerticalBars(1000, 60, 30)).toBe(11);
    expect(countVerticalBars(50, 60, 30)).toBe(0);
  });

  it('BOM sadrži stubove po jednom i menja se sa dimenzijom', () => {
    const p = demo();
    const bom = buildBom(p, SEED_MATERIALS);
    const posts = bom.filter((l) => l.group === 'Stubovi').reduce((s, l) => s + l.purchaseQty, 0);
    expect(posts).toBe(6);
    const wider = updateItem(p, p.items[0].id, { widthMm: 3000 });
    const a = bom.find((l) => l.materialId === 'mat_kv_30x20')!;
    const b = buildBom(wider, SEED_MATERIALS).find((l) => l.materialId === 'mat_kv_30x20')!;
    expect(b.geometricQty).toBeGreaterThan(a.geometricQty);
    expect(a.purchaseQty).toBeGreaterThan(a.geometricQty); // otpad
  });

  it('promena cene materijala menja ukupnu cenu', () => {
    const p = demo();
    const base = computePrice(p, SEED_MATERIALS);
    const mats = SEED_MATERIALS.map((m) => (m.id === 'mat_kv_30x20' ? { ...m, unitPrice: (m.unitPrice || 100) * 2 } : { ...m, unitPrice: m.id === 'mat_kv_30x20' ? 100 : m.unitPrice }));
    expect(computePrice(p, mats).grossTotal).toBeGreaterThan(base.grossTotal);
  });

  it('razlikuje maržu od uvećanja', () => {
    expect(sellingPrice(100, { profitMode: 'margin', profitPercent: 20 })).toBeCloseTo(125, 5);
    expect(sellingPrice(100, { profitMode: 'markup', profitPercent: 20 })).toBeCloseTo(120, 5);
  });

  it('PDV se ne duplira kod bruto cena', () => {
    const p = demo();
    const net = computePrice(p, SEED_MATERIALS);
    const gross = computePrice({ ...p, settings: { ...p.settings, pricing: { ...p.settings.pricing, pricesIncludeVat: true } } }, SEED_MATERIALS);
    expect(gross.materialTotal).toBeCloseTo(net.materialTotal / 1.2, 3);
    const vat0 = computePrice({ ...p, settings: { ...p.settings, pricing: { ...p.settings.pricing, vatPercent: 0 } } }, SEED_MATERIALS);
    expect(vat0.grossTotal).toBeCloseTo(vat0.netAfterDiscount, 5);
  });

  it('popust i PDV se računaju po definisanoj osnovici', () => {
    const b = computePrice(demo(), SEED_MATERIALS);
    expect(b.netAfterDiscount).toBeCloseTo(b.sellNet * 0.9, 3);
    expect(b.vatAmount).toBeCloseTo(b.netAfterDiscount * 0.2, 3);
    expect(b.grossTotal).toBeCloseTo(b.netAfterDiscount * 1.2, 3);
  });
});

describe('undo/redo', () => {
  it('vraća i ponavlja stanje, spaja izmene sa istim ključem', () => {
    let h = emptyHistory<number>();
    let value = 1;
    h = recordChange(h, value, 'w'); value = 2;
    h = recordChange(h, value, 'w'); value = 3; // spojeno
    expect(h.past).toEqual([1]);
    h = recordChange(h, value, null); value = 4;
    const u = undo(h, value)!;
    expect(u.value).toBe(3);
    const r = redo(u.history, u.value)!;
    expect(r.value).toBe(4);
    expect(undo(emptyHistory<number>(), 1)).toBeNull();
  });
});

describe('serijalizacija i uvoz', () => {
  it('izvezeni projekat se uvozi bez gubitaka', () => {
    const p = demo();
    const res = parseProject(serializeProject(p));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.project.items).toEqual(p.items);
      expect(res.project.posts).toEqual(p.posts);
      expect(res.project.name).toBe(p.name);
    }
  });

  it('prijavljuje grešku za neispravan format', () => {
    expect(parseProject('nije json').ok).toBe(false);
    expect(parseProject('{"project":{"id":"a","name":"x","items":"bad","posts":[]}}').ok).toBe(false);
    const p = demo();
    const broken = JSON.parse(serializeProject(p));
    broken.project.items[0].widthMm = -5;
    const r = parseProject(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    broken.project.items[0].widthMm = 2000;
    broken.project.posts.pop();
    expect(parseProject(JSON.stringify(broken)).ok).toBe(false);
    broken.schemaVersion = 99;
    expect(parseProject(JSON.stringify(broken))).toMatchObject({ ok: false });
  });
});

describe('validacija dimenzija', () => {
  it('odbija negativne, nulu i vrednosti van opsega uz objašnjenje', () => {
    expect(validateRange(-1, LIMITS.fenceWidth, 'Širina').message).toMatch(/negativna/);
    expect(validateRange(0, LIMITS.fenceWidth, 'Širina').message).toMatch(/nula/);
    expect(validateRange(100, LIMITS.fenceWidth, 'Širina').message).toMatch(/najmanja/);
    expect(validateRange(99999, LIMITS.fenceWidth, 'Širina').message).toMatch(/najveća/);
    expect(validateRange(2000, LIMITS.fenceWidth, 'Širina').ok).toBe(true);
    expect(validateRange(NaN, LIMITS.fenceWidth, 'Širina').ok).toBe(false);
  });
});

describe('stubovi prate model ograde i kapije', () => {
  it('srebrni model ima okrugle inox stubove do visine ograde, ostali stub u boji elementa', () => {
    const p = createProject('s', [createFence({ modelId: 'rail_black', heightMm: 1100 }), createFence({ modelId: 'h_boards' }), createFence({ modelId: 'picket_narrow' })]);
    expect(p.posts[0]).toMatchObject({ color: 'INOX', round: true, heightMm: 1100 });
    expect(p.posts[1]).toMatchObject({ color: 'INOX', round: true }); // stub između dva elementa prati levi
    expect(p.posts[2].color).toBe('#604840'); // dekor drveta: stub u boji sa slike modela
    expect(p.posts[3]).toMatchObject({ color: colorHex('RAL 9016'), round: undefined });
    expect(p.posts[3].heightMm).toBe(1600); // slika modela nema stub koji viri iznad polja
  });
  it('uz kapiju stub prati model kapije (srebrni četvrtasti), ručno izmenjen stub se ne dira', () => {
    const base = createProject('s', [createFence({ modelId: 'h_narrow' }), createGate('sliding', { infillModelId: 'rail_inox' })]);
    expect(base.posts[1]).toMatchObject({ type: 'gate', color: 'INOX' });
    expect(base.posts[1].round).toBeFalsy();
    const edited = updatePost(base, base.posts[0].id, { color: 'RAL 3020' });
    expect(changeModel(edited, edited.items[0].id, 'rail_black').posts[0].color).toBe('RAL 3020');
  });
  it('promena modela menja i stubove', () => {
    const p = createProject('s', [createFence({ modelId: 'h_narrow' })]);
    const q = changeModel(p, p.items[0].id, 'glass_inox');
    expect(q.posts.map((x) => [x.color, x.round])).toEqual([['INOX', true], ['INOX', true]]);
  });
});
