import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { doubleGateSeed, pickFromModel, resizePair, withPairHardware } from '../domain/models/doubleGateSeed';
import { leafOfPair, pairRoleOf, pairWidth, type PairRole } from '../domain/models/pairHardware';
import type { Material } from '../domain/models/types';

const hw = (id: string, name: string): Material => ({ id, sku: id, name, category: 'okov', unit: 'kom', price: 10, wasteFactor: 0 } as unknown as Material);
const MATS: Material[] = [...MODEL_MATERIALS, hw('h1', 'Šarka za kapiju'), hw('s1', 'Prihvatnik brave'), hw('b1', 'Podni zasun'), hw('c1', 'Podni prihvat zasuna i graničnik')];

const roles = (parts: { materialId: string }[]): PairRole[] => parts.map((p) => pairRoleOf(MATS.find((m) => m.id === p.materialId))).filter((r): r is PairRole => r !== null);

describe('dvokrilna kapija iz Doradi: dva krila sa svim okovom', () => {
  const made = doubleGateSeed('picket_narrow', [], MATS, 'cmx', 3000, 1500);
  if ('error' in made) throw new Error(made.error);
  const { model, layout } = made;

  it('crtež ima dva krila i otvor 3000 mm', () => {
    expect(pairWidth(layout)).toBe(3000);
    expect(model.widthMm).toBe(3000);
    const xs = model.parts.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(layout.leftMm);
    expect(Math.max(...xs)).toBeGreaterThan(layout.leftMm + layout.gapMm);
  });

  it('okov: 6 šarki (krila šira od 1200 mm imaju po 3), brava, prihvatnik, zasun i podni prihvat; nepostojeće uloge se prijavljuju', () => {
    const r = roles(model.parts);
    expect(r.filter((x) => x === 'hinge').length).toBe(6);
    for (const x of ['lock', 'strike', 'bolt', 'catch'] as const) expect(r.filter((y) => y === x).length).toBe(1);
    expect(made.missing).toEqual([]);
  });

  it('brava je na aktivnom (levom) krilu, prihvatnik, zasun i prihvat na pasivnom; zamena strane ih prebacuje', () => {
    const at = (r: PairRole, m = model) => m.parts.find((p) => pairRoleOf(MATS.find((q) => q.id === p.materialId)) === r)!.x;
    const mid = layout.leftMm + layout.gapMm / 2;
    expect(at('lock')).toBeLessThan(mid);
    expect(at('strike')).toBeGreaterThan(mid);
    expect(at('bolt')).toBeGreaterThan(mid);
    expect(at('catch')).toBeCloseTo(at('bolt'), 5);
    const flipped = withPairHardware(model, layout, 'right', pickFromModel(model, MATS), MATS);
    expect(at('lock', flipped)).toBeGreaterThan(mid);
    expect(at('strike', flipped)).toBeLessThan(mid);
    expect(at('bolt', flipped)).toBeLessThan(mid);
    expect(roles(flipped.parts).filter((x) => x === 'hinge').length).toBe(6);
  });

  it('nejednaka krila: širine se menjaju posebno i okov ide uz nove ivice', () => {
    const res = resizePair(model, layout, { leftMm: 900, rightMm: 2080 }, 'left', MATS);
    if ('error' in res) throw new Error(res.error);
    expect(res.layout).toEqual({ leftMm: 900, rightMm: 2080, gapMm: layout.gapMm });
    expect(res.model.widthMm).toBe(3000);
    const lock = res.model.parts.find((p) => pairRoleOf(MATS.find((q) => q.id === p.materialId)) === 'lock')!;
    expect(lock.x).toBeLessThan(900);
    expect(roles(res.model.parts).filter((x) => x === 'hinge').length).toBe(5); // levo 900 mm: 2, desno 2080 mm: 3
  });

  it('projekat dobija crtež jednog krila bez okova para', () => {
    const m = { ...model, gate: { gateType: 'double' as const, leaves: layout } } as typeof model;
    const leaf = leafOfPair(m, MATS);
    expect(leaf.widthMm).toBe(layout.leftMm);
    expect(roles(leaf.parts)).toEqual([]);
    expect(Math.max(...leaf.parts.map((p) => p.x))).toBeLessThan(layout.leftMm + 1);
  });
});

describe('pešačka i jednokrilna: okov na crtežu', () => {
  it('2 šarke na strani šarki i brava uz slobodnu ivicu; projekat dobija krilo bez okova', async () => {
    const { singleGateSeed } = await import('../domain/models/doubleGateSeed');
    const made = singleGateSeed('picket_narrow', [], MATS, 'cms', 1000, 1500);
    if ('error' in made) throw new Error(made.error);
    const r = roles(made.model.parts);
    expect(r.filter((x) => x === 'hinge').length).toBe(2);
    expect(r.filter((x) => x === 'lock').length).toBe(1);
    const lock = made.model.parts.find((p) => pairRoleOf(MATS.find((q) => q.id === p.materialId)) === 'lock')!;
    expect(lock.x).toBeLessThan(500); // šarke desno, brava levo
    const leaf = leafOfPair({ ...made.model, gate: { gateType: 'pedestrian' as const, hwDrawn: true } } as typeof made.model, MATS);
    expect(roles(leaf.parts)).toEqual([]);
  });
});
