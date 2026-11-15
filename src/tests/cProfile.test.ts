import { describe, expect, it } from 'vitest';
import { cProfileSpec, materialDimFields, materialShape, matchesSearch, searchKey, sectionFace, syncNameDims } from '../domain/models/materialShape';
import { profileGeometry } from '../domain/models/profileDrawings';
import { cleanMaterialName } from '../domain/models/materialTitle';

const mat = (name: string) => ({ sku: 'X1', name, unit: 'm' as const, category: 'profil' as const });

describe('univerzalan C profil', () => {
  it.each(['C profil 60x60x2', 'Noseći C-profil 80X40X3', 'C profil 50×50×2,5', 'c-profil 100x60x3'])('%s: kutija sa otvorom na donjoj strani, jedan obris bez rupe', (name) => {
    const sh = materialShape(mat(name));
    expect(sh.type).toBe('linear');
    if (sh.type !== 'linear') return;
    expect(sh.group).toBe('c');
    expect(sh.section.polys).toHaveLength(1);
    expect(sh.section.polys[0].holes).toHaveLength(0);
    const spec = cProfileSpec(mat(name))!;
    expect(spec.kind).toBe('c');
    // presek ima spoljne mere iz naziva
    const e = sectionFace(sh.section, 0);
    if (spec.kind === 'c') { expect(e.face).toBeCloseTo(spec.a, 3); expect(e.depth).toBeCloseTo(spec.b, 3); }
    // otvor: donja strana (najveće y u crtežu) ima prekid, gornja je cela
    const geo = profileGeometry(spec);
    expect(geo.fillRule).toBe('nonzero');
    const pts = geo.path.replace(/^M|Z$/g, '').split('L').map((p) => p.split(' ').map(Number));
    const bottom = pts.filter(([, y]) => Math.abs(y - geo.h) < 1e-6).map(([x]) => x).sort((a, b) => a - b);
    expect(bottom.length).toBe(4); // dve ivice otvora: levi i desni deo donje strane
    expect(bottom[1]).toBeLessThan(bottom[2]);
    expect(pts.filter(([, y]) => Math.abs(y) < 1e-6)).toHaveLength(2); // gornja strana bez otvora
  });
  it('kvadratna cev nije C profil', () => {
    expect(cProfileSpec(mat('Kvadratna cev 60×60×2'))).toBeNull();
    const sh = materialShape(mat('Kvadratna cev 60×60×2'));
    expect(sh.type === 'linear' && sh.section.polys[0].holes.length).toBe(1);
  });
});

describe('pretraga materijala', () => {
  it('x, X i × su ista oznaka množenja; zarez i tačka su isto', () => {
    for (const q of ['60x', '60X', '60×', '60x20', '60X20x1', '60 x 20'.replace(/ /g, '')]) expect(matchesSearch('Kvadratna cev 60×20×1', q), q).toBe(true);
    expect(matchesSearch('Kvadratna cev 60×40×2,4', '40x2.4')).toBe(true);
    expect(matchesSearch('Kvadratna cev 60×40×2,4', '40x2,4')).toBe(true);
    expect(matchesSearch('Kvadratna cev 60×20×1', '80x')).toBe(false);
  });
  it('više reči: svaka mora da se nađe, redosled nije bitan; šifra se pretražuje', () => {
    expect(matchesSearch('Kvadratna cev 60×20×1 KV000008', 'cev 60x')).toBe(true);
    expect(matchesSearch('Kvadratna cev 60×20×1 KV000008', 'kv000008')).toBe(true);
    expect(matchesSearch('Šarka 3D', 'sarka')).toBe(true);
    expect(searchKey('Čep Ø25×2')).toBe('cep ø25x2');
  });
});

describe('oznaka boje u nazivu', () => {
  it.each([
    ['Kvadratna cev 60×20×1, RAL 7016', 'Kvadratna cev 60×20×1'],
    ['Kvadratna cev 80×20×1, RAL 8017', 'Kvadratna cev 80×20×1'],
    ['Kvadratna cev 80×20×1 RAL7016', 'Kvadratna cev 80×20×1'],
    ['Zakošena letvica 80×20×1, boja 7016', 'Zakošena letvica 80×20×1'],
  ])('%s → %s', (a, b) => { expect(cleanMaterialName(a)).toBe(b); });
});

describe('izmena mera preseka materijala', () => {
  const dimsOf = (m: Parameters<typeof materialDimFields>[0]) => Object.fromEntries(materialDimFields(m).map((f) => [f.key, f.value]));
  it('C profil: otvor je pola širine, a može da se promeni (npr. 30 → 20) i crtež ga prati', () => {
    const base = mat('C profil 60×60×2');
    expect(dimsOf(base)).toEqual({ a: 60, b: 60, c: 2, slot: 30 });
    const edited = { ...base, dims: { slot: 20 } };
    expect(dimsOf(edited).slot).toBe(20);
    const geo = profileGeometry(cProfileSpec(edited)!);
    expect(geo.facts.find((f) => f.label.startsWith('Otvor'))?.value).toBe('20 mm');
    // oblik se menja: ivice otvora su šire
    const sh = (m: typeof base) => { const s = materialShape(m); return s.type === 'linear' ? JSON.stringify(s.section.polys) : ''; };
    expect(sh(edited)).not.toBe(sh(base));
    // preveliki otvor se ograničava da zidovi ostanu
    expect(dimsOf({ ...base, dims: { slot: 200 } }).slot).toBeLessThanOrEqual(60 - 4 * 2);
  });
  it('svaka mera preseka može da se menja: kvadratna cev, U, L, H, zakošena, okrugla, traka, ploča', () => {
    const cases: [string, string, Record<string, number>][] = [
      ['Kvadratna cev 60×40×2', 'a', { a: 70 }], ['Kvadratna cev 60×40×2', 'b', { b: 50 }], ['U profil 60×28×2', 'a', { a: 70 }],
      ['L profil 40×40×2', 'b', { b: 30 }], ['H profil 60', 'up', { up: 30 }], ['Zakošena letvica 80×20×1', 'offset', { offset: 10 }],
      ['Okrugla cev Ø50×2', 'd', { d: 60 }], ['Traka 30×3', 'a', { a: 40 }], ['Kaljeno staklo 8 mm', 't', { t: 10 }],
    ];
    for (const [name, key, dims] of cases) {
      const m = { sku: 'N1', name, unit: name.includes('staklo') ? ('m2' as const) : ('m' as const), category: 'profil' as const };
      const before = materialShape(m); const after = materialShape({ ...m, dims });
      expect(materialDimFields(m).map((f) => f.key), name).toContain(key);
      expect(JSON.stringify(after), `${name}/${key}`).not.toBe(JSON.stringify(before));
    }
  });
  it('mera iz cenovnika po šifri (KV000001) može da se izmeni, a zid ide preko debljine zida', () => {
    const kv = { sku: 'KV000001', name: 'Kvadratna cev 60×60×2', unit: 'm' as const, category: 'profil' as const };
    expect(dimsOf(kv)).toEqual({ a: 60, b: 60, c: 2 });
    expect(dimsOf({ ...kv, dims: { a: 80 }, wallMm: 3 })).toEqual({ a: 80, b: 60, c: 3 });
    expect(materialDimFields(kv).find((f) => f.key === 'c')?.wall).toBe(true);
  });
  it('složeni šematski oblici nemaju mere za izmenu', () => {
    expect(materialDimFields({ sku: 'KU000003', name: 'U za masku', unit: 'm', category: 'profil' })).toEqual([]);
  });
  it('naziv prati izmenu mera A × B × C', () => {
    const f = (a: number, b: number, c: number) => [{ key: 'a', label: '', value: a }, { key: 'b', label: '', value: b }, { key: 'c', label: '', value: c }];
    expect(syncNameDims('C profil 60×60×2', f(60, 60, 2), f(60, 60, 1.5))).toBe('C profil 60×60×1,5');
    expect(syncNameDims('Kvadratna cev 60×40×2,4', f(60, 40, 2.4), f(80, 40, 2.4))).toBe('Kvadratna cev 80×40×2,4');
    expect(syncNameDims('C profil 60x60x2', f(60, 60, 2), f(50, 60, 2))).toBe('C profil 50×60×2');
    expect(syncNameDims('Šina za kapiju', f(60, 60, 2), f(50, 60, 2))).toBe('Šina za kapiju');
    expect(syncNameDims('Cev 160×60×2', f(60, 60, 2), f(50, 60, 2))).toBe('Cev 160×60×2');
  });
});
