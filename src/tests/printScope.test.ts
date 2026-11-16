import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../domain/models/factories';
import { buildCuttingList, inPrintScope, scopedProject } from '../domain/pricing/cutting';
import { buildWorkOrder } from '../domain/pricing/workorder';
import { computeLayout } from '../domain/geometry/layout';
import { SEED_MATERIALS } from './fixtures/materials';

const OPTS = { stockMm: 6000, kerfMm: 3 };

describe('krojna lista i radni nalog: samo kapije ili ograda bez kapija', () => {
  const p = createDemoProject(null);
  const gateIdx = p.items.map((it, i) => (it.kind === 'gate' ? i : -1)).filter((i) => i >= 0);
  it('demo projekat ima i kapije i ogradu', () => {
    expect(gateIdx.length).toBeGreaterThan(0);
    expect(p.items.some((it) => it.kind === 'fence')).toBe(true);
  });

  it('krojna lista: samo kapije ima samo pozicije kapija, ograda samo ostale; zajedno su isti komadi kao ceo projekat', () => {
    const all = buildCuttingList(p, undefined, SEED_MATERIALS, OPTS);
    const gates = buildCuttingList(p, undefined, SEED_MATERIALS, { ...OPTS, scope: 'gates' });
    const fence = buildCuttingList(p, undefined, SEED_MATERIALS, { ...OPTS, scope: 'fence' });
    const gateKeys = new Set(gateIdx.map((i) => String(i + 1)));
    expect(gates.totals.pieces).toBeGreaterThan(0);
    expect(gates.positions.every((pos) => gateKeys.has(pos.key) || /^S\d+$/.test(pos.key))).toBe(true);
    expect(fence.positions.some((pos) => gateKeys.has(pos.key))).toBe(false);
    expect(gates.totals.pieces + fence.totals.pieces).toBe(all.totals.pieces);
  });

  it('redni brojevi pozicija su isti kao u celom projektu', () => {
    const all = buildCuttingList(p, undefined, SEED_MATERIALS, OPTS);
    const gates = buildCuttingList(p, undefined, SEED_MATERIALS, { ...OPTS, scope: 'gates' });
    for (const pos of gates.positions) {
      const same = all.positions.find((x) => x.key === pos.key);
      expect(same?.label).toBe(pos.label);
    }
  });

  it('radni nalog za kapije: samo kapije, samo stubovi uz kapije, broj elemenata u zbiru je broj kapija', () => {
    const wo = buildWorkOrder(p, undefined, SEED_MATERIALS, { ...OPTS, scope: 'gates' });
    expect(wo.elements.length).toBeGreaterThan(0);
    expect(wo.elements.every((e) => e.isGate)).toBe(true);
    expect(wo.summary.elements).toBe(gateIdx.length);
    expect(wo.summary.gates).toBe(gateIdx.length);
    const lay = computeLayout(p);
    const nearGate = new Set(gateIdx.flatMap((i) => [i, i + 1]));
    for (const post of wo.posts) expect(nearGate.has(Number(post.name.slice(1)) - 1)).toBe(true);
    expect(wo.posts.length).toBeLessThan(lay.posts.filter((x) => !x.hidden).length);
    const full = buildWorkOrder(p, undefined, SEED_MATERIALS, OPTS);
    expect(full.elements.length).toBeGreaterThan(wo.elements.length);
  });

  it('radni nalog za ogradu bez kapija nema kapije', () => {
    const wo = buildWorkOrder(p, undefined, SEED_MATERIALS, { ...OPTS, scope: 'fence' });
    expect(wo.elements.length).toBeGreaterThan(0);
    expect(wo.elements.some((e) => e.isGate)).toBe(false);
    expect(wo.summary.gates).toBe(0);
  });

  it('projekat sveden na deo: elementi van dela su prazni otvori iste širine, raspored kapija ostaje isti', () => {
    const sp = scopedProject(p, 'gates');
    expect(sp.items.length).toBe(p.items.length);
    sp.items.forEach((it, i) => { expect(it.widthMm).toBe(p.items[i].widthMm); if (!inPrintScope(p.items[i], 'gates')) expect(it.kind).toBe('opening'); });
    const a = computeLayout(p).items; const b = computeLayout(sp).items;
    for (const i of gateIdx) { expect(b[i].clearWidth).toBe(a[i].clearWidth); expect(b[i].axisStart).toBe(a[i].axisStart); }
    expect(scopedProject(p, 'all')).toBe(p);
  });
});
