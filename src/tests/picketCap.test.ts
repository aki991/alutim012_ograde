import { describe, expect, it } from 'vitest';
import { materialShape, solidsBounds } from '../domain/models/materialShape';
import type { Material } from '../domain/models/types';

const cap: Material = { id: 'mat_ek_k100018', sku: 'K100018', name: 'Čep tarabice pun 80×20 mm', unit: 'kom', category: 'okov', unitPrice: 120, wastePercent: 0, demo: false };

describe('čep tarabice', () => {
  it('je komad sa okovratnikom i kupolom visine 0,425 × širina, prema tarabici 80×20', () => {
    const s = materialShape(cap);
    expect(s.type).toBe('piece');
    if (s.type !== 'piece') return;
    expect(s.group).toBe('cepovi');
    const dome = s.solids.find((x) => x.prim === 'dome');
    expect(dome).toMatchObject({ w: 80, d: 20, h: 34 });
    const b = solidsBounds(s.solids);
    expect(b.x1 - b.x0).toBeCloseTo(84); // okovratnik 2 mm širi sa svake strane
    expect(b.y1).toBeCloseTo(40);        // 6 mm okovratnik + 34 mm kupola = CAPH 40
  });
});
