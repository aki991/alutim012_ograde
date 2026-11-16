import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { createFence, createGate, createProject } from '../domain/models/factories';
import { applyPostTemplate, postMaterialLine, postPatchFromTemplate, postSizeFromMaterial, templateFromPost } from '../domain/models/postTemplates';
import type { Material, PostTemplate } from '../domain/models/types';
import { buildBom } from '../domain/pricing/calc';
import { buildCuttingList } from '../domain/pricing/cutting';

const tube: Material = { id: 'm_post100', sku: 'KV100', name: 'Kvadratna cev 100×100×3', category: 'stub', unit: 'm', unitPrice: 2000, wastePercent: 0, demo: false };
const TPL: PostTemplate = { id: 'pt_1', name: 'Stub 100 crni', type: 'aluminium', widthMm: 100, color: 'RAL 9005', finish: 'mat', mounting: 'embedded', materialId: tube.id, capTop: 'pyramid', capBottom: 'rosette' };

const project = () => createProject('Probni', [createFence({ widthMm: 2000, heightMm: 1500 }), createFence({ widthMm: 2000, heightMm: 1500 })]);

describe('šabloni stubova', () => {
  it('šablon menja tip, presek, montažu, boju, kape i materijal izabranih stubova', () => {
    const p = project();
    const ids = [p.posts[0].id, p.posts[1].id];
    const next = applyPostTemplate(p, ids, TPL);
    for (const id of ids) {
      expect(next.posts.find((x) => x.id === id)).toMatchObject({ type: 'aluminium', widthMm: 100, color: 'RAL 9005', finish: 'mat', mounting: 'embedded', materialId: tube.id, capTop: 'pyramid', capBottom: 'rosette', templateId: TPL.id, custom: true });
    }
    // ostali stubovi se ne menjaju
    expect(next.posts[2].templateId).toBeUndefined();
    expect(next.posts[2].widthMm).toBe(p.posts[2].widthMm);
  });

  it('visina: zadata u šablonu je ručna, bez nje stub prati visinu ograde', () => {
    const p = project();
    const id = p.posts[1].id;
    const tall = applyPostTemplate(p, [id], { ...TPL, heightMm: 2100 });
    expect(tall.posts[1]).toMatchObject({ heightMm: 2100, heightCustom: true });
    const auto = applyPostTemplate(tall, [id], TPL);
    expect(auto.posts[1].heightCustom).toBeUndefined();
    expect(auto.posts[1].heightMm).toBe(p.posts[1].heightMm);
  });

  it('stub kapije ostaje stub kapije', () => {
    expect(postPatchFromTemplate(TPL, { type: 'gate' }).type).toBe('gate');
    expect(postPatchFromTemplate({ ...TPL, type: 'concrete' }, { type: 'gate' }).type).toBe('concrete');
    const p = createProject('K', [createFence({ widthMm: 2000 }), createGate('pedestrian', { widthMm: 1000 })]);
    const gatePost = p.posts.find((x) => x.type === 'gate');
    if (gatePost) expect(applyPostTemplate(p, [gatePost.id], TPL).posts.find((x) => x.id === gatePost.id)?.type).toBe('gate');
  });

  it('šablon od postojećeg stuba', () => {
    const base = project();
    const p = applyPostTemplate(base, [base.posts[0].id], TPL);
    const post = { ...p.posts[0] };
    const t = templateFromPost(post, 'pt_2', '  Moj stub ');
    expect(t).toMatchObject({ id: 'pt_2', name: 'Moj stub', type: 'aluminium', widthMm: 100, color: 'RAL 9005', mounting: 'embedded', materialId: tube.id, heightMm: undefined });
  });

  it('širina iz preseka materijala', () => {
    expect(postSizeFromMaterial(tube)).toEqual({ widthMm: 100, round: false });
    expect(postSizeFromMaterial({ ...tube, name: 'Okrugla cev Ø60 × 2 mm' })).toEqual({ widthMm: 60, round: true });
  });

  it('obračun: stub sa materijalom iz šablona ide po dužini stuba umesto uobičajenog stuba', () => {
    const base = project();
    const p = applyPostTemplate(base, base.posts.map((x) => x.id), TPL);
    const lens = computeLayout(p).posts.map((x) => x.lengthMm);
    const line = postMaterialLine(p, 0, [tube], lens[0]);
    expect(line).toEqual({ materialId: tube.id, qty: lens[0] / 1000, linear: true });
    const bom = buildBom(p, [tube]);
    const posts = bom.filter((l) => l.group === 'Stubovi');
    expect(posts.map((l) => l.materialId)).toEqual([tube.id]);
    expect(posts[0].geometricQty).toBeCloseTo(lens.reduce((s, v) => s + v, 0) / 1000, 6);
  });

  it('krojna lista: cev stuba se seče po dužini svakog stuba', () => {
    const base = project();
    const p = applyPostTemplate(base, base.posts.map((x) => x.id), TPL);
    const list = buildCuttingList(p, undefined, [tube], { stockMm: 6000, kerfMm: 3 });
    const plan = list.profiles.find((x) => x.profile === tube.name);
    expect(plan?.pieceCount).toBe(3);
    expect(list.positions.map((x) => x.key)).toEqual(expect.arrayContaining(['S1', 'S2', 'S3']));
  });

  it('betonski stub i stub bez materijala se obračunavaju kao do sada', () => {
    const p = project();
    expect(postMaterialLine(p, 0, [tube], 1700)).toBeNull();
    const conc = applyPostTemplate(p, [p.posts[0].id], { ...TPL, type: 'concrete' });
    expect(postMaterialLine(conc, 0, [tube], 1700)).toBeNull();
  });
});
