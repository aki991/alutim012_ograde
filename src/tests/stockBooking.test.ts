import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildCuttingList, cutOptions } from '../domain/pricing/cutting';
import { bookProjectStock } from '../domain/pricing/stockBooking';
import { materialIdForName } from '../domain/models/spec';
import type { AppSettings } from '../domain/models/types';

const seed = createSeedData();
const project = { ...seed.projects.find((p) => p.items.length > 0)!, offcuts: [] };
const withKeep = (minKeepMm: number, extra: Partial<AppSettings> = {}): AppSettings => ({ ...seed.settings, stock: [], ...extra, cutting: { ...cutOptions(seed.settings), minKeepMm } });

describe('knjiženje krojne liste u magacin (prelazak u „U izradi“)', () => {
  const list = buildCuttingList(project, seed.settings.modelSpecs, seed.materials, cutOptions(seed.settings));
  const keepable = (min: number) => list.profiles.flatMap((p) => p.bars).filter((b) => Math.floor(b.leftoverMm) >= min && Math.floor(b.leftoverMm) > 0).length;

  it('ostaci od zadate dužine i duži idu u magacin, kraći su otpad', () => {
    for (const min of [0, 300, 500, 2000]) {
      const r = bookProjectStock(project, withKeep(min), seed.materials);
      expect(r.added).toBe(keepable(min));
      expect(r.stock.reduce((n, s) => n + s.qty, 0)).toBe(keepable(min));
      expect(r.stock.every((s) => s.lengthMm >= min)).toBe(true);
    }
    expect(keepable(0)).toBeGreaterThan(0);
  });

  it('iskorišćeni ostatak iz magacina se skida sa stanja', () => {
    const prof = list.profiles[0];
    const materialId = materialIdForName(seed.materials, prof.profile);
    const longest = Math.max(...prof.summary.map((s) => s.lengthMm));
    const len = longest + 10;
    const stock = [{ id: 's1', materialId, lengthMm: len, qty: 2 }];
    const p = { ...project, offcuts: [{ materialId, lengthMm: len, qty: 1 }] };
    const r = bookProjectStock(p, withKeep(100000, { stock }), seed.materials);
    expect(r.removed).toBe(1);
    expect(r.stock.find((s) => s.id === 's1')?.qty).toBe(1);
  });
});
