import { describe, expect, it } from 'vitest';
import { drawnName, drawnPolys, drawnPreset, drawnSize, drawnValid } from '../domain/models/drawnSection';
import { materialDimFields, materialKey, materialShape, sectionFace, sectionOfDrawn } from '../domain/models/materialShape';
import { customBom, partBounds, resolveParts, newCustomModel } from '../domain/models/custom';
import type { DrawnSection, Material } from '../domain/models/types';

const mat = (drawn?: DrawnSection, extra: Partial<Material> = {}): Material => ({ id: 'm_d', sku: 'NAC-1', name: 'Kvadratna cev 40×20×2', category: 'profil', unit: 'm', unitPrice: 500, wastePercent: 0, demo: false, drawn, ...extra });
const area = (pts: [number, number][]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

describe('nacrtan presek profila', () => {
  it('U profil 60×28×2: spoljne mere, površina preseka i otvor kao pravi U profil', () => {
    const d = drawnPreset('u', 60, 28, 2);
    expect(drawnValid(d)).toBe(true);
    expect(drawnSize(d)).toEqual({ w: 60, h: 28 });
    const [poly] = drawnPolys(d);
    // leđa 60 × 2 + dva kraka 2 × 26
    expect(area(poly.outline)).toBeCloseTo(60 * 2 + 2 * 2 * 26, 6);
    const sh = materialShape(mat(d));
    expect(sh.type).toBe('linear');
    if (sh.type !== 'linear') return;
    expect(sh.group).toBe('u');
    expect(sh.exact).toBe(true);
    expect(sh.wall).toBe(2);
    expect(sh.u).toEqual({ a: 60, b: 28, c: 2 });
    const e = sectionFace(sh.section, 0);
    expect(e.face).toBeCloseTo(60, 6); expect(e.depth).toBeCloseTo(28, 6);
    // presek je centriran
    expect(e.u0).toBeCloseTo(-30, 6); expect(e.v1).toBeCloseTo(14, 6);
  });

  it('zatvoren oblik je cev: spoljna ivica i otvor', () => {
    const d = drawnPreset('kv', 40, 20, 2);
    const [poly] = drawnPolys(d);
    expect(poly.holes).toHaveLength(1);
    expect(area(poly.outline)).toBeCloseTo(40 * 20, 6);
    expect(area(poly.holes[0])).toBeCloseTo(36 * 16, 6);
    const sh = materialShape(mat(d));
    expect(sh.type === 'linear' && sh.group).toBe('kv');
  });

  it('L, C, Z i traka daju presek zadatih spoljnih mera', () => {
    for (const k of ['l', 'c', 'z', 'traka'] as const) {
      const d = drawnPreset(k, 50, 30, 3);
      expect(drawnSize(d), k).toEqual({ w: 50, h: 30 });
    }
    expect(drawnPolys(drawnPreset('traka', 30, 3, 1))[0].outline).toHaveLength(4);
  });

  it('nacrtan presek ima prednost nad presekom iz naziva i menja ključ oblika (keš 3D tela)', () => {
    const plain = mat();
    const drawn = mat(drawnPreset('l', 30, 30, 2));
    expect(materialShape(plain).type === 'linear' && materialShape(plain).group).toBe('kv');
    expect(materialShape(drawn).type === 'linear' && materialShape(drawn).group).toBe('l');
    expect(materialKey(plain)).not.toBe(materialKey(drawn));
    const other = mat({ ...drawnPreset('l', 30, 30, 2), pts: [[1, 30], [1, 1], [40, 1]] });
    expect(materialKey(other)).not.toBe(materialKey(drawn));
  });

  it('debljina zida materijala (wallMm) menja nacrtan presek; polje mere je debljina zida', () => {
    const d = drawnPreset('u', 60, 28, 2);
    expect(materialDimFields(mat(d))).toEqual([{ key: 'c', label: 'Debljina zida', value: 2, wall: true }]);
    const thick = materialShape(mat(d, { wallMm: 3 }));
    expect(thick.type === 'linear' && thick.wall).toBe(3);
    const s = sectionOfDrawn(d, 3);
    expect(s.w).toBeCloseTo(61, 6);
  });

  it('nepotpun crtež (jedna tačka, zid 0) se ne koristi: važi presek iz naziva', () => {
    const bad: DrawnSection = { kind: 'u', pts: [[0, 0]], wall: 2, closed: false };
    expect(drawnValid(bad)).toBe(false);
    expect(drawnValid({ ...drawnPreset('u', 60, 28, 2), wall: 0 })).toBe(false);
    expect(materialShape(mat(bad)).type === 'linear' && materialShape(mat(bad)).group).toBe('kv');
  });

  it('predlog naziva sadrži mere', () => {
    expect(drawnName(drawnPreset('u', 60, 28, 2))).toBe('U profil 60×28×2 (nacrtan)');
    expect(drawnName(drawnPreset('kv', 40, 20, 1.5))).toBe('Cev 40×20×1,5 (nacrtan)');
  });

  it('crtanje modela koristi nacrtan presek: širina dela, spisak materijala', () => {
    const m = mat(drawnPreset('u', 60, 28, 2));
    const model = { ...newCustomModel('cm_d'), parts: [{ id: 'p1', materialId: m.id, x: 0, y: 100, lengthMm: 1000, angleDeg: 0, rot: 0, z: 0 }] };
    const [r] = resolveParts(model, [m]);
    expect(r.shape.type).toBe('linear');
    const b = partBounds(r.part, r.shape);
    expect(b.y1 - b.y0).toBeCloseTo(60, 6);
    expect(customBom(model, [m])[0]).toMatchObject({ qty: 1, total: 500 });
  });
});
