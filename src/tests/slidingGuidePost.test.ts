import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { placeSliding } from '../domain/gates/slidingLayout';
import { defaultGateConfig, gateFieldsFromModel } from '../domain/gates/gateModels';
import { guideOnFencePost, specFromPreset } from '../domain/gates/slidingAssembly';
import { updatePost } from '../domain/geometry/operations';
import { newCustomModel } from '../domain/models/custom';
import { createFence, createGate, createProject } from '../domain/models/factories';
import type { Gate } from '../domain/models/types';

/** vođica u projektu je na osi stuba ograde koji je nosi, bez obzira na debljinu i vrstu stubova */
describe('vođica kapije nacrtanog modela prati stub u projektu', () => {
  const build = (opening: 'left' | 'right', postType: 'aluminium' | 'concrete', manualGuide?: number) => {
    const d = specFromPreset('samonoseca_rucna');
    const sliding = { ...d.spec, manual: { ...d.spec.manual, ...(manualGuide !== undefined ? { upperGuide: manualGuide } : {}) } };
    const model = { ...newCustomModel('cm_gp'), kind: 'gate' as const, widthMm: 3000, heightMm: 1500, gate: { ...defaultGateConfig('sliding'), sliding, opening } };
    const fields = gateFieldsFromModel(model);
    const gate = createGate('sliding', { ...fields, opening } as Partial<Gate>);
    const items = opening === 'right' ? [createFence({ modelId: 'picket_wide', widthMm: 2000 }), gate, createFence({ modelId: 'picket_wide', widthMm: 2000 })] : [createFence({ modelId: 'picket_wide', widthMm: 2000 }), gate, createFence({ modelId: 'picket_wide', widthMm: 2000 })];
    let p = createProject('t', items);
    for (const post of p.posts) p = updatePost(p, post.id, { type: postType });
    const lay = computeLayout(p);
    const li = lay.items[1];
    const placed = placeSliding(li.item as Gate, li)!;
    const guide = placed.res.components.find((c) => c.key === 'upperGuide')!.shapes[0] as { x: number; w: number };
    // osa stuba koji nosi vođicu: na strani otvaranja
    const postAxis = opening === 'right' ? li.axisEnd : li.axisStart;
    return { guideWorld: placed.X(guide.x + guide.w / 2), postAxis, gate: li.item as Gate };
  };

  it.each([['right', 'aluminium'], ['right', 'concrete'], ['left', 'aluminium'], ['left', 'concrete']] as const)('otvaranje %s, stubovi %s: vođica je na osi stuba', (opening, type) => {
    const r = build(opening, type);
    expect(r.guideWorld).toBeCloseTo(r.postAxis, 3);
  });

  it('ručni X vođice iz modela se ne prenosi u projekat (inače bi odstupao od stuba kad se promene stubovi)', () => {
    const r = build('right', 'concrete', 2500);
    expect(r.gate.sliding!.manual.upperGuide).toBeUndefined();
    expect(r.guideWorld).toBeCloseTo(r.postAxis, 3);
    expect(guideOnFencePost(r.gate.sliding!)).toBe(true);
  });

  it('i stari projekat sa upisanim ručnim X vođice prati stub', () => {
    const r = build('right', 'aluminium');
    const stale = { ...r.gate, sliding: { ...r.gate.sliding!, manual: { ...r.gate.sliding!.manual, upperGuide: 2400, guidePost: 2400 } } };
    expect(guideOnFencePost(stale.sliding)).toBe(true);
    const items = [createFence({ modelId: 'picket_wide', widthMm: 2000 }), stale, createFence({ modelId: 'picket_wide', widthMm: 2000 })];
    let p = createProject('t', items);
    for (const post of p.posts) p = updatePost(p, post.id, { type: 'concrete' });
    const li = computeLayout(p).items[1];
    const placed = placeSliding(li.item as Gate, li)!;
    const guide = placed.res.components.find((c) => c.key === 'upperGuide')!.shapes[0] as { x: number; w: number };
    expect(placed.X(guide.x + guide.w / 2)).toBeCloseTo(li.axisEnd, 3);
  });
});
