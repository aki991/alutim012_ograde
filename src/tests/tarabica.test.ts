import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { computeInfill } from '../domain/geometry/infill';
import { gateLeafPoses } from '../domain/geometry/gates';
import { computeLayout, outerWidthMm } from '../domain/geometry/layout';
import { newItemFor } from '../domain/geometry/newItem';
import { insertItem, setPlinthWidth, updatePost } from '../domain/geometry/operations';
import { createFence, createGate, createOpening, createProject } from '../domain/models/factories';
import { FENCE_MODELS } from '../domain/models/catalog';
import { hasLightFence, isLightColor } from '../domain/models/catalog';
import { capTiers, catalogPostSize, isTarabicaPost, postCaps, tarabicaCapHeight, tarabicaClearWidth, tarabicaDomeMm, tarabicaLayout, tarabicaPostLines } from '../domain/models/tarabica';
import { buildBom } from '../domain/pricing/calc';
import { buildCuttingList } from '../domain/pricing/cutting';
import { buildWorkOrder } from '../domain/pricing/workorder';

const fence = () => createFence({ modelId: 'picket_wide', widthMm: 2000, heightMm: 1600 });
const qty = (bom: ReturnType<typeof buildBom>, materialId: string) => bom.find((l) => l.materialId === materialId)?.geometricQty ?? 0;

describe('model tarabica: raspored polja', () => {
  it('podrazumevane mere: tarabica 80, razmak 20, prepust 30', () => {
    expect(FENCE_MODELS.picket_wide.defaults).toEqual({ barSizeMm: 80, gapMm: 20, frameMm: 30, liftMm: 40 });
    expect(FENCE_MODELS.picket_wide.defaultColor).toBe('BELA');
  });

  it('početna veličina polja je 1000 × 1000 mm, stubovi su visine ograde; svetli otvor sa n tarabica', () => {
    expect(FENCE_MODELS.picket_wide.defaultSize).toEqual({ widthMm: 1000, heightMm: 1000 });
    expect(FENCE_MODELS.picket_wide.postExtraMm).toBe(0);
    expect(tarabicaClearWidth(6, 80, 20, 30)).toBe(640);
    expect(tarabicaLayout(640, 1200, 80, 20, 30)).toMatchObject({ count: 6, gapMm: 20, startMm: 30 });
    expect(tarabicaLayout(tarabicaClearWidth(9, 80, 20, 30), 1200, 80, 20, 30).count).toBe(9);
  });

  it('čep tarabice: kupola 0,425 × širina i okovratnik; dužina cevi = visina − visina čepa', () => {
    expect(tarabicaDomeMm(80)).toBe(34);
    expect(tarabicaCapHeight(80)).toBe(40);
    expect(tarabicaCapHeight(100)).toBe(49); // kupola 43 + okovratnik 6
    const bom = buildBom(createProject('C', [createFence({ modelId: 'picket_wide', widthMm: 1040, heightMm: 1200, params: { barSizeMm: 100, gapMm: 20, frameMm: 30 } })]), SEED_MATERIALS);
    const slats = tarabicaLayout(940, 1200, 100, 20, 30).count; // svetli otvor = 1040 − stubovi 100
    expect(slats).toBe(7);
    expect(qty(bom, 'mat_ek_kv000007')).toBeCloseTo((slats * (1200 - 40 - 49)) / 1000, 6);
  });

  it('kape iz kataloga: stepenici po vrsti i veličini stuba', () => {
    expect(capTiers('none', 100)).toEqual([]);
    expect(capTiers('flat', 100)).toHaveLength(1);
    const pyr = capTiers('pyramid', 80);
    expect(pyr).toHaveLength(2);
    expect(pyr[1].topW).toBeLessThan(pyr[1].bottomW); // vrh piramide je uži od podnožja
    const ros = capTiers('rosette', 100);
    expect(ros[0].bottomW).toBeGreaterThan(100); // rozetna je šira od stuba
    expect(ros[1].bottomW).toBeLessThan(ros[0].bottomW); // povišen vrat
  });

  it('tarabice su podignute od poda (podrazumevano 40 mm), vrh polja ostaje', () => {
    const geo = computeInfill('picket_wide', 1900, 1200, 30, 80, 20, undefined, 40);
    const slats = geo.bars.filter((b) => b.tone === 'main');
    expect(slats.every((b) => b.y === 0 && b.h === 1160)).toBe(true); // donji kraj je 40 mm iznad poda
    expect(computeInfill('picket_wide', 1900, 1200, 30, 80, 20, undefined, 100).bars.find((b) => b.tone === 'main')!.h).toBe(1100);
    expect(tarabicaLayout(1900, 1200, 80, 20, 30).liftMm).toBe(40);
    expect(tarabicaLayout(1900, 1200, 80, 20, 30, 0).slatLenMm).toBe(1200);
    expect(tarabicaLayout(1900, 300, 80, 20, 30, 250).liftMm).toBe(100); // najviše trećina visine
  });

  it('kape: na vrhu samo ravna, pismo ili bez; rozetna samo u dnu', () => {
    expect(postCaps({ capTop: 'rosette' }).top).toBe('flat');
    expect(postCaps({ capTop: 'none' }).top).toBe('none');
    expect(postCaps({ capBottom: 'flat' }).bottom).toBe('none');
    expect(postCaps({ capBottom: 'rosette' }).bottom).toBe('rosette');
  });

  it('bela boja je čista bela, a svetle boje daju sivu pozadinu u editoru', () => {
    expect(FENCE_MODELS.picket_wide.defaultColor).toBe('BELA');
    expect(isLightColor('BELA')).toBe(true);
    expect(isLightColor('RAL 9016')).toBe(true);
    expect(isLightColor('RAL 7016')).toBe(false);
    expect(hasLightFence([{ kind: 'fence', color: 'RAL 7016' }, { kind: 'opening' }])).toBe(false);
    expect(hasLightFence([{ kind: 'fence', color: 'RAL 7016' }, { kind: 'gate', color: 'BELA' }])).toBe(true);
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
    expect(slats.every((b) => b.w === 80 && b.h === 1560 && b.round)).toBe(true);
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
    expect(qty(bom, 'mat_ek_kv000007')).toBeCloseTo((2 * 18 * (1600 - 40 - 40)) / 1000, 6); // dužina = visina − razmak od poda (40) − čep (40)
    expect(qty(bom, 'mat_ek_k100018')).toBe(36); // jedan čep po tarabici
    expect(qty(bom, 'mat_ek_ktwm3899')).toBeCloseTo((2 * 2 * 1900) / 1000, 6); // 2 cevi po polju, dužine svetlog otvora
    expect(qty(bom, 'mat_screw')).toBe(0); // način spajanja nije potvrđen: vijci su u specifikaciji isključeni
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
    expect(tarabicaPostLines({ widthMm: 100, heightMm: 1800, capTop: 'pyramid', capBottom: 'rosette' }).map((l) => l.materialId)).toEqual(['mat_ek_ktf10010020', 'mat_ek_k100011', 'mat_ek_k100008']);
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
    expect(slats.summary[0].lengthMm).toBe(1520);
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

describe('samo podnožje ispod polja (bez betonskog stuba)', () => {
  it('polje sa podnožjem: visina podnožja u rasporedu, stub ga prati, a beton ulazi u sastavnicu', () => {
    const f = createFence({ modelId: 'picket_wide', widthMm: 840, heightMm: 1200, plinthMm: 400 });
    const p = createProject('P', [f, createFence({ modelId: 'picket_wide', widthMm: 840, heightMm: 1200 })]);
    const lay = computeLayout(p);
    expect(lay.items[0].plinthMm).toBe(400);
    expect(lay.items[1].plinthMm).toBe(0);
    expect(p.posts[0].type).toBe('aluminium'); // stub ostaje običan
    expect(p.posts[0].heightMm).toBe(1200); // visina stuba se meri od vrha podnožja, kao visina polja
    expect(lay.posts[0].baseMm).toBe(400);
    expect(lay.maxHeightMm).toBe(1600); // vrh: podnožje + visina
    const bom = buildBom(p, SEED_MATERIALS);
    // betonsko podnožje se crta, ali ne ulazi u ponudu (ne izvodi ga aluminijumska radnja)
    expect(qty(bom, 'mat_concrete_plinth')).toBe(0);
  });
});

describe('stubovi na podnožju, prazan otvor bez stubova, mere novog elementa', () => {
  const posts = (p: ReturnType<typeof createProject>) => computeLayout(p).posts;

  it('aluminijumski stubovi stoje na podnožju ograde; uz kapiju ili ogradu bez podnožja na tlu', () => {
    const p = createProject('S', [
      createFence({ modelId: 'picket_wide', plinthMm: 400 }),
      createFence({ modelId: 'picket_wide', plinthMm: 400 }),
      createFence({ modelId: 'picket_wide' }),
    ]);
    expect(posts(p).map((lp) => lp.baseMm)).toEqual([400, 400, 0, 0]);
    const withGate = createProject('G', [createFence({ modelId: 'picket_wide', plinthMm: 400 }), createGate('pedestrian', { infillModelId: 'picket_wide' })]);
    expect(posts(withGate).map((lp) => lp.baseMm)).toEqual([400, 0, 0]);
    // cev stuba je visine stuba iznad podnožja
    const bom = buildBom(createProject('B', [createFence({ modelId: 'picket_wide', plinthMm: 400 })]), SEED_MATERIALS);
    const p1 = createProject('B', [createFence({ modelId: 'picket_wide', plinthMm: 400 })]);
    expect(qty(bom, 'mat_ek_ktf10010020')).toBeCloseTo((2 * p1.posts[0].heightMm) / 1000, 6);
  });

  it('stub uz tarabicu je visine ograde (bez 200 mm); sa podnožjem se visina meri od vrha podnožja', () => {
    const p = createProject('H', [createFence({ modelId: 'picket_wide', heightMm: 1000 })]);
    expect(p.posts.map((x) => x.heightMm)).toEqual([1000, 1000]);
    const q = createProject('H', [createFence({ modelId: 'picket_wide', heightMm: 1000, plinthMm: 400 })]);
    expect(q.posts.map((x) => x.heightMm)).toEqual([1000, 1000]);
    expect(computeLayout(q).posts.map((lp) => lp.baseMm + lp.post.heightMm)).toEqual([1400, 1400]); // vrh stuba je u liniji sa vrhom ograde
  });

  it('prazan otvor je samo razmak: stub uz koji je samo otvor se ne postavlja, a stubovi ograda ostaju', () => {
    const fence = () => createFence({ modelId: 'picket_wide' });
    const alone = createProject('O', [createOpening({ widthMm: 1500 })]);
    expect(posts(alone).map((lp) => lp.hidden)).toEqual([true, true]);
    expect(computeLayout(alone).postCount).toBe(0);
    const mid = createProject('M', [fence(), createOpening({ widthMm: 1500 }), fence()]);
    expect(posts(mid).map((lp) => lp.hidden)).toEqual([false, false, false, false]);
    const trailing = createProject('T', [fence(), createOpening({ widthMm: 1500 })]);
    expect(posts(trailing).map((lp) => lp.hidden)).toEqual([false, false, true]);
    expect(computeLayout(trailing).postCount).toBe(2);
    // skriveni stub nema širinu: otvor zauzima ceo zadati razmak i ne ulazi u sastavnicu stubova
    expect(computeLayout(alone).items[0].clearWidth).toBe(1500);
    expect(qty(buildBom(trailing, SEED_MATERIALS), 'mat_ek_ktf10010020')).toBeCloseTo((2 * trailing.posts[0].heightMm) / 1000, 6);
  });

  it('novi element ima mere i izgled postojeće ograde (izabrane ili poslednje)', () => {
    let p = createProject('N', [createFence({ modelId: 'picket_wide', widthMm: 1400, heightMm: 900, plinthMm: 300, params: { barSizeMm: 80, gapMm: 30, frameMm: 40, liftMm: 60 } })]);
    const a = newItemFor(p, { kind: 'fence', modelId: 'picket_wide' }, 'picket_wide');
    expect(a.item.heightMm).toBe(900);
    expect(a.outerWidthMm).toBe(1400 + 100); // spoljna širina = modularna + stubovi
    expect(a.item.kind === 'fence' && a.item.params).toMatchObject({ gapMm: 30, frameMm: 40, liftMm: 60 });
    expect(a.item.kind === 'fence' && a.item.plinthMm).toBe(300);
    const g = newItemFor(p, { kind: 'gate', gateType: 'pedestrian', modelId: 'picket_wide' }, 'picket_wide');
    expect(g.item.heightMm).toBe(900);
    expect(g.outerWidthMm).toBe(g.item.widthMm); // širina kapije ostaje po vrsti kapije
    const o = newItemFor(p, { kind: 'opening' }, 'picket_wide');
    expect(o.item.heightMm).toBe(900);
    expect(o.outerWidthMm).toBe(1500);
    // izabrano polje je referenca, ne poslednje
    p = { ...p, items: [...p.items, createFence({ modelId: 'picket_wide', widthMm: 2000, heightMm: 1100 })] };
    expect(newItemFor(p, { kind: 'fence', modelId: 'picket_wide' }, 'picket_wide', p.items[0].id).item.heightMm).toBe(900);
    expect(newItemFor(p, { kind: 'fence', modelId: 'picket_wide' }, 'picket_wide').item.heightMm).toBe(1100);
    // prazan projekat: početna veličina modela 1000 × 1000
    const empty = createProject('E');
    const f = newItemFor(empty, { kind: 'fence', modelId: 'picket_wide' }, 'picket_wide');
    expect([f.item.heightMm, f.outerWidthMm]).toEqual([1000, 1000]);
  });

  it('novi stub između ograda je isti kao postojeći (kape, širina, boja)', () => {
    let p = createProject('I', [createFence({ modelId: 'picket_wide' })]);
    for (const post of [...p.posts]) p = updatePost(p, post.id, { widthMm: 80, color: 'RAL 5011', capTop: 'pyramid', capBottom: 'rosette' });
    p = insertItem(p, createFence({ modelId: 'picket_wide' }), 1);
    expect(p.posts).toHaveLength(3);
    for (const post of p.posts) expect(post).toMatchObject({ widthMm: 80, color: 'RAL 5011', capTop: 'pyramid', capBottom: 'rosette' });
  });

  it('prepust levo i desno može da se razlikuje: bez prepusta tarabica je do same ivice', () => {
    const t = tarabicaLayout(900, 1000, 80, 20, 0, 40, 30);
    expect(t.startMm).toBe(0);
    expect(t.startMm + (t.count - 1) * (80 + t.gapMm) + 80).toBeCloseTo(900 - 30, 6);
    const sym = tarabicaLayout(900, 1000, 80, 20, 30);
    expect(tarabicaLayout(900, 1000, 80, 20, 30, 40, 30)).toEqual(sym); // bez desnog prepusta važi levi
  });

  it('dvokrilna kapija: uz sredinu nema prepusta (razmak je razmak krila), a sastavnica se računa po krilima', () => {
    const gate = createGate('double', { infillModelId: 'picket_wide', widthMm: 3500, heightMm: 1000 });
    const p = createProject('D', [gate]);
    const li = computeLayout(p).items[0];
    const [left, right] = gateLeafPoses(gate, li.clearStart, li.clearEnd, 1);
    const o = gate.params.frameMm;
    const a = tarabicaLayout(left.widthMm, 1000, 80, 20, o, 40, 0);
    const b = tarabicaLayout(right.widthMm, 1000, 80, 20, 0, 40, o);
    // uz sredinu su tarabice do same ivice krila: razmak je samo razmak između krila (20 mm), kao između ostalih tarabica
    expect(a.startMm + (a.count - 1) * (80 + a.gapMm) + 80).toBeCloseTo(left.widthMm, 6);
    expect(b.startMm).toBe(0);
    const bom = buildBom(p, SEED_MATERIALS);
    expect(qty(bom, 'mat_ek_k100018')).toBe(a.count + b.count); // čep po tarabici
    expect(qty(bom, 'mat_ek_ktwm3899')).toBeCloseTo((2 * (left.widthMm + right.widthMm)) / 1000, 6); // dve spojne cevi po krilu
  });

  it('podnožje je jedan komad ispod polja i stubova; širina i visina se menjaju po polju', () => {
    let p = createProject('W', [createFence({ modelId: 'picket_wide', widthMm: 900, heightMm: 1000, plinthMm: 300 }), createFence({ modelId: 'picket_wide', widthMm: 900, heightMm: 1000, plinthMm: 500 })]);
    let lay = computeLayout(p);
    // podrazumevano: od spoljne ivice levog do spoljne ivice desnog stuba (ide i ispod stubova)
    expect(lay.items[0].plinthX0).toBe(-50);
    expect(lay.items[0].plinthX1).toBe(950);
    expect(lay.items[1].plinthX0).toBe(850);
    // stub između polja stoji na nižem podnožju, a visina stuba je i dalje visina polja
    expect(lay.posts.map((lp) => lp.baseMm)).toEqual([300, 300, 500]);
    expect(p.posts.map((x) => x.heightMm)).toEqual([1000, 1000, 1000]); // visina stuba ne zavisi od visine podnožja
    // srednji stub stoji na nižem podnožju (300), a vrh mu je u liniji sa višim poljem: dužina 1200
    expect(lay.posts.map((lp) => lp.lengthMm)).toEqual([1000, 1200, 1000]);
    // kraće podnožje zadato ručno: centrirano ispod polja
    p = setPlinthWidth(p, p.items[0].id, 600);
    lay = computeLayout(p);
    expect(lay.items[0].plinthX1 - lay.items[0].plinthX0).toBe(600);
    expect((lay.items[0].plinthX0 + lay.items[0].plinthX1) / 2).toBe(450);
    expect(qty(buildBom(p, SEED_MATERIALS), 'mat_concrete_plinth')).toBe(0);
    // zastarela veća vrednost se ne primenjuje: podnožje nikad ne prelazi polje sa stubovima
    const stale = { ...p, items: p.items.map((it, i) => (i === 0 && it.kind === 'fence' ? { ...it, plinthWidthMm: 5000 } : it)) };
    expect(computeLayout(stale).items[0].plinthX1 - computeLayout(stale).items[0].plinthX0).toBe(1000);
  });

  it('šire podnožje širi ogradu i pomera susedne elemente: nikad se ne preklapa sa susedima', () => {
    let p = createProject('X', [createFence({ modelId: 'picket_wide', widthMm: 900, heightMm: 1000, plinthMm: 300 }), createFence({ modelId: 'picket_wide', widthMm: 900, heightMm: 1000, plinthMm: 300 })]);
    const before = computeLayout(p);
    p = setPlinthWidth(p, p.items[0].id, 1400); // spoljna širina polja je bila 1000
    const lay = computeLayout(p);
    expect(outerWidthMm(p, 0)).toBe(1400);
    expect(p.items[0].kind === 'fence' && p.items[0].plinthWidthMm).toBeUndefined(); // podnožje prati ogradu
    expect(lay.items[0].plinthX1 - lay.items[0].plinthX0).toBe(1400);
    expect(lay.items[1].axisStart).toBeGreaterThan(before.items[1].axisStart); // sused je pomeren
    // podnožje prvog polja ne ulazi u kraj drugog preko stuba između njih (preklapaju se samo u širini stuba)
    expect(lay.items[0].plinthX1).toBeLessThanOrEqual(lay.items[1].plinthX0 + 100);
    // vraćanje na uže (kraće od polja) ostaje centrirano
    p = setPlinthWidth(p, p.items[0].id, 500);
    expect(computeLayout(p).items[0].plinthX1 - computeLayout(p).items[0].plinthX0).toBe(500);
  });

  it('rozetna u dnu stuba na podnožju: kraj rozetne je kraj podnožja', () => {
    let p = createProject('R', [createFence({ modelId: 'picket_wide', widthMm: 900, heightMm: 1000, plinthMm: 300 })]);
    const plain = computeLayout(p).items[0];
    expect([plain.plinthX0, plain.plinthX1]).toEqual([-50, 950]);
    for (const post of p.posts) p = updatePost(p, post.id, { capBottom: 'rosette' });
    const lay = computeLayout(p).items[0];
    expect(lay.plinthX0).toBe(-50 - 18); // rozetna 100 je široka 136: po 18 mm sa svake strane
    expect(lay.plinthX1).toBe(950 + 18);
    // širina podnožja se računa od ivice rozetne do ivice rozetne; šire podnožje širi ogradu za razliku
    const outer = outerWidthMm(p, 0);
    const wide = setPlinthWidth(p, p.items[0].id, lay.plinthX1 - lay.plinthX0 + 200);
    expect(outerWidthMm(wide, 0)).toBe(outer + 200);
    // rozetna na tlu (bez podnožja) ne menja podnožje
    const noPlinth = createProject('N', [createFence({ modelId: 'picket_wide', widthMm: 900, heightMm: 1000 })]);
    expect(computeLayout(noPlinth).items[0].plinthMm).toBe(0);
  });
});
