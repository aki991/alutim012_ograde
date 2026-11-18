import { describe, expect, it } from 'vitest';
import { gateHingeQty, hingeCountFor } from '../domain/gates/hingeRule';
import { requiredHardware, systemOf } from '../domain/gates/design';
import { createGate } from '../domain/models/factories';
import { specVars } from '../domain/models/spec';

describe('pravilo broja šarki po krilu', () => {
  it('visina preko 1500 mm: 3 šarke bez obzira na širinu', () => {
    expect(hingeCountFor(800, 1501)).toBe(3);
    expect(hingeCountFor(800, 2000)).toBe(3);
  });
  it('visina do 1500 mm, a širina preko 1200 mm: 3 šarke', () => {
    expect(hingeCountFor(1201, 1500)).toBe(3);
    expect(hingeCountFor(1201, 1000)).toBe(3);
  });
  it('inače 2 šarke (granice su uključene u 2)', () => {
    expect(hingeCountFor(1200, 1500)).toBe(2);
    expect(hingeCountFor(900, 1200)).toBe(2);
  });
  it('dvokrilna: pravilo važi za svako krilo posebno', () => {
    const g = createGate('double', { heightMm: 1400, unequalLeaves: true, leftLeafMm: 900 });
    expect(gateHingeQty(g, 3000)).toEqual({ left: 2, right: 3 }); // levo 900, desno 2080
    const eq = createGate('double', { heightMm: 1400 });
    expect(gateHingeQty(eq, 2000)).toEqual({ left: 2, right: 2 }); // 990 po krilu
  });
  it('pešačka i jednokrilna: količina u sastavnici prati pravilo', () => {
    const g = createGate('single', { heightMm: 1800 });
    expect(requiredHardware(g, systemOf(g), gateHingeQty(g, 1000)).find((r) => r.role === 'hinge')?.qty).toBe(3);
    const low = createGate('pedestrian', { heightMm: 1200 });
    expect(requiredHardware(low, systemOf(low), gateHingeQty(low, 1000)).find((r) => r.role === 'hinge')?.qty).toBe(2);
  });
  it('promenljiva HINGES u formulama sastavnice', () => {
    const g = createGate('single'); const p = g.params;
    expect(specVars({ modelId: g.infillModelId, widthMm: 1000, heightMm: 1800, axisMm: 1100, params: p }).HINGES).toBe(3);
    expect(specVars({ modelId: g.infillModelId, widthMm: 1000, heightMm: 1400, axisMm: 1100, params: p }).HINGES).toBe(2);
  });
});
