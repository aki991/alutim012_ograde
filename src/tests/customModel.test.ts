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
