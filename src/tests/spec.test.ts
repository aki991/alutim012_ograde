import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from '../data/materials';
import { FENCE_MODEL_LIST } from '../domain/models/catalog';
import { createFence, createProject } from '../domain/models/factories';
import { checkFormula, defaultSpec, evalFormula, evaluateSpec, specVars, type ModelSpecs } from '../domain/models/spec';
import { buildBom, computePrice } from '../domain/pricing/calc';
import { buildCutList } from '../domain/pricing/production';
import { buildLouver08Sheet } from '../domain/pricing/louverSpec';
import { buildRail04Sheet } from '../domain/pricing/railSpec';

describe('formule specifikacije', () => {
  it('računa izraze, promenljive i funkcije bez eval-a', () => {
    const v = { W: 1000, N: 9 };
    expect(evalFormula('W-2*2-2', v)).toBe(994);
    expect(evalFormula('2*(N+1)', v)).toBe(20);
    expect(evalFormula('ceil(W/300)', v)).toBe(4);
    expect(evalFormula('max(N, 12)-min(3,4)', v)).toBe(9);
    expect(evalFormula('-N+10', v)).toBe(1);
    expect(evalFormula('1.5*2', v)).toBe(3);
  });
  it('prijavljuje greške u formuli', () => {
    const v = { W: 1000 };
    expect(checkFormula('W+', v)).toBeTruthy();
    expect(checkFormula('X*2', v)).toContain('Nepoznata promenljiva');
    expect(checkFormula('W/0', v)).toContain('nije broj');
    expect(checkFormula('process.exit(1)', v)).toBeTruthy();
    expect(checkFormula('', v)).toBeNull();
  });
});

describe('specifikacija modela', () => {
  it('svaki model ima podrazumevanu specifikaciju bez grešaka u formulama i sa poznatim materijalima', () => {
    for (const def of FENCE_MODEL_LIST) {
      const vars = specVars({ modelId: def.id, widthMm: 1900, heightMm: 1600, axisMm: 2000, params: def.defaults });
      const parts = defaultSpec(def.id);
      expect(parts.length, def.id).toBeGreaterThan(0);
      for (const ev of evaluateSpec(parts, vars)) {
        expect(ev.error, `${def.id}/${ev.part.name}`).toBeNull();
        expect(SEED_MATERIALS.some((m) => m.id === ev.part.materialId), `${def.id}/${ev.part.materialId}`).toBe(true);
      }
    }
  });

  it('izmena specifikacije menja krojnu listu i cenu: brisanje i dodavanje elementa', () => {
    const p = createProject('s', [createFence({ modelId: 'h_narrow', widthMm: 2000, heightMm: 1600 })]);
    const base = computePrice(p, SEED_MATERIALS);
    const cutsBase = buildCutList(p);
    expect(cutsBase.some((c) => c.part.startsWith('Ram'))).toBe(true);
    const parts = defaultSpec('h_narrow');
    // bez ramova i sa jednim dodatnim profilom 2 × H
    const custom: ModelSpecs = { h_narrow: [...parts.filter((x) => !x.name.startsWith('Ram')), { id: 'x1', name: 'Dodatni stub-profil', materialId: 'mat_alu_frame', group: 'Ramovi', qty: '2', lengthMm: 'H', enabled: true }] };
    const cuts = buildCutList(p, custom);
    expect(cuts.find((c) => c.part === 'Dodatni stub-profil')).toMatchObject({ qty: 2, lengthMm: 1600 });
    expect(cuts.some((c) => c.part === 'Ram — horizontalni')).toBe(false);
    const changed = computePrice(p, SEED_MATERIALS, custom);
    expect(changed.materialTotal).not.toBe(base.materialTotal);
    const frame = buildBom(p, SEED_MATERIALS, custom).find((l) => l.materialId === 'mat_alu_frame')!;
    expect(frame.geometricQty).toBeCloseTo(3.2, 6); // samo dodatni profil 2 × 1,6 m
    // isključen element se ne računa
    const off: ModelSpecs = { h_narrow: parts.map((x) => ({ ...x, enabled: x.group !== 'Ramovi' })) };
    expect(buildBom(p, SEED_MATERIALS, off).some((l) => l.group === 'Ramovi')).toBe(false);
  });

  it('neispravna formula ne ruši obračun: element daje količinu 0', () => {
    const p = createProject('s', [createFence({ modelId: 'h_narrow' })]);
    const bad: ModelSpecs = { h_narrow: [{ id: 'b', name: 'Loš', materialId: 'mat_alu_frame', group: 'Ramovi', qty: 'W+', enabled: true }] };
    expect(buildBom(p, SEED_MATERIALS, bad).filter((l) => l.group !== 'Stubovi' && l.key !== 'extra')).toEqual([]);
  });

  it('modeli 04 i 08: izmenjena specifikacija zamenjuje detaljnu sastavnicu', () => {
    const p04 = createProject('04', [createFence({ modelId: 'rail_black', widthMm: 1000 })]);
    const p08 = createProject('08', [createFence({ modelId: 'louver_light', widthMm: 1100, heightMm: 1000 })]);
    expect(buildRail04Sheet(p04)).not.toBeNull();
    expect(buildLouver08Sheet(p08)).not.toBeNull();
    const specs: ModelSpecs = { rail_black: defaultSpec('rail_black'), louver_light: defaultSpec('louver_light') };
    expect(buildRail04Sheet(p04, specs)).toBeNull();
    expect(buildLouver08Sheet(p08, specs)).toBeNull();
    const cuts08 = buildCutList(p08, specs);
    expect(cuts08.find((c) => c.part.startsWith('Horizontalna letvica'))).toMatchObject({ qty: 9, lengthMm: 994 });
    expect(cuts08.find((c) => c.part.startsWith('Bočna vođica'))).toMatchObject({ qty: 2, lengthMm: 1000 });
    expect(buildBom(p08, SEED_MATERIALS, specs).filter((l) => l.missingPrice)).toEqual([]);
    expect(buildBom(p04, SEED_MATERIALS, specs).some((l) => l.materialId === 'mat_post_alu')).toBe(true); // stubovi su tada obični stubovi
  });
});
