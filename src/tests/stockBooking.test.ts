import { afterEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildCuttingList, cutOptions } from '../domain/pricing/cutting';
import { bookProjectStock, isStockStatus, stockReservations, unbookProjectStock } from '../domain/pricing/stockBooking';
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

  const prof = list.profiles[0];
  const materialId = materialIdForName(seed.materials, prof.profile);
  const len = Math.max(...prof.summary.map((s) => s.lengthMm)) + 10;

  it('iskorišćeni komad izabran iz magacina se skida sa stanja, a povlačenje ga vraća i skida dodate ostatke', () => {
    const stock = [{ id: 's1', materialId, lengthMm: len, qty: 2 }, { id: 's2', materialId: 'drugi', lengthMm: 1000, qty: 3 }];
    const p = { ...project, offcuts: [{ materialId, lengthMm: len, qty: 1, stockId: 's1' }] };
    const r = bookProjectStock(p, withKeep(300, { stock }), seed.materials);
    expect(count(r.record.removed)).toBe(1);
    expect(r.stock.find((s) => s.id === 's1')?.qty).toBe(1);
    const back = unbookProjectStock(r.stock, r.record);
    expect(back.find((s) => s.id === 's1')?.qty).toBe(2);
    expect(back.find((s) => s.id === 's2')?.qty).toBe(3);
    expect(count(back)).toBe(5);
  });

  it('ručno unet komad iste dužine ne dira magacin', () => {
    const stock = [{ id: 's1', materialId, lengthMm: len, qty: 2 }];
    const p = { ...project, offcuts: [{ materialId, lengthMm: len, qty: 1 }] };
    const r = bookProjectStock(p, withKeep(300, { stock }), seed.materials);
    expect(count(r.record.removed)).toBe(0);
    expect(r.stock.find((s) => s.id === 's1')?.qty).toBe(2);
  });

  it('poslednji komad stavke se skida, a povlačenje ga vraća pod istim ID-em (rezervacija ostaje vezana)', () => {
    const stock = [{ id: 's1', materialId, lengthMm: len, qty: 1 }];
    const p = { ...project, offcuts: [{ materialId, lengthMm: len, qty: 1, stockId: 's1' }] };
    const r = bookProjectStock(p, withKeep(100000, { stock }), seed.materials);
    expect(r.stock.find((s) => s.id === 's1')).toBeUndefined();
    expect(unbookProjectStock(r.stock, r.record).find((s) => s.id === 's1')?.qty).toBe(1);
  });

  it('rezervacije: broje se projekti koji nisu „U izradi“, po stavci magacina', () => {
    const a = { ...project, id: 'a', name: 'A', status: 'ponuda' as ProjectStatus, offcuts: [{ materialId, lengthMm: len, qty: 2, stockId: 's1' }] };
    const b = { ...project, id: 'b', name: 'B', status: 'nacrt' as ProjectStatus, offcuts: [{ materialId, lengthMm: len, qty: 1, stockId: 's1' }, { materialId, lengthMm: 500, qty: 1 }] };
    const c = { ...project, id: 'c', name: 'C', status: 'u_izradi' as ProjectStatus, offcuts: [{ materialId, lengthMm: len, qty: 1, stockId: 's1' }] };
    const r = stockReservations([a, b, c]);
    expect(r.get('s1')?.qty).toBe(3);
    expect(r.get('s1')?.projects.map((p) => p.name)).toEqual(['A', 'B']);
    expect(stockReservations([a, b, c], 'a').get('s1')?.qty).toBe(1);
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

  it('Potvrdi sečenje knjiži bez promene statusa, Poništi sečenje vraća; rezervacija prestaje posle potvrde', () => {
    const materialId = materialIdForName(seed.materials, buildCuttingList(project, seed.settings.modelSpecs, seed.materials, cutOptions(seed.settings)).profiles[0].profile);
    const p = { ...project, status: 'ponuda' as ProjectStatus, offcuts: [{ materialId, lengthMm: 900, qty: 2, stockId: 's1' }] };
    useAppStore.setState({ projects: [p], materials: seed.materials, settings: withKeep(100000, { stock: [{ id: 's1', materialId, lengthMm: 900, qty: 3 }] }) });
    const st = () => useAppStore.getState();
    const s1 = () => st().settings.stock?.find((s) => s.id === 's1')?.qty;
    const reserved = () => stockReservations(st().projects, undefined, st().settings.stockBookings).get('s1')?.qty;
    expect(reserved()).toBe(2);
    expect(s1()).toBe(3);
    st().confirmCutting(p.id);
    expect(st().settings.stockBookings?.[p.id]).toBeDefined();
    expect(reserved()).toBeUndefined();
    // komad se skida samo ako ga je krojna lista iskoristila (900 mm je kraći od svih komada, pa ostaje)
    const used = count(st().settings.stockBookings![p.id].removed);
    expect(s1()).toBe(3 - used);
    // ponovna potvrda ne knjiži dvaput
    st().confirmCutting(p.id);
    expect(s1()).toBe(3 - used);
    st().undoCutting(p.id);
    expect(st().settings.stockBookings?.[p.id]).toBeUndefined();
    expect(s1()).toBe(3);
    expect(reserved()).toBe(2);
  });

  it('potvrđeno sečenje: promena ostataka ponovo knjiži, a prelazak u „U izradi“ ne knjiži dvaput', () => {
    const lens = buildCuttingList(project, seed.settings.modelSpecs, seed.materials, cutOptions(seed.settings)).profiles[0];
    const materialId = materialIdForName(seed.materials, lens.profile);
    const len = Math.max(...lens.summary.map((s) => s.lengthMm)) + 10;
    useAppStore.setState({ projects: [{ ...project, status: 'ponuda' }], materials: seed.materials, settings: withKeep(100000, { stock: [{ id: 's1', materialId, lengthMm: len, qty: 3 }] }) });
    const st = () => useAppStore.getState();
    const s1 = () => st().settings.stock?.find((s) => s.id === 's1')?.qty;
    st().patchProject(project.id, { offcuts: [{ materialId, lengthMm: len, qty: 1, stockId: 's1' }] });
    st().confirmCutting(project.id);
    expect(s1()).toBe(2);
    st().patchProject(project.id, { offcuts: [] });
    expect(s1()).toBe(3);
    st().patchProject(project.id, { offcuts: [{ materialId, lengthMm: len, qty: 1, stockId: 's1' }] });
    expect(s1()).toBe(2);
    st().patchProject(project.id, { status: 'u_izradi' });
    expect(s1()).toBe(2);
  });

  it('projekat „U izradi“: komad dodat iz magacina se odmah skida, uklonjen se vraća', () => {
    const materialId = materialIdForName(seed.materials, buildCuttingList(project, seed.settings.modelSpecs, seed.materials, cutOptions(seed.settings)).profiles[0].profile);
    useAppStore.setState({ projects: [{ ...project, status: 'ponuda' }], materials: seed.materials, settings: withKeep(100000, { stock: [{ id: 's1', materialId, lengthMm: 900, qty: 3 }] }) });
    const st = () => useAppStore.getState();
    const s1 = () => st().settings.stock?.find((s) => s.id === 's1')?.qty;
    st().patchProject(project.id, { status: 'u_izradi' });
    expect(s1()).toBe(3);
    st().patchProject(project.id, { offcuts: [{ materialId, lengthMm: 900, qty: 2, stockId: 's1' }] });
    expect(s1()).toBe(1);
    st().patchProject(project.id, { offcuts: [] });
    expect(s1()).toBe(3);
  });
});
