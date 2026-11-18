import { describe, expect, it } from 'vitest';
import { activeLeafIndex, BOLT_INSET_MM, doubleLeafBoxes, doubleOpenState, floorBoltLengthMm, gateLeafPoses, LEAF_GAP_MM } from '../domain/geometry/gates';
import { createGate } from '../domain/models/factories';

describe('dvokrilna kapija: aktivno i pasivno krilo', () => {
  it('nova dvokrilna kapija ima aktivno krilo levo, a ostale kapije ne menjaju stranu', () => {
    expect(activeLeafIndex(createGate('double'))).toBe(0);
    expect(createGate('single').opening).toBe('right');
    expect(activeLeafIndex(createGate('double', { opening: 'right' }))).toBe(1);
  });

  it('nejednaka krila: širine se zadržavaju pri promeni aktivne strane', () => {
    const g = createGate('double', { unequalLeaves: true, leftLeafMm: 900 });
    const [l, r] = doubleLeafBoxes(g, 3000);
    expect(l.w).toBe(900);
    expect(r.w).toBe(3000 - LEAF_GAP_MM - 900);
    const flipped = createGate('double', { unequalLeaves: true, leftLeafMm: 900, opening: 'right' });
    expect(doubleLeafBoxes(flipped, 3000).map((b) => b.w)).toEqual([l.w, r.w]);
    // krila se sastaju uz zazor
    expect(r.x - (l.x + l.w)).toBe(LEAF_GAP_MM);
  });

  it('oba krila: prvo aktivno, pa zasun, pa pasivno; zatvaranje obrnutim redom', () => {
    const at = (t: number) => doubleOpenState(t, 'both');
    expect(at(0)).toEqual({ active: 0, passive: 0, bolt: 0 });
    expect(at(0.45)).toMatchObject({ active: 1, passive: 0, bolt: 0 });
    expect(at(0.5)).toMatchObject({ active: 1, passive: 0 });
    expect(at(0.5).bolt).toBeGreaterThan(0);
    expect(at(0.55)).toMatchObject({ active: 1, passive: 0, bolt: 1 });
    expect(at(0.8).passive).toBeGreaterThan(0);
    expect(at(1)).toEqual({ active: 1, passive: 1, bolt: 1 });
    // pri zatvaranju (t opada) pasivno krilo se zatvori pre nego što aktivno krene
    expect(at(0.55).passive).toBe(0);
    expect(at(0.45).bolt).toBe(0);
  });

  it('samo aktivno krilo: zasun ostaje spušten, pasivno zatvoreno', () => {
    expect(doubleOpenState(1, 'active')).toEqual({ active: 1, passive: 0, bolt: 0 });
    expect(doubleOpenState(0.5, 'active')).toEqual({ active: 0.5, passive: 0, bolt: 0 });
  });

  it('krila se okreću oko ose šarki na bočnim stubovima, ka dvorištu', () => {
    const g = createGate('double');
    const [a, b] = gateLeafPoses(g, 0, 3000, 1);
    expect(a.pivotX).toBe(0);
    expect(b.pivotX).toBe(3000);
    expect(a.extendDir).toBe(1);
    expect(b.extendDir).toBe(-1);
    expect(a.rotationY).toBeGreaterThan(0); // unutra = dvorište (−Z)
    expect(b.rotationY).toBeLessThan(0);
  });

  it('zasun i prihvat su uz ivicu spoja pasivnog krila', () => {
    expect(BOLT_INSET_MM).toBeGreaterThan(0);
    expect(floorBoltLengthMm(1500)).toBeLessThan(1500 * 0.5);
  });
});

describe('dvokrilna kapija sa merama kapije (design) i različitim krilima', () => {
  it('prazne mere kapije ne ponište zadate širine krila', () => {
    const g = createGate('double', { unequalLeaves: true, leftLeafMm: 900, design: { dims: {}, solve: { double: 'equal' }, hardware: [], profiles: [], extra: [], cuts: [], confirmations: [] } as never });
    expect(doubleLeafBoxes(g, 2410).map((b) => b.w)).toEqual([900, 2410 - LEAF_GAP_MM - 900]);
  });
  it('aktivno krilo iz mera kapije ima prednost nad stranom iz podešavanja', () => {
    const g = createGate('double', { opening: 'left', design: { activeLeaf: 'right' } as never });
    expect(activeLeafIndex(g)).toBe(1);
  });
});
