import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { FENCE_MODEL_LIST } from '../domain/models/catalog';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { clampToFrame, partBounds } from '../domain/models/custom';
import { materialShape } from '../domain/models/materialShape';
import type { CustomPart } from '../domain/models/custom';

const shapeOf = (p: CustomPart) => { const m = SEED_MATERIALS.find((x) => x.id === p.materialId); return m ? materialShape(m) : null; };

describe('dorada modela iz kataloga', () => {
  it('svaki model iz kataloga postaje crtež od delova koji staju u okvir', () => {
    for (const def of FENCE_MODEL_LIST) {
      const m = builtinToCustom(def.id, SEED_MATERIALS, `cm_${def.id}`);
      expect(m.parts.length, def.id).toBeGreaterThan(0);
      expect(m.baseModelId).toBe(def.id);
      expect(m.name).toContain(def.name);
      // svi delovi su materijali iz cenovnika
      expect(m.parts.every((p) => SEED_MATERIALS.some((x) => x.id === p.materialId)), def.id).toBe(true);
      // ništa ne viri iz okvira (osim do zaokruživanja)
      for (const p of m.parts) {
        const b = partBounds(p, shapeOf(p)!);
        expect(b.x0, `${def.id} ${p.materialId}`).toBeGreaterThan(-1);
        expect(b.x1, `${def.id} ${p.materialId}`).toBeLessThan(m.widthMm + 1);
        expect(b.y0, `${def.id} ${p.materialId}`).toBeGreaterThan(-1);
        expect(b.y1, `${def.id} ${p.materialId}`).toBeLessThan(m.heightMm + 1);
      }
      expect(clampToFrame(m, shapeOf)).toBe(m);
    }
  });

  it('uske letvice: dve bočne U vođice i cevi između njih', () => {
    const m = builtinToCustom('h_narrow', SEED_MATERIALS, 'cm_x');
    const bars = m.parts.filter((p) => p.angleDeg === 0);
    expect(bars.length).toBeGreaterThan(10);
    expect(m.parts.filter((p) => p.angleDeg === 90 && p.materialId === 'mat_u_20x20')).toHaveLength(2);
  });
});

describe('promena mera dorađenog modela', () => {
  it('promena širine i visine: prečke se razvlače, ništa se ne preklapa', async () => {
    const { resizeModel } = await import('../domain/models/resize');
    const { checkNewOverlap } = await import('../domain/models/overlap');
    for (const id of ['h_narrow', 'h_boards', 'rail_black'] as const) {
      const m = builtinToCustom(id, SEED_MATERIALS, 'cm_s');
      const wider = resizeModel(m, 2600, m.heightMm, SEED_MATERIALS);
      expect(wider.widthMm, id).toBe(2600);
      expect(wider.parts.length, id).toBe(m.parts.length);
      expect(checkNewOverlap(m, wider, SEED_MATERIALS), id).toBeNull();
      const taller = resizeModel(wider, 2600, 1800, SEED_MATERIALS);
      expect(checkNewOverlap(wider, taller, SEED_MATERIALS), id).toBeNull();
    }
    // vodoravne cevi su duže za koliko je ograda šira
    const m = builtinToCustom('h_narrow', SEED_MATERIALS, 'cm_t');
    const w = resizeModel(m, 1900, m.heightMm, SEED_MATERIALS);
    const len = (mm: typeof m) => Math.max(...mm.parts.filter((p) => p.angleDeg === 0).map((p) => p.lengthMm));
    expect(len(w) - len(m)).toBeCloseTo(-100, 0); // polje 2000 → 1900
  });
});

describe('raspored prečki bez U profila', () => {
  it('dorađene uske letvice: grupa prečki ima broj, odstojanja i razmak, i menja se', async () => {
    const { barGroup, barLayoutInfo, layoutBars } = await import('../domain/models/guides');
    const m = builtinToCustom('h_narrow', SEED_MATERIALS, 'cm_l');
    const bar = m.parts.find((p) => p.angleDeg === 0)!;
    const grp = barGroup(m, bar, SEED_MATERIALS)!;
    expect(grp).toBeTruthy();
    expect(grp.free).toBe(true);
    const info = barLayoutInfo(m, bar, SEED_MATERIALS)!;
    expect(info.count).toBe(grp.bars.length);
    expect(info.count).toBeGreaterThan(10);
    expect(info.free).toBe(true);
    // manje prečki, isto odstojanje od vrha i dna: razmak se računa
    const r = layoutBars(m, bar.id, SEED_MATERIALS, { count: 20, top: info.top, bottom: info.bottom, gap: info.gap ?? 0, auto: 'gap', lufta: 'sa' });
    if ('error' in r) throw new Error(r.error);
    expect(barGroup(r.model, bar, SEED_MATERIALS)!.bars).toHaveLength(20);
    expect(r.values.count).toBe(20);
    expect(r.values.gap).toBeGreaterThan(0);
  });
});
