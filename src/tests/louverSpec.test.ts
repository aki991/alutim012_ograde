import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { createFence, createProject } from '../domain/models/factories';
import type { LouverSpec } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildCutList } from '../domain/pricing/production';
import { buildLouver08Sheet } from '../domain/pricing/louverSpec';

// radni primer iz specifikacije: panel 1000 × 1000 mm (svetli otvor 1000; stubovi su zaseban sklop), s = 2, c = 2 → L = 994
const panel = (louverSpec?: Partial<LouverSpec>) => {
  const p = createProject('08', [createFence({ modelId: 'louver_light', widthMm: 1100, heightMm: 1000 })]);
  return louverSpec ? { ...p, louverSpec } : p;
};

describe('model 08: radna sastavnica i krojna lista', () => {
  it('panel 1000 × 1000: L = W − 2s − c = 994, vođice 2 × 1000, N iz visine letvice i razmaka', () => {
    const sheet = buildLouver08Sheet(panel())!;
    const p = sheet.panels[0];
    expect(p).toMatchObject({ widthMm: 1000, heightMm: 1000, fillLenMm: 994, guideLenMm: 1000 });
    expect(p.count).toBe(9);
    const by = Object.fromEntries(sheet.cuts.map((c) => [c.mark, c]));
    expect(by['U-01']).toMatchObject({ qty: 2, lengthMm: 1000, totalMm: 2000 });
    expect(by['L-01']).toMatchObject({ qty: 9, lengthMm: 994 });
    const qty = (pos: number) => sheet.bom.find((r) => r.pos === pos)!.qty;
    expect(qty(1)).toBe('2 kom');
    expect(qty(2)).toBe('9 kom');
    expect(qty(3)).toBe('18 mesta spoja'); // 2N mesta spoja, ne 2N vijaka
    expect(qty(5)).toContain('moguće'); // završeci nisu u obračunu dok se ne potvrde
    expect(qty(7)).toBe('1 m²');
    expect(sheet.status).toContain('čeka potvrdu');
  });

  it('zid, zazor i korekcija se menjaju kao zasebna polja', () => {
    const sheet = buildLouver08Sheet(panel({ wallMm: 3, clearanceMm: 4, guideExtraMm: 10 }))!;
    expect(sheet.panels[0]).toMatchObject({ fillLenMm: 990, guideLenMm: 1010 });
    expect(buildLouver08Sheet(panel({ guideCaps: true, fillCaps: true }))!.bom.find((r) => r.pos === 6)!.qty).toBe('18 kom');
  });

  it('obračun: U 60×28 nije u cenovniku (cena 0, ne menja se automatski za KU000002), osnovica po šipki kupuje cele šipke', () => {
    const p = panel();
    let bom = buildBom(p, SEED_MATERIALS);
    expect(bom.filter((l) => l.missingPrice)).toEqual([]);
    const u = bom.find((l) => l.materialId === 'mat_u_60x28')!;
    expect(u.geometricQty).toBeCloseTo(2, 6);
    expect(u.unitPriceNet).toBe(0);
    expect(bom.some((l) => l.materialId === 'mat_ek_ku000002')).toBe(false);
    expect(bom.find((l) => l.materialId === 'mat_ek_kv000007')!.geometricQty).toBeCloseTo(9 * 0.994, 6);
    bom = buildBom({ ...p, louverSpec: { priceBasis: 'per_bar', fillProfile: 'kz4' } }, SEED_MATERIALS);
    expect(bom.find((l) => l.materialId === 'mat_ek_kz000004')!.geometricQty).toBe(12); // 9 × 994 mm ne staje u jednu šipku: dve cele šipke od 6 m
    expect(bom.some((l) => l.materialId === 'mat_ek_kv000007')).toBe(false); // alternativni izbori se ne sabiraju
    expect(bom.some((l) => l.group === 'Ramovi')).toBe(false);
  });

  it('opšta krojna lista ne duplira model 08; projekat bez modela 08 nema listu', () => {
    expect(buildCutList(panel())).toEqual([]);
    expect(buildLouver08Sheet(createProject('x', [createFence({})]))).toBeNull();
  });
});
