import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { createFence, createProject } from '../domain/models/factories';
import { buildBom } from '../domain/pricing/calc';
import { buildCutList } from '../domain/pricing/production';
import { createCorner } from '../domain/models/factories';
import { CORNER_GAP_MM } from '../domain/models/types';
import { computePlan } from '../domain/geometry/plan';
import { buildRail04Sheet, planBars } from '../domain/pricing/railSpec';
import { changeModel, insertItem, updateItemParams } from '../domain/geometry/operations';

// radni primer: panel širine 1000 mm preko stubova (razmak osa 960), stubovi 1000 mm, 4 prečke na 200/400/600/800
const example = () => createProject('04', [createFence({ modelId: 'rail_black', widthMm: 960, heightMm: 1000, params: { barSizeMm: 16, gapMm: 184, frameMm: 0 } })]);

describe('model 04: sastavnica i krojna lista', () => {
  it('daje mere iz radnog primera', () => {
    const sheet = buildRail04Sheet(example())!;
    expect(sheet.panels[0]).toMatchObject({ axisMm: 960, heightMm: 1000, rodHeightsMm: [200, 400, 600, 800] });
    expect(sheet.runs[0]).toMatchObject({ lengthMm: 1000, pieceLensMm: [1000], postCount: 2 });
    const byMark = Object.fromEntries(sheet.cuts.map((c) => [c.mark, c]));
    expect(byMark['S-01']).toMatchObject({ qty: 2, lengthMm: 1000, totalMm: 2000 });
    expect(byMark['R-01']).toMatchObject({ qty: 1, lengthMm: 1000 });
    expect(byMark['P-01']).toMatchObject({ qty: 4, lengthMm: 1000, totalMm: 4000 });
    expect(byMark['M-01']).toMatchObject({ qty: 4, lengthMm: 1000 });
    expect(sheet.mainTotalMm).toBe(7000);
    const qty = (pos: number) => sheet.bom.find((r) => r.pos === pos)!.qty;
    expect([1, 2, 3, 4, 5, 6, 8, 9, 10].map(qty)).toEqual(['2 kom × 1.000 mm', '1 kom × 1.000 mm', '4 kom × 1.000 mm', '2 kom', '2 kom', '8 kom', '2 kom', '8 kom', '2 kom']);
    expect(qty(7)).toBe('do 8 kom');
    expect(qty(11)).toBe('do 4 m');
    expect(qty(12)).toBe('2 kompleta');
  });

  it('ostaci šipki od 6000 mm sa rezom 3 mm kao u primeru', () => {
    expect(planBars([1000, 1000]).leftover).toEqual([3994]);
    expect(planBars([1000]).leftover).toEqual([4997]);
    expect(planBars([1000, 1000, 1000, 1000]).leftover).toEqual([1988]);
    const sheet = buildRail04Sheet(example())!;
    expect(sheet.bars.map((b) => b.leftoverMm)).toEqual([3994, 4997, 1988, 1988]);
  });

  it('povezani paneli dele stub; sastavnica ulazi u spisak materijala bez stavki bez cene', () => {
    const p = createProject('04x3', [1, 2, 3].map(() => createFence({ modelId: 'rail_black', widthMm: 2000 })));
    const sheet = buildRail04Sheet(p)!;
    expect(sheet.posts).toHaveLength(4);
    const bom = buildBom(p, SEED_MATERIALS);
    expect(bom.filter((l) => l.missingPrice)).toEqual([]);
    expect(bom.find((l) => l.materialId === 'mat_pega_06')!.geometricQty).toBeCloseTo(4 * 1.6, 3);
    expect(bom.find((l) => l.materialId === 'mat_pega_eco_11')!.geometricQty).toBe(4); // po jedan na svakom stubu niza
    expect(bom.some((l) => l.materialId === 'mat_post_alu')).toBe(false);
    expect(buildCutList(p)).toEqual([]); // opšta krojna lista ne dupliraju model 04
  });

  it('projekat bez modela 04 nema posebnu listu', () => {
    expect(buildRail04Sheet(createProject('x', [createFence({})]))).toBeNull();
  });

  it('niz polja se seče u najdužim komadima: 3 × 2000 mm = 4 prečke od po 6 m, jedan rukohvat od 6 m', () => {
    const p = createProject('04x3', [1, 2, 3].map(() => createFence({ modelId: 'rail_black', widthMm: 2000, heightMm: 1600 })));
    const sheet = buildRail04Sheet(p)!;
    expect(sheet.runs).toHaveLength(1);
    expect(planBars([6000]).leftover).toEqual([0]); // cela šipka, bez reza
    expect(sheet.bars.filter((b) => b.profile.startsWith('Prečke')).every((b) => b.leftoverMm === 0 && b.cutsMm === 0)).toBe(true);
    expect(sheet.runs[0].pieceLensMm).toEqual([6000]); // 6040 mm: prepust od 40 mm preko šipke se skraćuje
    expect(sheet.runs[0].trimmedMm).toBe(40);
    const by = Object.fromEntries(sheet.cuts.map((c) => [c.mark, c]));
    expect(by['R-01']).toMatchObject({ qty: 1, lengthMm: 6000 });
    expect(by['P-01']).toMatchObject({ qty: 4, lengthMm: 6000, totalMm: 24000 });
    expect(by['S-01']).toMatchObject({ qty: 4, lengthMm: 1600 });
    const qty = (pos: number) => sheet.bom.find((r) => r.pos === pos)!.qty;
    expect(qty(2)).toBe('1 kom × 6.000 mm');
    expect(qty(3)).toBe('4 kom × 6.000 mm');
    expect(qty(9)).toBe('8 kom'); // završeci prečki samo na krajevima: 4 prečke × 2
    expect(qty(8)).toBe('2 kom');
    expect(qty(6)).toBe('16 kom'); // po jedan nosač na svakom od 4 stuba za svaku od 4 prečke
  });

  it('razdvojeni nizovi (prekid drugim elementom ili različita visina) su zasebni komadi', () => {
    const p = createProject('x', [createFence({ modelId: 'rail_black', widthMm: 2000 }), createFence({ modelId: 'h_narrow', widthMm: 2000 }), createFence({ modelId: 'rail_black', widthMm: 2000 })]);
    const sheet = buildRail04Sheet(p)!;
    expect(sheet.runs.map((r) => r.pieceLensMm)).toEqual([[2040], [2040]]);
    const q = buildRail04Sheet(createProject('y', [createFence({ modelId: 'rail_black', widthMm: 2000, heightMm: 1600 }), createFence({ modelId: 'rail_black', widthMm: 2000, heightMm: 1200 })]))!;
    expect(q.runs).toHaveLength(2);
  });

  it('niz duži od šipke se deli na najduže komade', () => {
    const p = createProject('long', [1, 2, 3, 4].map(() => createFence({ modelId: 'rail_black', widthMm: 2500 }))); // 10040 mm
    const sheet = buildRail04Sheet(p)!;
    expect(sheet.runs[0].pieceLensMm).toEqual([6000, 4040]);
    expect(sheet.notes.some((n) => n.includes('spajaju'))).toBe(true);
  });

  it('broj prečki se bira: standard 4, na 1000 mm moze 5 i raspored se menja', () => {
    const mk = (barCount?: number) => createProject('r', [createFence({ modelId: 'rail_black', widthMm: 960, heightMm: 1000, params: { barSizeMm: 16, gapMm: 184, frameMm: 0, barCount } })]);
    expect(buildRail04Sheet(mk())!.panels[0].rodHeightsMm).toEqual([200, 400, 600, 800]);
    const five = buildRail04Sheet(mk(5))!;
    expect(five.panels[0].rodHeightsMm).toEqual([160, 320, 480, 640, 800]);
    expect(five.cuts.find((c) => c.mark === 'P-01')).toMatchObject({ qty: 5, lengthMm: 1000 });
    expect(five.bom.find((r) => r.pos === 9)!.qty).toBe('10 kom'); // završeci: 2 po prečki
    expect(five.bom.find((r) => r.pos === 6)!.qty).toBe('10 kom'); // nosači: 2 stuba × 5 prečki
    const bom = buildBom(mk(5), SEED_MATERIALS);
    expect(bom.find((l) => l.materialId === 'mat_pega_2275_1')!.geometricQty).toBeCloseTo(5, 6);
    // ne može više prečki nego što staje u visinu (poslednja 200 mm ispod vrha, razmak najmanje 100 mm)
    expect(buildRail04Sheet(mk(40))!.panels[0].rodHeightsMm.length).toBe(8);
  });

  it('broj prečki je isti na celoj ogradi: izmena jednog polja menja sva, novo polje preuzima postojeći broj', () => {
    const counts = (p: ReturnType<typeof createProject>) => p.items.map((i) => (i.kind === 'fence' ? i.params.barCount : null));
    let p = createProject('s', [1, 2, 3].map(() => createFence({ modelId: 'rail_black' })));
    p = updateItemParams(p, p.items[1].id, { barCount: 5 });
    expect(counts(p)).toEqual([5, 5, 5]);
    p = insertItem(p, createFence({ modelId: 'rail_black' }), 3);
    expect(counts(p)).toEqual([5, 5, 5, 5]);
    p = insertItem(p, createFence({ modelId: 'h_narrow' }), 4);
    p = changeModel(p, p.items[4].id, 'rail_black');
    expect(counts(p)).toEqual([5, 5, 5, 5, 5]);
    const sheet = buildRail04Sheet(p)!;
    expect(new Set(sheet.panels.map((x) => x.rodHeightsMm.length))).toEqual(new Set([5]));
    expect(sheet.runs).toHaveLength(1); // isti raspored → jedan niz, jedna neprekinuta prečka po nivou
  });

  it('ugaoni spoj: stubovi na 0, 950, 1900, razmak od 100 mm za savijanje cevi, pa se nastavlja (primer iz zahteva)', () => {
    const fence = () => createFence({ modelId: 'rail_black', widthMm: 950, heightMm: 1000 });
    const p = createProject('ugao', [fence(), fence(), createCorner({ bendDeg: 90 }), fence(), fence()]);
    // dva stuba uz spoj (jedan pre savijanja, jedan posle), ugao nije na stubu
    expect(p.posts).toHaveLength(6);
    const plan = computePlan(p);
    expect(plan.posts.map((q) => [Math.round(q.at.x), Math.round(q.at.z)])).toEqual([[0, 0], [950, 0], [1900, 0], [1900 + CORNER_GAP_MM / 2, CORNER_GAP_MM / 2], [1900 + CORNER_GAP_MM / 2, CORNER_GAP_MM / 2 + 950], [1900 + CORNER_GAP_MM / 2, CORNER_GAP_MM / 2 + 1900]]);
    expect(plan.items[2].bend).toMatchObject({ deg: 90 });
    expect(plan.items[3].heading).toBeCloseTo(Math.PI / 2, 9);
    // rukohvat i prečke idu neprekinuto kroz spoj: jedan niz, jedan komad po nivou
    const sheet = buildRail04Sheet(p)!;
    expect(sheet.runs).toHaveLength(1);
    const run = sheet.runs[0];
    expect(run.postCount).toBe(6);
    expect(run.lengthMm).toBe(950 * 4 + CORNER_GAP_MM + 40);
    expect(run.pieceLensMm).toEqual([950 * 4 + CORNER_GAP_MM + 40]);
    expect(run.bends).toEqual([{ deg: 90, atMm: 20 + 1900 + CORNER_GAP_MM / 2 }]);
    const by = Object.fromEntries(sheet.cuts.map((c) => [c.mark, c]));
    expect(by['R-01']).toMatchObject({ qty: 1, lengthMm: 3840 + CORNER_GAP_MM });
    expect(by['R-01'].cut).toContain('90°');
    expect(by['P-01']).toMatchObject({ qty: 4, lengthMm: 3840 + CORNER_GAP_MM });
    expect(by['S-01']).toMatchObject({ qty: 6, lengthMm: 1000 });
    // savijanje: rukohvat + 4 prečke = 5 savijanja
    expect(sheet.bom.find((r) => r.pos === 15)!.qty).toBe('5 savijanja');
    expect(sheet.bom.find((r) => r.pos === 6)!.qty).toBe('24 kom'); // 6 stubova × 4 prečke
    const bom = buildBom(p, SEED_MATERIALS);
    expect(bom.filter((l) => l.missingPrice)).toEqual([]);
    expect(bom.find((l) => l.materialId === 'mat_pipe_bend')!.geometricQty).toBe(5);
  });

  it('ugaoni spoj bez ograde sa prečkama nema šta da savije i ne ulazi u sastavnicu', () => {
    const p = createProject('x', [createFence({ modelId: 'h_narrow' }), createCorner(), createFence({ modelId: 'h_narrow' })]);
    expect(buildRail04Sheet(p)).toBeNull();
  });
});
