import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { computeInfill } from '../domain/geometry/infill';
import { updatePost } from '../domain/geometry/operations';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { FENCE_MODELS } from '../domain/models/catalog';
import { catalogPostSize, isTarabicaPost, postCaps, tarabicaClearWidth, tarabicaLayout, tarabicaPostLines } from '../domain/models/tarabica';
import { buildBom } from '../domain/pricing/calc';
import { buildCuttingList } from '../domain/pricing/cutting';
import { buildWorkOrder } from '../domain/pricing/workorder';

const fence = () => createFence({ modelId: 'picket_wide', widthMm: 2000, heightMm: 1600 });
const qty = (bom: ReturnType<typeof buildBom>, materialId: string) => bom.find((l) => l.materialId === materialId)?.geometricQty ?? 0;

describe('model tarabica: raspored polja', () => {
  it('podrazumevane mere: tarabica 80, razmak 20, prepust 30', () => {
    expect(FENCE_MODELS.picket_wide.defaults).toEqual({ barSizeMm: 80, gapMm: 20, frameMm: 30 });
    expect(FENCE_MODELS.picket_wide.defaultColor).toBe('RAL 9016');
  });

  it('podrazumevano polje: svetli otvor 640 × 1200 mm sa 6 tarabica', () => {
    expect(FENCE_MODELS.picket_wide.defaultSize).toEqual({ clearWidthMm: 640, heightMm: 1200 });
    expect(tarabicaClearWidth(6, 80, 20, 30)).toBe(640);
    expect(tarabicaLayout(640, 1200, 80, 20, 30)).toMatchObject({ count: 6, gapMm: 20, startMm: 30 });
    expect(tarabicaLayout(tarabicaClearWidth(9, 80, 20, 30), 1200, 80, 20, 30).count).toBe(9);
  });

  it('krajnje tarabice su tačno za prepust od ivice polja, a razmak se ravnomerno koriguje', () => {
    const t = tarabicaLayout(1900, 1600, 80, 20, 30);
    expect(t.count).toBe(18); // 18 × 80 + 17 × 20 = 1780 ≤ 1840
    expect(t.gapMm).toBeCloseTo((1840 - 18 * 80) / 17, 6);
    expect(t.gapMm).toBeGreaterThanOrEqual(20);
    const lastRight = t.startMm + 17 * (80 + t.gapMm) + 80;
    expect(t.startMm).toBe(30);
    expect(lastRight).toBeCloseTo(1900 - 30, 6);
  });

  it('veći razmak i prepust daju manje tarabica; veoma usko polje ostaje bez greške', () => {
    const base = tarabicaLayout(1900, 1600, 80, 20, 30).count;
    expect(tarabicaLayout(1900, 1600, 80, 60, 30).count).toBeLessThan(base);
    expect(tarabicaLayout(1900, 1600, 80, 20, 150).count).toBeLessThanOrEqual(base);
    expect(tarabicaLayout(200, 1600, 80, 20, 30).count).toBe(1);
    expect(tarabicaLayout(50, 1600, 80, 20, 30).count).toBe(0);
  });

  it('geometrija: dve spojne cevi 30 × 30 preko celog polja i tarabice sa zaobljenim vrhom', () => {
    const geo = computeInfill('picket_wide', 1900, 1600, 30, 80, 20);
    const rails = geo.bars.filter((b) => b.tone === 'rail');
    const slats = geo.bars.filter((b) => b.tone === 'main');
    expect(geo.frame).toBe(0);
    expect(rails).toHaveLength(2);
    for (const r of rails) { expect(r.x).toBe(0); expect(r.w).toBe(1900); expect(r.h).toBe(30); }
    expect(rails[0].y + 15).toBe(200); // osa gornje cevi 200 mm od vrha
    expect(1600 - (rails[1].y + 15)).toBe(200); // osa donje cevi 200 mm od dna
    expect(slats).toHaveLength(18);
    expect(slats.every((b) => b.w === 80 && b.h === 1600 && b.round)).toBe(true);
    // krajnje tarabice ne prelaze spojne cevi: cevi vire za prepust
    expect(Math.min(...slats.map((b) => b.x))).toBe(30);
    expect(Math.max(...slats.map((b) => b.x + b.w))).toBeCloseTo(1870, 6);
  });
});

describe('model tarabica: sastavnica', () => {
  const project = () => createProject('Tarabica', [fence(), fence()]);
  const mat = SEED_MATERIALS;

  it('sastavnica polja: cevi 80×20, čepovi, spojne cevi 30×30 i vijci', () => {
    const p = project();
    const bom = buildBom(p, mat);
    // stub 100 mm: svetli otvor 1900 → 18 tarabica po polju
    expect(qty(bom, 'mat_ek_kv000007')).toBeCloseTo((2 * 18 * (1600 - 40)) / 1000, 6); // dužina = visina − 40 (čep)
    expect(qty(bom, 'mat_ek_k100018')).toBe(36); // jedan čep po tarabici
    expect(qty(bom, 'mat_ek_ktwm3899')).toBeCloseTo((2 * 2 * 1900) / 1000, 6); // 2 cevi po polju, dužine svetlog otvora
    expect(qty(bom, 'mat_screw')).toBe(72);
  });

  it('stubovi uz tarabicu: cev 100×100 po visini i ravna kapa na vrhu; bez opšteg aluminijumskog stuba', () => {
    const p = project();
    const bom = buildBom(p, mat);
    expect(p.posts).toHaveLength(3);
    expect(qty(bom, 'mat_ek_ktf10010020')).toBeCloseTo((3 * p.posts[0].heightMm) / 1000, 6);
    expect(qty(bom, 'mat_ek_k100014')).toBe(3); // kapa ravna 100×100 na vrhu svakog stuba
    expect(qty(bom, 'mat_post_alu')).toBe(0);
    expect(bom.some((l) => l.missingPrice)).toBe(false);
  });

  it('izbor stuba 80×80 i kapa gore i dole menja materijal', () => {
    let p = project();
    const id = p.posts[1].id;
    p = updatePost(p, id, { widthMm: 80, capTop: 'pyramid', capBottom: 'rosette' });
    const bom = buildBom(p, mat);
    expect(qty(bom, 'mat_ek_ktf808030')).toBeCloseTo(p.posts[1].heightMm / 1000, 6);
    expect(qty(bom, 'mat_ek_k100010')).toBe(1); // kapa pismo 80×80
    expect(qty(bom, 'mat_ek_k100007')).toBe(1); // rozetna 80×80
    expect(qty(bom, 'mat_ek_k100014')).toBe(2); // ostala dva stuba imaju ravnu kapu 100×100
    p = updatePost(p, id, { capTop: 'none', capBottom: 'none' });
    expect(buildBom(p, mat).some((l) => l.materialId === 'mat_ek_k100010' || l.materialId === 'mat_ek_k100007')).toBe(false);
  });

  it('izbor kape ne zaključava stub (visina i tip ostaju automatski)', () => {
    const p = updatePost(project(), project().posts[0].id, { capTop: 'rosette' });
    expect(p.posts.every((x) => !x.custom)).toBe(true);
  });

  it('pomoćne funkcije: veličina iz kataloga, kape po stubu i prepoznavanje stuba uz tarabicu', () => {
    expect([60, 80, 89, 90, 100, 120].map(catalogPostSize)).toEqual([80, 80, 80, 100, 100, 100]);
    expect(postCaps({})).toEqual({ top: 'flat', bottom: 'none' });
    expect(tarabicaPostLines({ widthMm: 100, heightMm: 1800, capTop: 'rosette', capBottom: 'flat' }).map((l) => l.materialId)).toEqual(['mat_ek_ktf10010020', 'mat_ek_k100008', 'mat_ek_k100014']);
    const p = createProject('Mešano', [fence(), createFence({ modelId: 'h_narrow' })]);
    expect(p.posts.map((post, i) => isTarabicaPost(p.items, post, i))).toEqual([true, true, false]);
    const g = createProject('Kapija', [createGate('pedestrian', { infillModelId: 'picket_wide' })]);
    expect(isTarabicaPost(g.items, g.posts[0], 0)).toBe(true);
    expect(isTarabicaPost(g.items, { type: 'concrete' }, 0)).toBe(false); // betonski stub ostaje običan
  });

  it('krojna lista: tarabice, spojne cevi i cevi stubova po pozicijama', () => {
    const list = buildCuttingList(createProject('K', [fence(), fence()]), undefined, SEED_MATERIALS);
    const names = list.profiles.map((x) => x.profile).join(' | ');
    expect(names).toContain('80×20');
    expect(names).toContain('30×30');
    expect(names).toContain('100×100');
    const slats = list.profiles.find((x) => x.profile.includes('80×20'))!;
    expect(slats.pieceCount).toBe(36);
    expect(slats.summary[0].lengthMm).toBe(1560);
    const posts = list.profiles.find((x) => x.profile.includes('100×100'))!;
    expect(posts.pieceCount).toBe(3);
    expect(list.positions.some((x) => x.key === 'S1')).toBe(true);
  });

  it('radni nalog: kartice polja, stubovi u zasebnoj tabeli, čepovi među sitnim materijalom', () => {
    const wo = buildWorkOrder(createProject('R', [fence(), fence()]), undefined, SEED_MATERIALS, { stockMm: 6000, kerfMm: 3 });
    expect(wo.elements.map((e) => e.key)).toEqual(['1', '2']);
    expect(wo.posts).toHaveLength(3);
    const partsQty = wo.elements.reduce((s, e) => s + e.parts.reduce((x, p) => x + p.qty, 0), 0);
    expect(partsQty).toBe(36 + 4); // tarabice + četiri spojne cevi; cevi stubova su u tabeli stubova
    expect(wo.small.some((x) => x.name.includes('Čep tarabice'))).toBe(true);
  });
});
