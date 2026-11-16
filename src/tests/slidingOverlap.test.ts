import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { defaultGateConfig, gateFieldsFromModel } from '../domain/gates/gateModels';
import { closingPostOffset, specFromPreset, resolveSliding } from '../domain/gates/slidingAssembly';
import { isPartOn } from '../domain/gates/slidingParts';
import { newCustomModel } from '../domain/models/custom';
import { createFence, createGate, createProject } from '../domain/models/factories';
import type { Gate } from '../domain/models/types';

const slidingGate = (opening: 'left' | 'right'): Gate => {
  const d = specFromPreset('samonoseca_rucna');
  return { ...createGate('sliding'), opening, sliding: { ...d.spec, drawnLeaf: true }, widthMm: 4000 } as Gate;
};

describe('klizno krilo prelazi preko stuba na strani zatvaranja', () => {
  it('otvaranje udesno: krilo počinje na osi levog stuba, a na strani vođice prelazi osu desnog stuba za 35 mm', () => {
    const p = createProject('p', [createFence({ modelId: 'rail_black', heightMm: 1100 }), slidingGate('right')]);
    const lay = computeLayout(p);
    const li = lay.items[1];
    const wl = lay.posts[1].widthMm; const wr = lay.posts[2].widthMm;
    const c = closingPostOffset((li.item as Gate).sliding!, wl);
    expect(li.clearStart).toBeCloseTo(li.axisStart - c, 6);
    expect(li.clearEnd).toBeCloseTo(li.axisEnd + 35, 6);
    expect(li.overlapMm).toBeCloseTo(c + wl / 2 + wr / 2 + 35, 6);
    // susedni element se ne menja
    expect(lay.items[0].clearEnd).toBeCloseTo(lay.items[0].axisEnd - wl / 2, 6);
  });

  it('otvaranje ulevo: krilo ide do ose desnog stuba, a levo prelazi osu levog stuba', () => {
    const p = createProject('p', [slidingGate('left'), createFence({ modelId: 'rail_black', heightMm: 1100 })]);
    const li = computeLayout(p).items[0];
    const c = closingPostOffset((li.item as Gate).sliding!, computeLayout(p).posts[1].widthMm);
    expect(li.clearEnd).toBeCloseTo(li.axisEnd + c, 6);
    expect(li.clearStart).toBeCloseTo(li.axisStart - 35, 6);
    expect(li.overlapMm).toBeGreaterThan(0);
  });

  it('ukupni svetli otvor ne računa preklop sa stubom, a obične kapije se ne menjaju', () => {
    const swing = createProject('p', [createFence({ modelId: 'rail_black', heightMm: 1100 }), createGate('single')]);
    const ls = computeLayout(swing);
    expect(ls.items[1].overlapMm ?? 0).toBe(0);
    expect(ls.items[1].clearStart).toBeCloseTo(ls.items[1].axisStart + ls.posts[1].widthMm / 2, 6);
    const p = createProject('p', [createFence({ modelId: 'rail_black', heightMm: 1100 }), slidingGate('right')]);
    const lay = computeLayout(p);
    const sum = lay.items.reduce((s, i) => s + (i.axisEnd - i.axisStart), 0) - lay.posts.reduce((s, q, i) => s + (i === 0 || i === lay.posts.length - 1 ? q.widthMm / 2 : q.widthMm), 0);
    expect(lay.totalClearMm).toBeCloseTo(sum, 6);
  });
});

describe('stub vođice u projektu', () => {
  it('model sa posebnim stubom vođice u projektu nema poseban stub (stub ograde je stub vođice)', () => {
    const d = specFromPreset('samonoseca_rucna');
    const model = { ...newCustomModel('cm_gp'), kind: 'gate' as const, widthMm: 3000, heightMm: 1500, gate: { ...defaultGateConfig('sliding'), sliding: { ...d.spec, enabled: { ...(d.spec.enabled ?? {}), guidePost: true }, guidePost: true } } } as never;
    const g = gateFieldsFromModel(model);
    expect(isPartOn(g.sliding!, 'guidePost')).toBe(false);
    expect(resolveSliding(g.sliding!, 3000, 1500).components.some((c) => c.key === 'guidePost')).toBe(false);
  });

  it('zasun i pločica zasuna se crtaju i bez uvećanja (nisu sitan okov)', () => {
    const d = specFromPreset('samonoseca_rucna');
    const res = resolveSliding(d.spec, 3000, 1285 + d.spec.frameBottomY);
    for (const k of ['latch', 'latchReceiver']) expect(res.components.find((c) => c.key === k)?.detail).toBe(false);
  });
});

describe('mere krila sa preklopom', () => {
  it.each(['left', 'right'] as const)('otvaranje %s: zadata dužina krila 3000 se dobija tačno (preklop je uračunat u spoljnu meru)', async (opening) => {
    const { postHalfSum } = await import('../domain/geometry/layout');
    const { setOuterWidth } = await import('../domain/geometry/operations');
    const items = opening === 'right' ? [createFence({ modelId: 'rail_black', heightMm: 1100 }), slidingGate(opening)] : [slidingGate(opening), createFence({ modelId: 'rail_black', heightMm: 1100 })];
    const p = createProject('p', items);
    const idx = opening === 'right' ? 1 : 0;
    const q = setOuterWidth(p, p.items[idx].id, 3000 + 2 * postHalfSum(p, idx));
    expect(computeLayout(q).items[idx].clearWidth).toBeCloseTo(3000, 6);
  });
});

describe('visina klizne kapije je ukupna visina od tla', () => {
  it('model → kapija: visina krila + odstojanje donje ivice rama; krilo je kraće za to odstojanje', async () => {
    const { leafHeightOf, slidingH } = await import('../domain/gates/slidingLayout');
    const d = specFromPreset('samonoseca_rucna');
    const model = { ...newCustomModel('cm_h'), kind: 'gate' as const, widthMm: 3000, heightMm: 1385, gate: { ...defaultGateConfig('sliding'), sliding: d.spec } } as never;
    const g = { ...createGate('sliding'), ...gateFieldsFromModel(model) } as Gate;
    expect(g.heightMm).toBe(1385 + d.spec.frameBottomY);
    expect(slidingH(g)).toBe(g.heightMm);
    expect(leafHeightOf(g)).toBe(1385);
    expect(resolveSliding(g.sliding!, 3000, slidingH(g)).frameHeight).toBe(1385);
    expect(leafHeightOf(createGate('single'))).toBe(createGate('single').heightMm);
  });

  it('migracija: stari projekat sa nacrtanim krilom dobija ukupnu visinu, samo jednom', async () => {
    const { migrateProject } = await import('../domain/validation/project');
    const d = specFromPreset('samonoseca_rucna');
    const old = createProject('p', [{ ...createGate('sliding'), heightMm: 1500, sliding: { ...d.spec, drawnLeaf: true } } as Gate]);
    const once = migrateProject(old);
    expect((once.items[0] as Gate).heightMm).toBe(1500 + d.spec.frameBottomY);
    expect((once.items[0] as Gate).sliding?.heightTotal).toBe(true);
    expect((migrateProject(once).items[0] as Gate).heightMm).toBe(1500 + d.spec.frameBottomY);
  });
});

describe('položaj stuba vođice (X)', () => {
  it('podrazumevano prati vođicu; zadata vrednost se prenosi u projekat i važi kad se poseban stub uključi', () => {
    const d = specFromPreset('samonoseca_rucna');
    const auto = resolveSliding(d.spec, 3000, 1400);
    expect(auto.at('guidePost')).toBe(auto.at('upperGuide'));
    const model = { ...newCustomModel('cm_gx'), kind: 'gate' as const, widthMm: 3000, heightMm: 1285, gate: { ...defaultGateConfig('sliding'), sliding: { ...d.spec, manual: { ...d.spec.manual, guidePost: 2500 } } } } as never;
    const g = { ...createGate('sliding'), ...gateFieldsFromModel(model) } as Gate;
    // X stuba vođice postaje položaj stuba ograde: osa stuba je (3000 − 2500) pre kraja krila
    expect(g.sliding!.guideOverhang).toBe(500);
    expect(g.sliding!.manual.guidePost).toBeUndefined();
    const p = createProject('p', [{ ...g, opening: 'right', widthMm: 2500 } as Gate]);
    const li = computeLayout(p).items[0];
    expect(li.axisEnd - li.axisStart).toBe(2500);
    const c = closingPostOffset(g.sliding!, computeLayout(p).posts[0].widthMm);
    expect(li.clearEnd - li.clearStart).toBeCloseTo(3000 + c, 6);
    // stub vođice je na X = 2500 od početka krila (osa stuba je 500 pre kraja krila)
    expect(li.clearEnd - li.axisEnd).toBeCloseTo(500, 6);
  });
});

describe('stub prihvatnika: položaj zavisi od debljine stuba', () => {
  const spec = specFromPreset('samonoseca_rucna').spec;
  it('bez zadate vrednosti okov je skroz levo na stubu: deblji stub ide više udesno, uži manje', () => {
    const c80 = closingPostOffset(spec, 80); const c120 = closingPostOffset(spec, 120); const c500 = closingPostOffset(spec, 500);
    expect(c80).toBeLessThan(c120); expect(c120).toBeLessThan(c500);
    // leva ivica stuba stoji tačno 10 mm levo od najlevljeg dela okova (pločica zasuna počinje na −53)
    expect(c500 - 250).toBeCloseTo(-53 - 10, 6);
    expect(c80 - 40).toBeCloseTo(-53 - 10, 6);
  });
  it('zadata vrednost: ne može dalje udesno od debljine stuba dozvoljava, a okov uvek ostaje na stubu', () => {
    const want = { ...spec, manual: { ...spec.manual, catchPost: 1000 } };
    expect(closingPostOffset(want, 80)).toBe(closingPostOffset(spec, 80)); // uzak stub: ograničen
    expect(closingPostOffset(want, 500)).toBe(closingPostOffset(spec, 500)); // i debeo stub ima granicu
    const small = { ...spec, manual: { ...spec.manual, catchPost: 0 } };
    expect(closingPostOffset(small, 500)).toBe(0); // levo od granice može slobodno
    const far = { ...spec, manual: { ...spec.manual, catchPost: -1000 } };
    // desna ivica stuba ne ide levo od zadnjeg zida prihvatnika (X = 0) uz zazor
    expect(closingPostOffset(far, 80) + 40).toBeGreaterThanOrEqual(0);
  });
  it('raspored: deblji stub produžava krilo, a krilo uvek počinje levo od zadnjeg zida prihvatnika', () => {
    const mk = (postW: number) => {
      const p = createProject('p', [createFence({ modelId: 'rail_black', heightMm: 1100 }), slidingGate('right')]);
      const q = { ...p, posts: p.posts.map((x, i) => (i === 1 ? { ...x, widthMm: postW } : x)) };
      return computeLayout(q).items[1];
    };
    expect(mk(500).clearWidth - mk(80).clearWidth).toBeGreaterThan(100);
    for (const w of [80, 120, 500]) { const li = mk(w); expect(li.clearStart).toBeLessThanOrEqual(li.axisStart + 40); }
  });
});

describe('krojna lista: uglovi sečenja ojačanja repa', () => {
  it('rep (samonoseća): ojačanja imaju uglove sečenja u krojnoj listi i zbirnom spisku, a ostali komadi ostaju ravni', async () => {
    const { buildCutList } = await import('../domain/pricing/production');
    const { buildCuttingList, cutOptions } = await import('../domain/pricing/cutting');
    const { DEFAULT_MODEL_ID } = await import('../domain/models/catalog');
    const d = specFromPreset('samonoseca_rucna');
    const gate = { ...createGate('sliding'), sliding: { ...d.spec, drawnLeaf: true, heightTotal: true }, heightMm: 1400, widthMm: 4000, infillModelId: DEFAULT_MODEL_ID } as Gate;
    const p = createProject('p', [createFence({ modelId: 'rail_black', heightMm: 1100 }), gate]);
    const rows = buildCutList(p).filter((r) => /Rep/.test(r.part));
    expect(rows.length).toBeGreaterThan(2);
    const angled = rows.filter((r) => r.ends);
    expect(angled.length).toBeGreaterThan(0);
    for (const r of angled) expect(r.ends!.flat().some((a) => Math.abs(a - 90) > 0.05)).toBe(true);
    const plan = buildCuttingList(p, undefined, [], cutOptions(p.settings as never));
    expect(plan.profiles.some((pr) => pr.summary.some((s) => s.ends))).toBe(true);
    expect(plan.notes.some((n) => /uglovima/.test(n))).toBe(true);
  });
});
