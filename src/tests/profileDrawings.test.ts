import { describe, expect, it } from 'vitest';
import { insetConvex, profileGeometry, profileSpecFor } from '../domain/models/profileDrawings';

describe('crteži profila', () => {
  it('crteži postoje samo za materijale sa crtežom (KU000002, KZ000003)', () => {
    expect(profileSpecFor({ sku: 'KU000002' })).toMatchObject({ kind: 'u', a: 60, b: 20, c: 2 });
    expect(profileSpecFor({ sku: 'kz000003' })).toMatchObject({ kind: 'slant', width: 80, height: 20, wall: 1 });
    expect(profileSpecFor({ sku: 'DEMO-HP-100' })).toBeNull();
  });

  it('U profil: okvir A × B i tri kote (A, B, C)', () => {
    const g = profileGeometry({ kind: 'u', a: 60, b: 20, c: 2 });
    expect([g.w, g.h]).toEqual([60, 20]);
    expect(g.dims.map((d) => d.label)).toEqual(['A = 60', 'B = 20', 'C = 2']);
  });

  it('zakošena letvica: šuplja (dve putanje), okvir 105,6 × 20', () => {
    const g = profileGeometry({ kind: 'slant', width: 80, height: 20, wall: 1, offset: 25.6 });
    expect(g.path.match(/M/g)).toHaveLength(2);
    expect(g.w).toBeCloseTo(105.6);
    expect(g.dims.map((d) => d.label)).toEqual(['80', '20', '1']);
  });

  it('insetConvex pomera ivice kvadrata ka unutra za debljinu zida', () => {
    const r = insetConvex([[0, 0], [10, 0], [10, 10], [0, 10]], 1);
    const xs = r.map((p) => p[0]); const ys = r.map((p) => p[1]);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 9, 1, 9]);
  });
});
