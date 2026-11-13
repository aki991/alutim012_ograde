import { describe, expect, it } from 'vitest';
import { heightGroups } from '../components/editor/FrontView';
import { applyPostType, setAllPostHeights, setHeightsOfKind } from '../domain/geometry/operations';
import { computeLayout } from '../domain/geometry/layout';
import { createFence, createGate, createProject } from '../domain/models/factories';

const mixed = () => createProject('p', [
  createFence({ modelId: 'h_narrow', heightMm: 1500 }),
  createFence({ modelId: 'h_narrow', heightMm: 1700 }),
  createGate('sliding', { infillModelId: 'h_narrow', widthMm: 4000, heightMm: 1400 }),
]);

describe('kote visine sa leve strane', () => {
  it('najviše tri: ograda, stubovi i kapije; kota pokazuje najvišu meru', () => {
    const g = heightGroups(mixed());
    expect(g.map((x) => x.kind)).toEqual(['fence', 'post', 'gate']);
    expect(g[0]).toMatchObject({ heightMm: 1700, mixed: true });
    expect(g[2]).toMatchObject({ heightMm: 1400, mixed: false });
    // bez kapija nema treće kote
    expect(heightGroups(createProject('q', [createFence({ modelId: 'h_narrow' })])).map((x) => x.kind)).toEqual(['fence', 'post']);
  });

  it('visina svih platna ne dira kapije, a visina kapija ne dira platna', () => {
    const a = setHeightsOfKind(mixed(), 'fence', 1600);
    expect(a.items.filter((i) => i.kind === 'fence').every((i) => i.heightMm === 1600)).toBe(true);
    expect(a.items.find((i) => i.kind === 'gate')!.heightMm).toBe(1400);
    const b = setHeightsOfKind(mixed(), 'gate', 1800);
    expect(b.items.find((i) => i.kind === 'gate')!.heightMm).toBe(1800);
    expect(b.items.filter((i) => i.kind === 'fence').map((i) => i.heightMm)).toEqual([1500, 1700]);
  });

  it('visina svih stubova: svi stubovi dobijaju isti vrh, i uz podnožje', () => {
    const base = applyPostType(createProject('p', [createFence({ modelId: 'h_narrow', heightMm: 1500, plinthMm: 400 }), createFence({ modelId: 'h_narrow', heightMm: 1500 })]), 'aluminium');
    const q = setAllPostHeights(base, 2000);
    const lay = computeLayout(q);
    expect(lay.posts.every((lp) => Math.round(lp.topMm) === 2000)).toBe(true);
    expect(q.posts.every((x) => x.heightCustom)).toBe(true);
    expect(heightGroups(q).find((x) => x.kind === 'post')).toMatchObject({ heightMm: 2000, mixed: false });
  });
});
