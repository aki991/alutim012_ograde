import { describe, expect, it } from 'vitest';
import { registerCustomModels } from '../domain/models/customRegistry';
import { newCustomModel } from '../domain/models/custom';
import { createFence, createProject, defaultSettings } from '../domain/models/factories';

describe('stubovi uz platno nacrtanog modela', () => {
  const m = { ...newCustomModel('cm_pe'), widthMm: 1500, heightMm: 1200, parts: [{ id: 'p', materialId: 'x', x: 0, y: 0, lengthMm: 1500, angleDeg: 0, rot: 0, z: 0 }] };
  it('su 50 mm viši od platna', () => {
    registerCustomModels([m], []);
    const p = createProject('t', [createFence({ modelId: 'cm_pe' as never, heightMm: 1200 })]);
    expect(p.posts.every((q) => q.heightMm === 1250)).toBe(true);
  });
  it('ograda za terasu: stub ostaje iste visine kao platno', () => {
    registerCustomModels([{ ...m, id: 'cm_te', kind: 'terrace' }], []);
    const p = createProject('t', [createFence({ modelId: 'cm_te' as never, heightMm: 1100 })]);
    expect(p.posts.every((q) => q.heightMm === 1100)).toBe(true);
  });
  it('kote su podrazumevano prikazane', () => {
    expect(defaultSettings().showDimensions).toBe(true);
  });
});
