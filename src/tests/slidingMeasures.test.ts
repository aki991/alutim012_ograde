import { describe, expect, it } from 'vitest';
import { resolveGate, systemOf } from '../domain/gates/design';
import { SLIDING_PRESETS, specFromPreset } from '../domain/gates/slidingAssembly';
import { createGate } from '../domain/models/factories';

describe('Mere kapije za klizni sklop (sve četiri varijante)', () => {
  it.each(SLIDING_PRESETS.map((p) => p.id))('%s: mere se računaju bez greške', (id) => {
    const d = specFromPreset(id);
    const g = createGate('sliding', { sliding: { ...d.spec, drawnLeaf: true, heightTotal: true }, heightMm: d.frameHeight + d.spec.frameBottomY });
    const sys = systemOf(g);
    expect(['cantilever', 'rail']).toContain(sys);
    const res = resolveGate(g, 3000);
    expect(res.system).toBe(sys);
    expect(res.values.W.v).toBe(3000);
  });
});
