import { describe, expect, it } from 'vitest';
import { computeLayout, outerWidthMm } from '../domain/geometry/layout';
import { setOuterWidth } from '../domain/geometry/operations';
import { createFence, createProject } from '../domain/models/factories';

describe('spoljna (zauzeta) dužina elementa', () => {
  it('element zadat sa 1000 mm zauzima tačno 1000 mm', () => {
    let p = createProject('t', [createFence({ widthMm: 2000 })]);
    p = setOuterWidth(p, p.items[0].id, 1000);
    expect(outerWidthMm(p, 0)).toBe(1000);
    expect(computeLayout(p).occupiedMm).toBe(1000);
    expect(p.items[0].widthMm).toBe(900); // osa–osa: 1000 − po pola dva stuba od 100 mm
  });

  it('ukupna dužina dva elementa računa zajednički stub jednom', () => {
    let p = createProject('t', [createFence({ widthMm: 2000 }), createFence({ widthMm: 2000 })]);
    p = setOuterWidth(setOuterWidth(p, p.items[0].id, 1000), p.items[1].id, 1000);
    // 1000 + 1000 − zajednički stub (100 mm) = 1900 zauzeto
    expect(computeLayout(p).occupiedMm).toBe(1900);
  });
});

import { createGate } from '../domain/models/factories';
import { setTotalLength } from '../domain/geometry/operations';
describe('zadavanje ukupne dužine', () => {
  it('sva polja ograde dobijaju istu spoljnu meru, i uz kapiju; kapija ostaje ista', () => {
    const p = createProject('t', [createFence({ widthMm: 2890 }), createFence({ widthMm: 2900 }), createGate('pedestrian', { widthMm: 1000 }), createFence({ widthMm: 2780 }), createFence({ widthMm: 2900 })]);
    const gateBefore = p.items[2].widthMm;
    const r = setTotalLength(p, 12000);
    expect(r.reason).toBeUndefined();
    expect(computeLayout(r.project).occupiedMm).toBe(12000);
    const outers = [0, 1, 3, 4].map((i) => outerWidthMm(r.project, i));
    expect(Math.max(...outers) - Math.min(...outers)).toBeLessThanOrEqual(1);
    expect(r.project.items[2].widthMm).toBe(gateBefore);
  });
  it('previše malo mesta: poruka i bez izmene', () => {
    const p = createProject('t', [createFence(), createFence()]);
    const r = setTotalLength(p, 900);
    expect(r.reason).toBeDefined();
    expect(r.project).toBe(p);
  });
});
