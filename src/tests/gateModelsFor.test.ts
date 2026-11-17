import { describe, expect, it } from 'vitest';
import { gateModelsFor, leafKeyOf } from '../domain/gates/gateModels';
import { newCustomModel, type CustomModel } from '../domain/models/custom';
import { defaultGateConfig } from '../domain/gates/gateModels';

const gate = (id: string, over: Partial<CustomModel> = {}): CustomModel => ({
  ...newCustomModel(id), kind: 'gate', parts: [{ id: 'p', materialId: 'm', x: 0, y: 0, lengthMm: 100, angleDeg: 0, rot: 0, z: 0 }], gate: defaultGateConfig('pedestrian'), leafModelId: 'picket_narrow', ...over,
});

describe('moje kapije uz ogradu', () => {
  it('nudi samo kapije istog tipa i ograde, podrazumevana je prva', () => {
    const list = [gate('a'), gate('b', { gateDefault: true }), gate('c', { leafModelId: 'other' }), gate('d', { gate: defaultGateConfig('double') }), gate('e', { parts: [] })];
    expect(gateModelsFor(list, 'pedestrian', 'picket_narrow').map((m) => m.id)).toEqual(['b', 'a']);
    expect(gateModelsFor(list, 'double', 'picket_narrow').map((m) => m.id)).toEqual(['d']);
  });
  it('kapija iz modela vodi na svoju ogradu', () => {
    const list = [gate('a')];
    expect(leafKeyOf('a', list)).toBe('picket_narrow');
    expect(gateModelsFor(list, 'pedestrian', 'a').map((m) => m.id)).toEqual(['a']);
  });
});
