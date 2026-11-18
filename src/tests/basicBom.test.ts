import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { basicGateRows } from '../domain/gates/basicBom';
import { autoGateSpec } from '../domain/models/pairHardware';
import { newCustomModel } from '../domain/models/custom';
import { defaultGateConfig } from '../domain/gates/gateModels';
import type { Material } from '../domain/models/types';

const hw = (id: string, name: string): Material => ({ id, sku: id, name, category: 'okov', unit: 'kom', price: 10, wasteFactor: 0 } as unknown as Material);
const MATS: Material[] = [...MODEL_MATERIALS, hw('s1', 'Prihvatnik brave'), hw('b1', 'Podni zasun'), hw('c1', 'Podni prihvat zasuna i graničnik')];

describe('sastavnica osnovnih kapija', () => {
  it('pešačka i jednokrilna: delovi crteža + 2 šarke + brava', () => {
    for (const t of ['pedestrian', 'single'] as const) {
      const rows = basicGateRows(t, 'picket_narrow', [], MATS);
      expect(rows.some((r) => r.group === 'Šarke' && r.qty === '2 kom')).toBe(true);
      expect(rows.some((r) => r.group === 'Brave' && r.qty === '1 kom')).toBe(true);
      expect(rows.length).toBeGreaterThan(3);
    }
  });
  it('dvokrilna: oba krila i sav okov (6 šarki, brava, prihvatnik, zasun, podni prihvat)', () => {
    const rows = basicGateRows('double', 'picket_narrow', [], MATS);
    expect(rows.find((r) => r.group === 'Šarke')?.qty).toBe('6 kom');
    expect(rows.find((r) => r.group === 'Brave')?.qty).toBe('1 kom');
    expect(rows.filter((r) => r.group === 'Okov i nosači').length).toBe(3);
  });
  it('klizne: sklop sa šinom i okovom', () => {
    for (const p of ['klizna_sina_rucna', 'samonoseca_rucna'] as const) expect(basicGateRows(p, 'picket_narrow', [], MATS).length).toBeGreaterThan(5);
  });
  it('okov koji se sam upisuje u sastavnicu: pešačka i jednokrilna da, klizna ne', () => {
    const m = (t: 'pedestrian' | 'sliding') => ({ ...newCustomModel('x'), kind: 'gate' as const, gate: defaultGateConfig(t) });
    expect(autoGateSpec(m('pedestrian'), MATS)?.map((r) => r.qty)).toEqual(['HINGES', '1']);
    expect(autoGateSpec(m('sliding'), MATS)).toBeNull();
  });
});
