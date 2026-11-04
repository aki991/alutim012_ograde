import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { applyPostType, setAllGatesOwnPosts, setAllPlinths, updateItem, updatePost } from '../domain/geometry/operations';
import { computeLayout, isSpacer } from '../domain/geometry/layout';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { buildBom } from '../domain/pricing/calc';
import { buildCuttingList } from '../domain/pricing/cutting';
import { indexOfNumber, itemLabel, itemNumber } from '../utils/labels';

const base = () => createProject('K', [createFence({ modelId: 'picket_wide', widthMm: 1000 }), createGate('pedestrian', { infillModelId: 'picket_wide' })]);
const gateOf = (p: ReturnType<typeof base>) => p.items.find((i) => i.kind === 'gate')!;

describe('kapija sa svojim stubovima', () => {
  it('zajednički stub: tri stuba za ogradu i kapiju', () => {
    const p = base();
    expect(p.items).toHaveLength(2);
    expect(p.posts).toHaveLength(3);
  });


  it('uključivanje i isključivanje po kapiji', () => {
    let p = base();
    p = updateItem(p, gateOf(p).id, { ownPosts: true });
    expect(p.items).toHaveLength(3);
    expect(p.posts).toHaveLength(4);
    expect(isSpacer(p.items[1])).toBe(true);
    // stub ograde ostaje običan (100), stub kapije je pojačan (120); razmaknik je rastojanje njihovih osa (polovine stubova + razmak 40)
    expect([p.posts[1].type, p.posts[1].widthMm]).toEqual(['aluminium', 100]);
    expect([p.posts[2].type, p.posts[2].widthMm]).toEqual(['gate', 120]);
    expect(p.items[1].widthMm).toBe(150);
    const lay = computeLayout(p);
    expect(lay.items[1].clearWidth).toBe(40); // razmak između stubova
    expect(lay.postCount).toBe(4);
    // nazivi i brojevi pozicija ne računaju razmaknik
    expect(itemLabel(p.items, 2)).toBe('Pešačka kapija');
    expect(itemNumber(p.items, 2)).toBe(2);
    expect(indexOfNumber(p.items, 2)).toBe(2);
    // razmak stubova zadaje kapija
    p = updateItem(p, gateOf(p).id, { postGapMm: 100 });
    expect(p.items[1].widthMm).toBe(210);
    expect(computeLayout(p).items[1].clearWidth).toBe(100);
    // isključivanje vraća zajednički stub
    p = updateItem(p, gateOf(p).id, { ownPosts: false });
    expect(p.items).toHaveLength(2);
    expect(p.posts).toHaveLength(3);
  });

  it('sve kapije odjednom; sastavnica računa oba stuba; krojna lista numeriše bez razmaknika', () => {
    const items = [createFence({ modelId: 'picket_wide' }), createGate('pedestrian', { infillModelId: 'picket_wide' }), createFence({ modelId: 'picket_wide' }), createGate('single', { infillModelId: 'picket_wide' })];
    let p = createProject('S', items);
    const before = buildBom(p, SEED_MATERIALS).find((l) => l.materialId === 'mat_ek_ktf10010020')?.geometricQty ?? 0;
    p = setAllGatesOwnPosts(p, true);
    expect(p.items.filter(isSpacer)).toHaveLength(3); // uz svaku kapiju sa obe strane gde ima suseda
    expect(p.posts).toHaveLength(p.items.length + 1);
    // dva stuba više po spoju: cevi stubova ima više nego pre
    const after = buildBom(p, SEED_MATERIALS);
    expect(computeLayout(p).postCount).toBe(8);
    expect(after.some((l) => l.name.includes('80×80') || l.name.includes('100×100'))).toBe(true);
    expect((after.find((l) => l.materialId === 'mat_ek_ktf10010020')?.geometricQty ?? 0) + (after.find((l) => l.materialId === 'mat_ek_ktf808030')?.geometricQty ?? 0)).toBeGreaterThan(before);
    const keys = buildCuttingList(p, undefined, SEED_MATERIALS).positions.filter((x) => /^\d+$/.test(x.key)).map((x) => x.key);
    expect(keys).toEqual(['1', '2', '3', '4']);
    p = setAllGatesOwnPosts(p, false);
    expect(p.items).toHaveLength(4);
  });

  it('kapija bez svojih stubova se hvata za stub susedne kapije; uključivanje ne pravi veći stub', () => {
    const items = [createGate('double', { infillModelId: 'picket_wide', heightMm: 1000 }), createGate('pedestrian', { infillModelId: 'picket_wide', heightMm: 1000 }), createFence({ modelId: 'picket_wide', plinthMm: 400, heightMm: 1000 })];
    let p = setAllGatesOwnPosts(createProject('G', items), true);
    for (const post of p.posts) p = updatePost(p, post.id, { color: 'RAL 9016' }); // ručno menjani stubovi (custom)
    expect(p.items.filter(isSpacer)).toHaveLength(2);
    const g2 = p.items.find((i) => i.kind === 'gate' && i.gateType === 'pedestrian')!;
    // mala kapija isključuje svoje stubove: ostaje stub velike kapije (zajednički), a prema ogradi je jedan stub
    p = updateItem(p, g2.id, { ownPosts: false });
    expect(p.items.filter(isSpacer)).toHaveLength(0); // nema razmaka: mala kapija uzima stub velike kapije i stub ograde
    expect(p.posts).toHaveLength(p.items.length + 1);
    // ponovo uključena: stub uz ogradu je običan stub ograde (100, aluminijumski), ne veći stub kapije
    p = updateItem(p, g2.id, { ownPosts: true });
    expect(p.items.filter(isSpacer)).toHaveLength(2);
    const lay = computeLayout(p);
    const fenceIdx = p.items.findIndex((i) => i.kind === 'fence');
    const fencePost = lay.posts[fenceIdx];
    expect(fencePost.post.widthMm).toBe(100);
    expect(fencePost.post.type).toBe('aluminium');
    expect(fencePost.baseMm).toBe(400);
    expect(fencePost.post.heightMm).toBe(1000); // visina od vrha podnožja, ne zajedno sa podnožjem
  });

  it('visina stuba ne zavisi od podnožja: stub između kapije na tlu i ograde na podnožju', () => {
    const p = createProject('H', [createGate('pedestrian', { infillModelId: 'picket_wide', heightMm: 1000 }), createFence({ modelId: 'picket_wide', plinthMm: 400, heightMm: 1000 })]);
    const lay = computeLayout(p);
    const shared = lay.posts[1];
    expect(shared.post.heightMm).toBe(1000); // isto kao ostali stubovi
    expect(shared.baseMm).toBe(0); // stoji na tlu uz kapiju
    expect(shared.lengthMm).toBe(1400); // dužina do vrha ograde na podnožju
    expect(lay.posts[2].post.heightMm).toBe(1000);
    expect(lay.posts[2].baseMm).toBe(400);
    expect(lay.posts[2].lengthMm).toBe(1000);
    expect(lay.posts[1].topMm).toBe(lay.posts[2].topMm); // vrhovi su u istoj liniji
  });

  it('širi stubovi ne troše polja: svetli otvor ostaje, ukupna dužina raste; povratak vraća širinu stuba', () => {
    let p = createProject('W', [createFence({ modelId: 'picket_wide', widthMm: 1000 }), createGate('pedestrian', { infillModelId: 'picket_wide' }), createFence({ modelId: 'picket_wide', widthMm: 1000 })]);
    const before = computeLayout(p);
    p = applyPostType(p, 'concrete');
    const after = computeLayout(p);
    expect(after.posts.map((lp) => lp.widthMm)).toEqual([400, 400, 400, 400]);
    expect(after.items.map((l) => l.clearWidth)).toEqual(before.items.map((l) => l.clearWidth)); // otvori nepromenjeni
    expect(after.occupiedMm).toBeGreaterThan(before.occupiedMm); // stubovi su širi: ukupna dužina raste
    p = applyPostType(p, 'aluminium');
    const back = computeLayout(p);
    expect(back.items.map((l) => l.clearWidth)).toEqual(before.items.map((l) => l.clearWidth));
    expect(back.posts.every((lp) => lp.widthMm <= 120)).toBe(true);
  });

  it('podnožje svih ograda odjednom i uklanjanje', () => {
    let p = createProject('P', [createFence({ modelId: 'picket_wide' }), createFence({ modelId: 'picket_wide' })]);
    p = setAllPlinths(p, true);
    expect(p.items.every((i) => i.kind === 'fence' && i.plinthMm === 400)).toBe(true);
    p = setAllPlinths(p, false);
    expect(p.items.every((i) => i.kind === 'fence' && !i.plinthMm)).toBe(true);
  });
});
