import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { loadAll, saveAll, wipeAll } from '../db';

describe('IndexedDB čuvanje', () => {
  it('prazna baza nije „seeded", a posle upisa se podaci vraćaju netaknuti', async () => {
    await wipeAll();
    expect((await loadAll()).seeded).toBe(false);
    const seed = createSeedData();
    await saveAll(seed);
    const back = await loadAll();
    expect(back.seeded).toBe(true);
    expect(back.projects).toHaveLength(seed.projects.length);
    expect(back.customers).toHaveLength(8);
    expect(back.materials.length).toBe(seed.materials.length);
    expect(back.settings?.companyName).toBe('ALU TIM 012');
  });

  it('izmena se čuva i demo podaci je ne pregaze pri sledećem učitavanju', async () => {
    const data = await loadAll();
    const edited = { ...data.projects[0], name: 'Izmenjeno ime' };
    await saveAll({ projects: [edited, ...data.projects.slice(1)], customers: data.customers, materials: data.materials, settings: data.settings });
    const again = await loadAll();
    expect(again.seeded).toBe(true); // store.init() zato ne poziva seed ponovo
    expect(again.projects.find((p) => p.id === edited.id)?.name).toBe('Izmenjeno ime');
  });

  it('demonstracioni projekat Petrović ima 11000 mm i 5 elemenata', () => {
    const p = createSeedData().projects.find((x) => x.name === 'Porodična kuća Petrović')!;
    expect(p.items.map((i) => i.widthMm)).toEqual([2000, 2000, 4000, 1000, 2000]);
    expect(p.posts).toHaveLength(6);
  });
});
