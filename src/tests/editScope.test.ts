import { describe, expect, it } from 'vitest';
import { propagateItemChange } from '../domain/geometry/editScope';
import { updateItem } from '../domain/geometry/operations';
import { createFence, createGate, createProject } from '../domain/models/factories';
import type { FenceSection, Gate } from '../domain/models/types';

const base = () => createProject('t', [createFence({ modelId: 'h_narrow' as never }), createFence({ modelId: 'h_narrow' as never }), createGate('pedestrian', { infillModelId: 'h_narrow' as never })]);

describe('opseg izmena (sva platna / sve kapije)', () => {
  it('„Samo ovo“ ne menja ostale', () => {
    const p = base(); const next = updateItem(p, p.items[0].id, { color: 'RAL 9005' } as Partial<FenceSection>);
    expect(propagateItemChange(p, next, p.items[0].id, 'one').items.map((i) => (i as FenceSection).color)).toEqual(next.items.map((i) => (i as FenceSection).color));
  });
  it('„Sva platna“ prenosi boju i parametre na platna, a kapiju ne dira; širina ostaje svoja', () => {
    const p = base(); const id = p.items[0].id;
    const next = updateItem(updateItem(p, id, { color: 'RAL 9005', widthMm: 777 } as Partial<FenceSection>), id, { params: { ...(p.items[0] as FenceSection).params, gapMm: 33 } } as Partial<FenceSection>);
    const out = propagateItemChange(p, next, id, 'same');
    expect((out.items[1] as FenceSection).color).toBe('RAL 9005');
    expect((out.items[1] as FenceSection).widthMm).toBe((p.items[1] as FenceSection).widthMm);
    expect((out.items[2] as Gate).color).toBe((p.items[2] as Gate).color);
  });
  it('„Platna i kapije“ prenosi boju i na kapije', () => {
    const p = base(); const id = p.items[0].id;
    const out = propagateItemChange(p, updateItem(p, id, { color: 'RAL 9005' } as Partial<FenceSection>), id, 'all');
    expect((out.items[2] as Gate).color).toBe('RAL 9005');
  });
  it('masovna izmena razmaka čuva ostala pojedinačna podešavanja svakog polja', () => {
    const source = createFence({ params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { gapMm: 20, postSpacingMm: 1000 } } });
    const target = createFence({ widthMm: 1800, params: { barSizeMm: 30, gapMm: 40, frameMm: 60, slats: { gapMm: 40, postSpacingMm: 600 } } });
    const p = createProject('t', [source, target]);
    const next = updateItem(p, source.id, { params: { ...source.params, slats: { ...source.params.slats, gapMm: 30 } } });
    const out = propagateItemChange(p, next, source.id, 'same');
    expect(out.items[1]).toEqual({ ...target, params: { ...target.params, slats: { gapMm: 30, postSpacingMm: 600 } } });
    expect(p.items[1]).toEqual(target);
  });
  it('vraćanje podešavanja na model uklanja samo promenjeni ključ i čuva druge izuzetke', () => {
    const source = createFence({ params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { gapMm: 20 } } });
    const target = createFence({ params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { gapMm: 40, postSpacingMm: 600 } } });
    const p = createProject('t', [source, target]);
    const { slats: _, ...params } = source.params;
    const out = propagateItemChange(p, updateItem(p, source.id, { params }), source.id, 'same');
    expect((out.items[1] as FenceSection).params).toEqual({ ...target.params, slats: { postSpacingMm: 600 } });
  });
  it('masovna izmena i poništavanje parametara čuvaju sopstveni prvi i poslednji stub stepeništa', () => {
    const source = createFence({ params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { gapMm: 20, stairFirstFloor: false, stairLastStep: 6 } } });
    const target = createFence({ stair: { riseMm: 1200, steps: 6, group: 'g' }, params: { barSizeMm: 20, gapMm: 20, frameMm: 40, slats: { gapMm: 40, stairFirstFloor: true, stairLastStep: 4 } } });
    const p = createProject('t', [source, target]);
    const next = updateItem(p, source.id, { params: { ...source.params, slats: { gapMm: 30, stairFirstFloor: true, stairLastStep: 5 } } });
    expect((propagateItemChange(p, next, source.id, 'all').items[1] as FenceSection).params.slats).toEqual({ gapMm: 30, stairFirstFloor: true, stairLastStep: 4 });
    const { slats: _, ...params } = source.params;
    expect((propagateItemChange(p, updateItem(p, source.id, { params }), source.id, 'all').items[1] as FenceSection).params.slats).toEqual({ stairFirstFloor: true, stairLastStep: 4 });
  });
});

import { setGatesOwnPosts } from '../domain/geometry/operations';
import { applyPostType } from '../domain/geometry/operations';

describe('svoji stubovi kapije', () => {
  it('kapija sa dva stuba u betonskoj ogradi dobija aluminijumski stub, a ograda zadržava betonski', () => {
    let p = createProject('t', [createFence({ modelId: 'h_narrow' as never }), createGate('pedestrian', { infillModelId: 'h_narrow' as never })]);
    p = applyPostType(p, 'concrete');
    const g = p.items[1].id;
    const out = setGatesOwnPosts(p, true, [g]);
    const gi = out.items.findIndex((i) => i.id === g);
    expect(out.posts[gi].type).not.toBe('concrete');
    expect(out.posts[gi + 1].type).not.toBe('concrete');
    expect(out.posts.some((x) => x.type === 'concrete')).toBe(true);
  });
});

describe('kapija sa 2 stuba uz betonske stubove na krajevima', () => {
  it('betonski stubovi ostaju spolja, a kapija dobija svoje aluminijumske stubove; povratak na 1 stub vraća betonske', () => {
    let p = createProject('t', [createGate('pedestrian', { infillModelId: 'h_narrow' as never })]);
    p = applyPostType(p, 'concrete');
    const g = p.items[0].id;
    const own = setGatesOwnPosts(p, true, [g]);
    expect(own.items.map((i) => (i.kind === 'opening' && i.spacer ? 'spacer' : i.kind))).toEqual(['spacer', 'gate', 'spacer']);
    expect(own.posts.map((x) => x.type)).toEqual(['concrete', 'gate', 'gate', 'concrete']);
    const back = setGatesOwnPosts(own, false, [g]);
    expect(back.items.map((i) => i.kind)).toEqual(['gate']);
    expect(back.posts.map((x) => x.type)).toEqual(['concrete', 'concrete']);
  });
  it('kapija na početku, platno desno: levo betonski + aluminijumski, desno betonski uz platno + aluminijumski', () => {
    let p = createProject('t', [createGate('pedestrian', { infillModelId: 'h_narrow' as never }), createFence({ modelId: 'h_narrow' as never })]);
    p = applyPostType(p, 'concrete');
    const own = setGatesOwnPosts(p, true, [p.items[0].id]);
    expect(own.posts.map((x) => x.type)).toEqual(['concrete', 'gate', 'gate', 'concrete', 'concrete']);
  });
});
