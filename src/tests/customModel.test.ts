import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { partFromDrag } from '../components/designer/Designer2D';
import { isBuiltinMaterial, SEED_MATERIALS } from '../data/materials';
import { customBom, newCustomModel, partBounds, repeatPart } from '../domain/models/custom';
import { MATERIAL_GROUPS, materialShape, sectionEdgeLines, sectionFace } from '../domain/models/materialShape';
import { migrateProject } from '../domain/validation/project';
import { createFence, createProject } from '../domain/models/factories';
import { parseCsv } from '../domain/pricing/materialsIo';
import type { Material } from '../domain/models/types';
import { SEED_MATERIALS as OLD } from './fixtures/materials';

const mat = (sku: string, name: string, unit: Material['unit'] = 'm', category: Material['category'] = 'profil', unitPrice = 100): Material => ({ id: `m_${sku}`, sku, name, unit, category, unitPrice, wastePercent: 0, demo: false });

describe('oblik materijala za crtanje modela', () => {
  it('svaki red Ekoluka cenovnika ima grupu i oblik (2D i 3D)', () => {
    const rows = parseCsv(readFileSync('ekoluka-cenovnik-2026.csv', 'utf8')).slice(1).filter((r) => r[0]);
    expect(rows.length).toBeGreaterThan(60);
    const groups = new Map<string, number>();
    for (const r of rows) {
      const s = materialShape(mat(r[0], r[1], r[3] as Material['unit'], r[2] === 'Okovi' ? 'okov' : 'profil'));
      expect(MATERIAL_GROUPS.some((g) => g.id === s.group), r[1]).toBe(true);
      if (s.type === 'linear') { expect(s.section.polys.length, r[1]).toBeGreaterThan(0); expect(s.section.w).toBeGreaterThan(0); }
      if (s.type === 'piece') expect(s.solids.length, r[1]).toBeGreaterThan(0);
      groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
    }
    expect(groups.get('kv')).toBe(27);
    expect(groups.get('u')).toBe(2);
    expect(groups.get('maske')).toBe(8);
    expect(groups.get('l')).toBe(2);
    expect(groups.get('z')).toBe(2);
    expect(groups.get('kose')).toBe(2);
    expect(groups.get('kape')).toBeGreaterThanOrEqual(11);
    expect(groups.get('stope')).toBe(7);
    expect(groups.get('rozetne')).toBe(3);
    expect(groups.get('cepovi')).toBe(5);
    expect(groups.has('ostalo')).toBe(false);
  });

  it('materijali bez crteža u cenovniku dobijaju oblik po nazivu', () => {
    for (const m of OLD) expect(materialShape(m), m.name).toBeTruthy();
    const round = materialShape(mat('P-1033', 'Rukohvat — inox cev Ø50 × 2 mm'));
    expect(round.type === 'linear' && round.section.round && round.section.w).toBe(50);
    expect(materialShape(mat('X1', 'Kapa pismo 80mmx80mm', 'kom', 'okov')).group).toBe('kape');
    expect(materialShape(mat('X2', 'Šarka pojačana', 'kom', 'okov')).group).toBe('okov');
    expect(materialShape(mat('X3', 'Kaljeno staklo 8 mm (mat)', 'm2', 'staklo'))).toMatchObject({ type: 'sheet', glass: true, thick: 8 });
    expect(materialShape(mat('X4', 'Automatika za kliznu kapiju', 'kom', 'automatika')).group).toBe('automatika');
    const u = materialShape(mat('U-20x20', 'U profil 20×20×1,35 mm — bočna vođica'));
    expect(u.group).toBe('u');
    expect(u.type === 'linear' && [u.section.w, u.section.h]).toEqual([20, 20]);
    expect(materialShape(mat('X5', 'Nešto nepoznato', 'kom', 'ostalo')).type).toBe('piece');
  });

  it('okretanje preseka menja širinu koja se vidi spreda', () => {
    const s = materialShape(mat('KV000007', 'Kvadratna cev 80×20×1 mm'));
    if (s.type !== 'linear') throw new Error('nije profil');
    expect(sectionFace(s.section, 0)).toMatchObject({ face: 80, depth: 20 });
    expect(sectionFace(s.section, 90)).toMatchObject({ face: 20, depth: 80 });
    expect(sectionEdgeLines(s.section, 0)).toEqual(expect.arrayContaining([-39, 39]));
  });
});

describe('ručno nacrtan model', () => {
  const kv = mat('KV000007', 'Kvadratna cev 80×20×1 mm', 'm', 'profil', 300);
  const cap = mat('K100013', 'Kapa ravna 80mmx80mm', 'kom', 'okov', 150);

  it('povlačenje mišem pravi profil: pod pravim uglom ili slobodno', () => {
    const s = materialShape(kv);
    expect(partFromDrag(kv.id, s, 100, 50, 1100, 80, true, 'a')).toMatchObject({ x: 100, y: 50, lengthMm: 1000, angleDeg: 0 });
    expect(partFromDrag(kv.id, s, 100, 900, 120, 100, true, 'a')).toMatchObject({ x: 100, y: 100, lengthMm: 800, angleDeg: 90 });
    expect(partFromDrag(kv.id, s, 0, 0, 300, 400, false, 'a')).toMatchObject({ lengthMm: 500, angleDeg: 53 });
    expect(partFromDrag(kv.id, s, 0, 0, 3, 2, true, 'a')).toBeNull();
    expect(partFromDrag(cap.id, materialShape(cap), 0, 0, 40, 1000, true, 'a')).toMatchObject({ x: 40, y: 1000 });
  });

  it('spisak materijala: profili po dužini, komadni delovi po broju; ponavljanje i okvir', () => {
    const s = materialShape(kv);
    const first = partFromDrag(kv.id, s, 100, 0, 100, 1000, true, 'p0')!;
    const model = { ...newCustomModel('cm1'), parts: [first, ...repeatPart(first, s, 4, 100, () => `p${Math.random()}`), partFromDrag(cap.id, materialShape(cap), 0, 0, 40, 1000, true, 'c')!] };
    expect(model.parts[4]).toMatchObject({ x: 500, y: 0 });
    const b = partBounds(first, s);
    expect([b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v) + 0)).toEqual([60, 0, 140, 1000]);
    const bom = customBom(model, [kv, cap]);
    expect(bom.find((l) => l.materialId === kv.id)).toMatchObject({ count: 5, qty: 5, total: 1500 });
    expect(bom.find((l) => l.materialId === cap.id)).toMatchObject({ count: 1, qty: 1, total: 150 });
    expect(customBom(model, [])[0].missing).toBe(true);
  });
});

describe('izbačeni model i ugrađeni materijali', () => {
  it('aplikacija nema ugrađene materijale; stari se prepoznaju, a uvezeni ostaju', () => {
    expect(SEED_MATERIALS).toEqual([]);
    expect(OLD.every(isBuiltinMaterial)).toBe(true);
    expect(isBuiltinMaterial({ ...OLD[0], demo: false })).toBe(false);
    expect(isBuiltinMaterial({ id: 'mat_imp_kv000001', demo: false })).toBe(false);
  });
  it('projekat sa modelom „Inox i staklo“ prelazi na inox ogradu sa prečkama', () => {
    const p = createProject('t', [createFence({ widthMm: 1500, modelId: 'rail_inox' })]);
    const old = { ...p, items: p.items.map((it) => ({ ...it, modelId: 'glass_inox' })) } as unknown as typeof p;
    const m = migrateProject(old);
    expect(m.items[0].kind === 'fence' && m.items[0].modelId).toBe('rail_inox');
  });
});

describe('Z profil se postavlja pod nagibom −45°', () => {
  it('vodoravni Z profil dobija nagib preseka −45°, ostali profili ne', async () => {
    const mk = (id: string, sku: string, name: string): Material => ({ id, sku, name, category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: false });
    const z = mk('mz', 'KZ000001', 'Z profil za ogradu - mali, sirovo (Ekoluka Key)');
    const sz = materialShape(z);
    expect(partFromDrag(z.id, sz, 100, 50, 1100, 50, true, 'z1')).toMatchObject({ angleDeg: 0, tiltDeg: -45 });
    expect(partFromDrag(z.id, sz, 100, 900, 100, 100, true, 'z2')?.tiltDeg).toBeUndefined(); // uspravan se ne naginje
    const kv = mk('mk', 'KV25202', 'Kvadratna cev 30x30x2');
    expect(partFromDrag(kv.id, materialShape(kv), 100, 50, 1100, 50, true, 'k1')?.tiltDeg).toBeUndefined();
  });
});

describe('Z profil: mere preseka se menjaju', () => {
  const mk = (over: Partial<Material> = {}): Material => ({ id: 'mz', sku: 'KZ000001', name: 'Z profil za ogradu - mali, sirovo (Ekoluka Key)', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: false, ...over } as Material);
  it('širina i visina su polja mera, a presek prati zadate mere', async () => {
    const { materialDimFields } = await import('../domain/models/materialShape');
    const base = materialShape(mk());
    expect(materialDimFields(mk()).map((f) => f.key)).toEqual(['width', 'height']);
    expect(base.type === 'linear' && Math.round(base.section.w * 10) / 10).toBe(93.3);
    const big = materialShape(mk({ dims: { width: 120, height: 70 } }));
    expect(big.type === 'linear' && Math.round(big.section.w * 10) / 10).toBe(120);
    expect(big.type === 'linear' && Math.round(big.section.h * 10) / 10).toBe(70);
  });
  it('veliki Z profil (KZ000002) takođe', async () => {
    const { materialDimFields } = await import('../domain/models/materialShape');
    const z2 = mk({ sku: 'KZ000002', name: 'Z profil za ogradu - veliki' });
    expect(materialDimFields(z2).map((f) => f.value)).toEqual([99.6, 56.8]);
    const s = materialShape(mk({ sku: 'KZ000002', dims: { width: 110 } }));
    expect(s.type === 'linear' && Math.round(s.section.w)).toBe(110);
  });
});

describe('Z profili bez lufta: razmak do −20 mm', () => {
  const z = { id: 'mz', sku: 'KZ000001', name: 'Z profil za ogradu - mali, sirovo (Ekoluka Key)', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: false } as Material;
  it('najmanji razmak Z profila je tačno −20 mm', async () => {
    const { minGap, gapLimitOf } = await import('../domain/models/guides');
    const sh = materialShape(z);
    if (sh.type !== 'linear') throw new Error('Z profil mora da bude profil');
    const face = sectionFace(sh.section, 0).face;
    expect(minGap(sh.section, 0, face, gapLimitOf(sh))).toBe(-20);
    // bez Z oznake važi računanje iz omotača preseka (nikad pozitivno)
    expect(minGap(sh.section, 0, face)).toBeLessThanOrEqual(0);
  });
  it('uvlačenje dva Z profila do 20 mm nije preklapanje, više od toga jeste', async () => {
    const { findOverlaps } = await import('../domain/models/overlap');
    const sh = materialShape(z);
    if (sh.type !== 'linear') throw new Error('Z profil mora da bude profil');
    const face = sectionFace(sh.section, 0).face;
    const part = (id: string, y: number) => ({ id, materialId: z.id, x: 0, y, lengthMm: 500, angleDeg: 0, rot: 0, z: 0 });
    const at = (gap: number) => findOverlaps({ parts: [part('a', 0), part('b', face + gap)] }, [z]).length;
    expect(at(-15)).toBe(0);
    expect(at(5 - face)).toBeGreaterThan(0); // gotovo jedan preko drugog
  });
});

describe('Z profil: kopija sa drugom šifrom zadržava oblik', () => {
  it('kopija velikog Z profila (šifra KZ000002-K) ostaje veliki Z profil', async () => {
    const { materialDimFields } = await import('../domain/models/materialShape');
    const copy = { id: 'mc', sku: 'KZ000002-K', name: 'Z profil za ogradu - veliki (kopija)', category: 'profil', unit: 'm', unitPrice: 4.07, wastePercent: 3, demo: false } as Material;
    expect(materialDimFields(copy).map((f) => f.value)).toEqual([99.6, 56.8]);
    const small = { ...copy, sku: 'KZ000001-K', name: 'Z profil za ogradu - mali (kopija)' } as Material;
    expect(materialDimFields(small).map((f) => f.value)).toEqual([93.3, 55.5]);
    const sized = { ...copy, dims: { width: 120 } } as Material;
    expect(materialDimFields(sized).map((f) => f.value)).toEqual([120, 56.8]);
  });
});

describe('cev 80×20 u bočnim U profilima: razmak bez lufta najviše do −15 mm', () => {
  it('ograničenje je −15 mm samo za kvadratnu cev 80×20', async () => {
    const { minGap, gapLimitOf } = await import('../domain/models/guides');
    const mk = (name: string): Material => ({ id: 'm', sku: 'KV', name, category: 'profil', unit: 'm', unitPrice: 1, wastePercent: 3, demo: false } as Material);
    const tube = materialShape(mk('Kvadratna cev 80x20x1'));
    if (tube.type !== 'linear') throw new Error('cev');
    expect(gapLimitOf(tube)).toEqual({ mm: 15, exact: false });
    const face = sectionFace(tube.section, -28.73).face;
    expect(minGap(tube.section, -28.73, face, gapLimitOf(tube))).toBeGreaterThanOrEqual(-15);
    expect(minGap(tube.section, -28.73, face)).toBeLessThan(-15); // bez ograničenja presek dozvoljava više
    const other = materialShape(mk('Kvadratna cev 60x40x2'));
    expect(gapLimitOf(other)).toBeUndefined();
  });
});

describe('skica: Z profili imaju kote od poda', () => {
  it('vodoravni Z profili bez vođica dobijaju kote naleganja od poda (osa zavarivanja)', async () => {
    const { buildSketch } = await import('../domain/models/sketch');
    const mk = (id: string, sku: string, name: string, unit = 'm'): Material => ({ id, sku, name, category: 'profil', unit, unitPrice: 1, wastePercent: 3, demo: false } as Material);
    const z = mk('mz', 'KZ000002', 'Z profil za ogradu - veliki'); const u = mk('mu', 'U60', 'U profil 60x28x2');
    const part = (id: string, materialId: string, x: number, y: number, len: number, ang: number, extra = {}) => ({ id, materialId, x, y, lengthMm: len, angleDeg: ang, rot: 0, z: 0, ...extra });
    const model = { ...newCustomModel('cmz'), widthMm: 600, heightMm: 600, parts: [part('L', u.id, 10, 0, 600, 90), part('R', u.id, 590, 0, 600, 90), part('z1', z.id, 20, 100, 560, 0, { tiltDeg: -45 }), part('z2', z.id, 20, 300, 560, 0, { tiltDeg: -45 })] };
    const sk = buildSketch(model, [z, u]);
    expect(sk.weldKind).toBe('weld');
    expect(sk.welds.length).toBe(2);
    expect(sk.welds[0].value).toBeGreaterThan(sk.welds[1].value);
  });
});

describe('ručno okrenut bočni U profil ostaje kako je okrenut', () => {
  const mk = (id: string, sku: string, name: string): Material => ({ id, sku, name, category: 'profil', unit: 'm', unitPrice: 1, wastePercent: 3, demo: false } as Material);
  const u = mk('mu', 'U60', 'U profil 60x28x2'); const kv = mk('mk', 'KV', 'Kvadratna cev 40x20x1');
  const part = (id: string, materialId: string, x: number, y: number, len: number, ang: number, rot = 0, extra = {}) => ({ id, materialId, x, y, lengthMm: len, angleDeg: ang, rot, z: 0, ...extra });
  const base = (locked: boolean) => ({ ...newCustomModel('cmr'), widthMm: 1034, heightMm: 800, parts: [
    part('L', u.id, 14, 0, 800, 90, 90, locked ? { rotLocked: true } : {}), part('R', u.id, 1020, 0, 800, 90, 270, locked ? { rotLocked: true } : {}),
    part('b1', kv.id, 28, 200, 978, 0), part('b2', kv.id, 28, 400, 978, 0),
  ] });
  it('settle ne okreće zaključane U profile ka unutra, a prečke ostaju slobodne', async () => {
    const { settleModel } = await import('../domain/models/settle');
    const r = settleModel(base(true), [u, kv]).model;
    expect(r.parts.find((p) => p.id === 'L')!.rot).toBe(90);
    expect(r.parts.find((p) => p.id === 'R')!.rot).toBe(270);
    expect(r.parts.filter((p) => p.guides).length).toBe(0);
  });
  it('bez ručnog okretanja bočni U profili idu ka unutra (kao do sada)', async () => {
    const { settleModel } = await import('../domain/models/settle');
    const r = settleModel(base(false), [u, kv]).model;
    expect(r.parts.find((p) => p.id === 'L')!.rot).toBe(270);
    expect(r.parts.find((p) => p.id === 'R')!.rot).toBe(90);
  });
  it('dugme „Uklopi“ okreće profile ka prečki i skida zaključavanje', async () => {
    const { attachToGuides } = await import('../domain/models/guides');
    const r = attachToGuides(base(true), 'b1', [u, kv]);
    if ('error' in r) throw new Error(r.error);
    expect(r.model.parts.find((p) => p.id === 'L')!.rotLocked).toBeUndefined();
  });
});
