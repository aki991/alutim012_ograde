import { describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { DEFAULT_MODEL_ID } from '../domain/models/catalog';
import { partBounds } from '../domain/models/custom';
import { customPartsFor, registerCustomModels } from '../domain/models/customRegistry';
import { modelWithFrame } from '../domain/models/frame';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { SEED_MATERIALS } from './fixtures/materials';

const mats = [...MODEL_MATERIALS, ...SEED_MATERIALS.filter((s) => !MODEL_MATERIALS.some((m) => m.id === s.id))];

describe('model sa ramom na polju druge veličine (projekat)', () => {
  it.each([[3090, 1375], [3000, 1285], [3500, 1375], [2400, 1100], [3090, 1500]])('%i × %i: ram zadržava debljinu, leži uz bočne U profile i uglovi se spajaju', (w, h) => {
    const base = builtinToCustom(DEFAULT_MODEL_ID, mats, 'cm_fr', 3000, 1285);
    const fm = mats.find((m) => m.name.includes('40×40'))!;
    const framed = modelWithFrame(base, fm, mats);
    if ('error' in framed) throw new Error(framed.error);
    registerCustomModels([framed], mats);
    const parts = customPartsFor('cm_fr', w, h, 'RAL 7016').filter((r) => !r.part.id.startsWith('rf_'));
    // delovi rama (dole, gore, levo, desno) su oni sa rezom 45°; ostali su ispuna
    const frame = parts.filter((r) => r.part.cut45);
    const rest = parts.filter((r) => !r.part.cut45);
    const bb = (r: (typeof parts)[number]) => partBounds(r.part, r.shape);
    expect(frame.length).toBe(4);
    const [bot, top, left, right] = frame.map(bb);
    const eq = (a: number, c: number) => expect(Math.abs(a - c)).toBeLessThan(0.05);
    // spoljne ivice rama su ivice polja, debljina rama je ista kao na crtežu (40 mm)
    eq(left.x0, 0); eq(right.x1, w); eq(bot.y0, 0); eq(top.y1, h);
    eq(left.x1 - left.x0, 40); eq(right.x1 - right.x0, 40); eq(top.y1 - top.y0, 40); eq(bot.y1 - bot.y0, 40);
    // bočni U profili naležu na unutrašnju ivicu rama (bez razmaka i bez preklapanja), i levo i desno
    const sides = rest.filter((r) => r.shape.type === 'linear' && !!(r.shape as { u?: unknown }).u);
    expect(sides.length).toBe(2);
    const sb = sides.map((r) => partBounds(r.part, r.shape)).sort((p, q) => p.x0 - q.x0);
    eq(sb[0].x0, left.x1); eq(sb[1].x1, right.x0);
    // gore i dole U profili stižu do unutrašnje ivice rama
    for (const s of sb) { eq(s.y0, bot.y1); eq(s.y1, top.y0); }
  });
});
