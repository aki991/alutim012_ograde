import { describe, expect, it } from 'vitest';
import { isTotalLocked, setItemWidthLock, setOuterWidth, setTotalLength, setTotalLock, widthChangeProblem } from '../domain/geometry/operations';
import { sumModularWidths } from '../domain/geometry/layout';
import { createFence, createGate, createProject } from '../domain/models/factories';

const five = () => createProject('p', Array.from({ length: 5 }, () => createFence({ modelId: 'h_narrow', widthMm: 2000 })));
const widths = (p: ReturnType<typeof five>) => p.items.map((i) => i.widthMm);

describe('zaključavanje ukupne dužine i širine platna', () => {
  it('bez zaključavanja promena platna menja ukupnu dužinu (kao do sada)', () => {
    const p = five();
    const q = setOuterWidth(p, p.items[0].id, 1600);
    expect(sumModularWidths(q.items)).toBeLessThan(sumModularWidths(p.items));
    expect(widths(q).slice(1)).toEqual([2000, 2000, 2000, 2000]);
  });

  it('zaključana ukupna dužina: ostala platna se sama prilagođavaju, zbir ostaje isti', () => {
    const p = setTotalLock(five(), true);
    expect(isTotalLocked(p)).toBe(true);
    expect(p.settings.fixedTotalMm).toBe(10000);
    const q = setOuterWidth(p, p.items[0].id, 1500 + 50); // spoljna širina: osa–osa 1500 + polovine stubova
    expect(sumModularWidths(q.items)).toBe(10000);
    expect(q.items[0].widthMm).toBeLessThan(2000);
    // preostala 4 platna dele razliku
    expect(widths(q).slice(1).every((w) => w > 2000)).toBe(true);
  });

  it('zaključano platno ostaje isto, ostala dele razliku', () => {
    let p = setTotalLock(five(), true);
    p = setItemWidthLock(p, p.items[1].id, true);
    p = setItemWidthLock(p, p.items[2].id, true);
    const q = setOuterWidth(p, p.items[0].id, 1650);
    expect(sumModularWidths(q.items)).toBe(10000);
    expect(q.items[1].widthMm).toBe(2000);
    expect(q.items[2].widthMm).toBe(2000);
    expect(q.items[3].widthMm).toBeGreaterThan(2000);
    expect(q.items[4].widthMm).toBeGreaterThan(2000);
  });

  it('kapija ostaje ista kad se raspoređuju platna', () => {
    const base = createProject('g', [createFence({ modelId: 'h_narrow', widthMm: 2000 }), createFence({ modelId: 'h_narrow', widthMm: 2000 }), createGate('sliding', { infillModelId: 'h_narrow', widthMm: 4000 })]);
    const p = setTotalLock(base, true);
    const q = setOuterWidth(p, p.items[0].id, 1750);
    expect(q.items[2].widthMm).toBe(4000);
    expect(sumModularWidths(q.items)).toBe(sumModularWidths(p.items));
  });

  it('ako ostala platna ne mogu da popune razliku, ništa se ne menja i objašnjava se zašto', () => {
    let p = setTotalLock(five(), true);
    for (const i of [1, 2, 3, 4]) p = setItemWidthLock(p, p.items[i].id, true);
    expect(widthChangeProblem(p, p.items[0].id, 1500)).toMatch(/zaključan/);
    expect(setOuterWidth(p, p.items[0].id, 1500)).toBe(p);
    // nezaključano: može
    expect(widthChangeProblem(five(), five().items[0].id, 1500)).toBeNull();
  });

  it('ukupna dužina menjana sa kote deli se na nezaključana platna, a zaključana ostaju', () => {
    let p = five();
    p = setItemWidthLock(p, p.items[0].id, true);
    const r = setTotalLength(p, 10600);
    expect(r.reason).toBeUndefined();
    expect(r.project.items[0].widthMm).toBe(2000);
    expect(sumModularWidths(r.project.items)).toBeGreaterThan(10000);
    // kad je ukupna dužina zaključana, zadata vrednost prati novu meru
    const locked = setTotalLength(setTotalLock(five(), true), 10600);
    expect(locked.project.settings.fixedTotalMm).toBe(sumModularWidths(locked.project.items));
  });
});
