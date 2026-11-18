import { describe, expect, it } from 'vitest';
import { createFence, createProject } from '../domain/models/factories';
import { buildBom, computePrice } from '../domain/pricing/calc';
import { buildQuotePrices, quoteDisplayAmounts } from '../domain/pricing/quote';
import { finishingProject, FINISHING_MATERIALS as MATS, FINISHING_SPECS as SPECS } from './fixtures/finishing';
import { SEED_MATERIALS } from './fixtures/materials';

describe('cene elemenata za kupca u ponudi', () => {
  it('zbir elemenata je isti kao interna kalkulacija sa zajedničkim stubovima, radom i plastificiranjem', () => {
    const p = finishingProject();
    Object.assign(p.settings.pricing, { profitMode: 'margin', profitPercent: 31.5, discountPercent: 7.5, coatingPerM2Rsd: 1300, laborPerM2Rsd: 2800, laborPerGateRsd: 9000, installPerMeterRsd: 4500, installPerGateRsd: 12000 });
    const quote = buildQuotePrices(p, MATS, SPECS);
    expect(quote.elements.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(quote.totalRsd).toBe(computePrice(p, MATS, SPECS).grossTotal);
    expect(quote.elements.reduce((sum, e) => sum + e.amountRsd, 0)).toBeCloseTo(quote.totalRsd, 8);
    expect(quote.elements[1].amountRsd).toBeGreaterThan(quote.elements[0].amountRsd);
    expect(quote.elements[0].amountRsd).toBeCloseTo(quote.elements[2].amountRsd, 8);
    for (const cur of ['RSD', 'EUR']) {
      const d = quoteDisplayAmounts(quote, cur, 117.2);
      expect(d.elements.reduce((sum, v) => sum + Math.round(v * 10 ** d.digits), 0)).toBe(Math.round(d.total * 10 ** d.digits));
    }
  });
  it('elementi sa različitim materijalima dobijaju svoj trošak, bez izjednačavanja cene', () => {
    const p = createProject('različiti', [createFence({ modelId: 'h_white', widthMm: 2000 }), createFence({ modelId: 'h_boards', widthMm: 2000 })]);
    Object.assign(p.settings.pricing, { profitMode: 'markup', profitPercent: 0, discountPercent: 0, vatPercent: 0, laborPerM2Rsd: 0, installPerMeterRsd: 0 });
    p.posts = p.posts.map((post) => ({ ...post, type: 'concrete' }));
    const mats = [MATS[0], { ...MATS[0], id: 'expensive', name: 'Cev 40×40×2', unitPrice: 500 }];
    const specs = { ...SPECS, h_boards: SPECS.h_white!.map((part) => ({ ...part, materialId: 'expensive' })) };
    const quote = buildQuotePrices(p, mats, specs);
    expect(quote.elements[1].amountRsd / quote.elements[0].amountRsd).toBeCloseTo(5, 10);
    expect(quote.totalRsd).toBeCloseTo(buildBom(p, mats, specs).reduce((sum, l) => sum + l.total, 0), 10);
  });
  it('jedan element nosi ceo iznos; otvori nisu stavke koje se naplaćuju', () => {
    const p = finishingProject();
    p.items = p.items.map((it, i) => i === 1 ? it : { kind: 'opening', id: it.id, widthMm: it.widthMm, heightMm: it.heightMm });
    const quote = buildQuotePrices(p, MATS, SPECS);
    expect(quote.elements).toEqual([{ index: 1, amountRsd: quote.totalRsd }]);
    expect(buildQuotePrices(createProject('prazno'), [], undefined)).toEqual({ elements: [], totalRsd: 0 });
  });
  it('i kod kupovine celih šipki zbir ostaje jednak ukupnoj ceni projekta', () => {
    const p = createProject('08', [createFence({ modelId: 'louver_light', widthMm: 1100 }), createFence({ modelId: 'louver_light', widthMm: 2000 })]);
    p.louverSpec = { priceBasis: 'per_bar' };
    const quote = buildQuotePrices(p, SEED_MATERIALS);
    expect(quote.elements.reduce((sum, e) => sum + e.amountRsd, 0)).toBeCloseTo(computePrice(p, SEED_MATERIALS).grossTotal, 8);
  });
  it('zaokruživanje dinara i evra ne gubi iznos na više stavki', () => {
    const quote = { elements: [0, 1, 2, 3].map((index) => ({ index, amountRsd: 0.6 })), totalRsd: 2.4 };
    expect(quoteDisplayAmounts(quote, 'RSD', 117.2)).toEqual({ elements: [1, 1, 0, 0], total: 2, digits: 0 });
    for (let count = 1; count <= 25; count++) {
      const elements = Array.from({ length: count }, (_, index) => ({ index, amountRsd: (index + 1) * 1234.56789 }));
      const totalRsd = elements.reduce((sum, e) => sum + e.amountRsd, 0);
      for (const cur of ['RSD', 'EUR']) {
        const d = quoteDisplayAmounts({ elements, totalRsd }, cur, 117.2);
        expect(d.elements.reduce((sum, v) => sum + Math.round(v * 10 ** d.digits), 0)).toBe(Math.round(d.total * 10 ** d.digits));
      }
    }
  });
});
