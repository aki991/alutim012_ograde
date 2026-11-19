import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { createFence, createProject } from '../domain/models/factories';
import { buildWorkOrder } from '../domain/pricing/workorder';
import { sameElementGroups } from '../services/workorderGroups';

describe('radni nalog: isti elementi se spajaju', () => {
  it('dva ista platna su jedna stavka 2×, a platno druge mere ostaje posebno', () => {
    const p = createProject('R', [createFence({ modelId: 'picket_narrow', widthMm: 1500 }), createFence({ modelId: 'picket_narrow', widthMm: 1500 }), createFence({ modelId: 'picket_narrow', widthMm: 1200 })]);
    const wo = buildWorkOrder(p, undefined, SEED_MATERIALS, { stockMm: 6000, kerfMm: 3 });
    const groups = sameElementGroups(p, wo.elements);
    expect(groups.map((g) => g.members.length)).toEqual([2, 1]);
  });
});
