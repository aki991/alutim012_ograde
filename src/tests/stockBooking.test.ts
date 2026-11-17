import { afterEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildCuttingList, cutOptions } from '../domain/pricing/cutting';
import { bookProjectStock, isStockStatus, unbookProjectStock } from '../domain/pricing/stockBooking';
import { materialIdForName } from '../domain/models/spec';
import type { AppSettings, ProjectStatus } from '../domain/models/types';
import { useAppStore } from '../store/useAppStore';

const seed = createSeedData();
const project = { ...seed.projects.find((p) => p.items.length > 0)!, offcuts: [] };
const withKeep = (minKeepMm: number, extra: Partial<AppSettings> = {}): AppSettings => ({ ...seed.settings, stock: [], ...extra, cutting: { ...cutOptions(seed.settings), minKeepMm } });
const count = (r: { qty: number }[]) => r.reduce((n, s) => n + s.qty, 0);

describe('knjiženje krojne liste u magacin', () => {
  const list = buildCuttingList(project, seed.settings.modelSpecs, seed.materials, cutOptions(seed.settings));
  const keepable = (min: number) => list.profiles.flatMap((p) => p.bars).filter((b) => Math.floor(b.leftoverMm) >= min && Math.floor(b.leftoverMm) > 0).length;

  it('statusi: „U izradi“ i „Završeno“ knjiže, „Nacrt“ i „Ponuda“ ne', () => {
    expect((['nacrt', 'ponuda', 'u_izradi', 'zavrseno'] as ProjectStatus[]).map(isStockStatus)).toEqual([false, false, true, true]);
  });

  it('ostaci od zadate dužine i duži idu u magacin, kraći su otpad', () => {
    for (const min of [0, 300, 500, 2000]) {
      const r = bookProjectStock(project, withKeep(min), seed.materials);
      expect(count(r.record.added)).toBe(keepable(min));
      expect(count(r.stock)).toBe(keepable(min));
      expect(r.stock.every((s) => s.lengthMm >= min)).toBe(true);
    }
    expect(keepable(0)).toBeGreaterThan(0);
  });

  it('iskorišćeni ostatak iz magacina se skida sa stanja, a povlačenje ga vraća i skida dodate ostatke', () => {
    const prof = list.profiles[0];
    const materialId = materialIdForName(seed.materials, prof.profile);
    const len = Math.max(...prof.summary.map((s) => s.lengthMm)) + 10;
    const stock = [{ id: 's1', materialId, lengthMm: len, qty: 2 }, { id: 's2', materialId: 'drugi', lengthMm: 1000, qty: 3 }];
    const p = { ...project, offcuts: [{ materialId, lengthMm: len, qty: 1 }] };
    const r = bookProjectStock(p, withKeep(300, { stock }), seed.materials);
    expect(count(r.record.removed)).toBe(1);
    expect(r.stock.find((s) => s.id === 's1')?.qty).toBe(1);
    const back = unbookProjectStock(r.stock, r.record);
    expect(back.find((s) => s.id === 's1')?.qty).toBe(2);
    expect(back.find((s) => s.id === 's2')?.qty).toBe(3);
    expect(count(back)).toBe(5);
  });

  it('povlačenje skida samo ono što je još na stanju (ostatak iskorišćen u drugom projektu)', () => {
    const r = bookProjectStock(project, withKeep(300), seed.materials);
    const first = r.stock[0];
    const used = r.stock.map((s) => (s.id === first.id ? { ...s, qty: 0 } : s));
    // ostalo se skida do nule i ne ide u minus; stavka koja je već bila na 0 ostaje kao što je bila
    expect(count(unbookProjectStock(used, r.record))).toBe(0);
  });
});

describe('magacin prati status projekta (store)', () => {
  const initial = useAppStore.getState();
  afterEach(() => useAppStore.setState(initial, true));

  it('ponuda → u izradi knjiži, u izradi → završeno ne knjiži ponovo, povratak na ponudu povlači', () => {
    useAppStore.setState({ projects: [{ ...project, status: 'ponuda' }], materials: seed.materials, settings: withKeep(300) });
    const st = () => useAppStore.getState();
    const stockCount = () => count(st().settings.stock ?? []);
    st().patchProject(project.id, { status: 'nacrt' });
    expect(stockCount()).toBe(0);
    st().patchProject(project.id, { status: 'u_izradi' });
    const booked = stockCount();
    expect(booked).toBeGreaterThan(0);
    expect(st().settings.stockBookings?.[project.id]).toBeDefined();
    st().patchProject(project.id, { status: 'zavrseno' });
    expect(stockCount()).toBe(booked);
    st().patchProject(project.id, { status: 'ponuda' });
    expect(stockCount()).toBe(0);
    expect(st().settings.stockBookings?.[project.id]).toBeUndefined();
    st().patchProject(project.id, { status: 'zavrseno' });
    expect(stockCount()).toBe(booked);
  });
});
