import { describe, expect, it } from 'vitest';
import { insetConvex, PROFILE_BY_SKU, profileGeometry, profileSpecFor } from '../domain/models/profileDrawings';

describe('crteži profila', () => {
  it('crteži postoje samo za materijale sa crtežom iz cenovnika (cevi, profili); stope i kape imaju fotografije', () => {
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

  it('svih 44 šifre sa crtežom daju ispravnu geometriju (okvir veći od nule, kote, bez NaN)', () => {
    const skus = Object.keys(PROFILE_BY_SKU);
    expect(skus).toHaveLength(44);
    for (const sku of skus) {
      const g = profileGeometry(PROFILE_BY_SKU[sku]);
      expect(g.w, sku).toBeGreaterThan(0);
      expect(g.h, sku).toBeGreaterThan(0);
      expect(g.dims.length, sku).toBeGreaterThan(0);
      expect(g.path, sku).not.toMatch(/NaN|Infinity/);
      expect(g.facts.length, sku).toBeGreaterThan(0);
    }
  });

  it('kvadratna cev 80×20×1 (KV000007) je šuplja, L profil ima šest tačaka, H profil je 60 × 30', () => {
    expect(profileGeometry(PROFILE_BY_SKU.KV000007).path.match(/M/g)).toHaveLength(2);
    expect(profileGeometry(PROFILE_BY_SKU.KL000002).path.match(/L/g)).toHaveLength(5);
    const h = profileGeometry(PROFILE_BY_SKU.KH000001);
    expect([h.w, h.h]).toEqual([60, 30]);
    expect(h.dims.map((d) => d.label)).toEqual(['60', '30', '20', '10']);
  });

  it('složeni profili su označeni kao šematski; U 25×20×1,35 nije', () => {
    expect(profileGeometry(PROFILE_BY_SKU.KZ000002).note).toMatch(/Šematski/);
    expect(profileGeometry(PROFILE_BY_SKU.KU000005).note).toMatch(/isečen/);
    expect(profileGeometry(PROFILE_BY_SKU.KU000001).note).toBeUndefined();
  });
});
