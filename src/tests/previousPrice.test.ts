import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING } from '../domain/models/factories';
import type { Material } from '../domain/models/types';
import { previousPrice, previousPricing, pricingRestored, pricingWithNew, withNewPrice, withRestoredPrice } from '../domain/pricing/previousPrice';

const MAT: Material = { id: 'm', sku: 'X', name: 'Kvadratna cev 80×80×3', category: 'stub', unit: 'm', unitPrice: 0, wastePercent: 0, demo: false };

describe('vrati staru cenu u kalkulaciji', () => {
  it('materijal: izmena pamti staru cenu, dugme je vraća i nestaje', () => {
    expect(previousPrice(MAT)).toBeNull();
    const a = withNewPrice(MAT, 620);
    expect([a.unitPrice, previousPrice(a)]).toEqual([620, 0]);
    const b = withNewPrice(a, 650); // pamti se cena pre poslednje izmene
    expect([b.unitPrice, previousPrice(b)]).toEqual([650, 620]);
    const c = withRestoredPrice(b);
    expect([c.unitPrice, previousPrice(c)]).toEqual([620, null]);
    expect(withNewPrice(c, 620)).toBe(c); // ista cena ne menja ništa
  });

  it('cene rada, montaže i plastificiranja', () => {
    const pr = { ...DEFAULT_PRICING, laborPerM2Rsd: 1000 };
    const a = pricingWithNew(pr, 'laborPerM2Rsd', 1200);
    expect([a.laborPerM2Rsd, previousPricing(a, 'laborPerM2Rsd'), previousPricing(a, 'installPerMeterRsd')]).toEqual([1200, 1000, null]);
    const b = pricingWithNew(a, 'coatingPerM2Rsd', 900);
    const c = pricingRestored(b, 'laborPerM2Rsd');
    expect([c.laborPerM2Rsd, previousPricing(c, 'laborPerM2Rsd'), c.coatingPerM2Rsd, previousPricing(c, 'coatingPerM2Rsd')]).toEqual([1000, null, 900, pr.coatingPerM2Rsd ?? 0]);
  });
});
