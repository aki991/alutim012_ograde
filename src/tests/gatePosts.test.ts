import { afterEach, describe, expect, it } from 'vitest';
import { setOuterWidth, updateItem, updatePost, resetPostHeights } from '../domain/geometry/operations';
import { postHalfSum } from '../domain/geometry/layout';
import { emptyDesign, setDim } from '../domain/gates/design';
import { defaultGateConfig, gateConfigFromGate, postDimsOf, withModelPosts } from '../domain/gates/gateModels';
import { newCustomModel } from '../domain/models/custom';
import { registerCustomModels } from '../domain/models/customRegistry';
import { createFence, createGate, createProject } from '../domain/models/factories';
import type { FenceModelId, Gate } from '../domain/models/types';

const MODEL = { ...newCustomModel('cm_gp'), kind: 'gate' as const, name: 'Kapija stubovi', widthMm: 1000, heightMm: 1480, gate: defaultGateConfig('pedestrian') };
const ID = MODEL.id as FenceModelId;
afterEach(() => registerCustomModels([], []));

const gateProject = (gB?: number) => {
  registerCustomModels([MODEL], []);
  const design = gB === undefined ? emptyDesign('swing_single') : setDim(emptyDesign('swing_single'), 'gB', gB);
  let p = createProject('t', [createGate('pedestrian', { infillModelId: ID, heightMm: 1480, design })]);
  p = setOuterWidth(p, p.items[0].id, 1000 + 2 * postHalfSum(p, 0));
  return p;
};

describe('stubovi uz kapiju nacrtanog modela', () => {
  it('podrazumevano su viši od kapije za 50 mm', () => {
    expect(gateProject().posts.map((x) => x.heightMm)).toEqual([1530, 1530]);
  });
  it('kapija podignuta od poda: stub je viši od vrha kapije (visina + donji zazor) za 50 mm', () => {
    expect(gateProject(50).posts.map((x) => x.heightMm)).toEqual([1580, 1580]);
  });
  it('ručno zadata visina i širina ostaju, a „vrati automatsku visinu“ vraća pravilo', () => {
    let p = gateProject(50);
    const id = p.posts[0].id;
    p = updatePost(p, id, { heightMm: 1700, widthMm: 140 });
    expect(p.posts[0]).toMatchObject({ heightMm: 1700, widthMm: 140, heightCustom: true, custom: true });
    expect(p.posts[1].heightMm).toBe(1580);
    p = resetPostHeights(p, [id]);
    expect(p.posts[0].heightMm).toBe(1580);
  });
  it('model čuva samo ručno zadate mere stubova i primenjuje ih na kapiju u novom projektu', () => {
    let p = gateProject(50);
    expect(postDimsOf(p.posts[0], p.posts[1])).toBeUndefined();
    p = updatePost(p, p.posts[1].id, { heightMm: 1800, widthMm: 150 });
    const posts = postDimsOf(p.posts[0], p.posts[1]);
    expect(posts).toEqual([{}, { widthMm: 150, heightMm: 1800 }]);
    const cfg = gateConfigFromGate(p.items[0] as Gate, 1000, 2, posts);
    expect(cfg.posts).toEqual(posts);
    // nov projekat sa istom kapijom: stub dobija sačuvane mere
    let q = createProject('n', [createGate('pedestrian', { infillModelId: ID, heightMm: 1480 }), createFence()]);
    q = updateItem(q, q.items[0].id, { design: setDim(emptyDesign('swing_single'), 'gB', 50) } as Partial<Gate>);
    q = withModelPosts(q, q.items[0].id, cfg);
    expect(q.posts[1]).toMatchObject({ widthMm: 150, heightMm: 1800, heightCustom: true });
    expect(q.posts[0].heightCustom).toBeUndefined();
  });
});
