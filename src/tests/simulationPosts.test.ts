import { describe, expect, it } from 'vitest';
import { computeLayout } from '../domain/geometry/layout';
import { createFence, createProject } from '../domain/models/factories';
import { isProductionPost, productionPostCount } from '../domain/models/productionPosts';
import type { Material, PostType } from '../domain/models/types';
import { buildBom, buildProjectFinishing } from '../domain/pricing/calc';
import { buildCuttingList } from '../domain/pricing/cutting';
import { buildMaterialList } from '../domain/pricing/materialList';
import { buildCutList } from '../domain/pricing/production';
import { buildRail04Sheet } from '../domain/pricing/railSpec';
import { buildRequisition } from '../domain/pricing/requisition';
import { buildRl10Sheet } from '../domain/pricing/rl10Spec';
import { buildWorkOrder } from '../domain/pricing/workorder';
import { frontViewSvgString } from '../services/exports';
import { schemaSvg } from '../services/workorderSvg';
import { FINISHING_MATERIALS as MATS, FINISHING_SPECS as SPECS, finishingProject } from './fixtures/finishing';
import { SEED_MATERIALS } from './fixtures/materials';

const opts = { stockMm: 6000, kerfMm: 3 };
const concrete: Material = { ...MATS[0], id: 'sim-concrete', sku: 'BETON', name: 'Betonski stub 400×400', category: 'stub', unit: 'kom', unitPrice: 50000, mass: 200, massUnit: 'kg/kom', massSource: 'manual' };

describe('betonski oslonci su samo simulacija', () => {
  it('mešoviti projekat: u svim listama i zbiru su samo dva aluminijumska stuba', () => {
    const p = finishingProject();
    p.posts = p.posts.map((post, i) => i < 2 ? { ...post, type: (i === 0 ? 'concrete' : 'concrete_plinth') as PostType, plinthMm: 0, materialId: concrete.id, capTopMaterialId: MATS[1].id } : post);
    const mats = [...MATS, concrete];
    const layout = computeLayout(p); expect(layout.postCount).toBe(4); expect(productionPostCount(p)).toBe(2);
    const work = buildWorkOrder(p, SPECS, mats, opts);
    expect(work.posts.map((post) => post.name)).toEqual(['S3', 'S4']); expect(work.summary.posts).toBe(2);
    const cut = buildCuttingList(p, SPECS, mats, opts);
    expect(cut.positions.filter((pos) => /^S/.test(pos.key)).map((pos) => pos.key)).toEqual(['S3', 'S4']);
    expect(buildProjectFinishing(p, mats, SPECS).massKg).toBeCloseTo(9 * 0.3888, 10);
    expect(buildProjectFinishing(p, mats, SPECS).areaM2).toBeCloseTo(9 * 0.08, 10);
    expect(buildBom(p, mats, SPECS).some((l) => l.materialId === concrete.id || l.materialId === MATS[1].id)).toBe(false);
    expect(JSON.stringify(buildMaterialList(p, mats, SPECS))).not.toContain('Betonski');
    expect(JSON.stringify(buildRequisition(p, mats, SPECS, opts))).not.toContain('Betonski');
    const svg = schemaSvg(p, work.positionOfItem, new Map()).svg;
    expect(svg).not.toContain('>S1<'); expect(svg).not.toContain('>S2<'); expect(svg).toContain('>S3<');
    expect(frontViewSvgString(p)).toContain('#c9ccd0');
    expect(frontViewSvgString(p, 0.08, { production: true })).not.toContain('#c9ccd0');
    expect(p.posts.filter((post) => !isProductionPost(post))).toHaveLength(2);
  });
  it('svi betonski: nema stubova, kapa ni mase stubova u radnoj/krojnoj/nabavnoj listi', () => {
    const p = finishingProject(); p.posts = p.posts.map((post) => ({ ...post, type: 'concrete', materialId: concrete.id }));
    const mats = [...MATS, concrete];
    const wo = buildWorkOrder(p, SPECS, mats, opts);
    expect(wo.posts).toEqual([]); expect(wo.summary.posts).toBe(0); expect(wo.cutting.positions.some((pos) => /^S/.test(pos.key))).toBe(false);
    expect(buildProjectFinishing(p, mats, SPECS).massKg).toBeCloseTo(6 * 0.3888, 10);
  });
  it('betonski artikal se ne može vratiti u liste dodavanjem u specifikaciju', () => {
    const p = finishingProject(); const mats = [...MATS, concrete];
    const specs = { h_white: [...SPECS.h_white!, { id: 'simulation', name: 'Beton', materialId: concrete.id, group: 'Stubovi' as const, qty: '1', lengthMm: '2000', enabled: true }] };
    expect(buildBom(p, mats, specs).some((l) => l.materialId === concrete.id)).toBe(false);
    expect(buildCutList(p, specs, mats).some((c) => c.profile.includes('Betonski'))).toBe(false);
    expect(buildRequisition(p, mats, specs, opts).groups.flatMap((g) => g.lines).some((l) => l.sku === concrete.sku)).toBe(false);
  });
  it('posebni modeli 04 i RL10 takođe ne proizvode cevi, lajsne i stope umesto betonskih stubova', () => {
    for (const modelId of ['rail_black', 'rail_inox'] as const) {
      const p = createProject('terasa', [createFence({ modelId, widthMm: 2000, heightMm: 1000 })]);
      p.posts = p.posts.map((post) => ({ ...post, type: 'concrete' }));
      const sheet = modelId === 'rail_black' ? buildRail04Sheet(p)! : buildRl10Sheet(p)!;
      expect(sheet.posts).toEqual([]); expect(sheet.cuts.some((c) => /^Stub/.test(c.part))).toBe(false);
      expect(buildBom(p, SEED_MATERIALS).some((l) => l.group === 'Stubovi')).toBe(false);
      const wo = buildWorkOrder(p, undefined, SEED_MATERIALS, opts);
      expect(wo.posts).toEqual([]); expect(wo.cutting.positions.some((pos) => /^S/.test(pos.key))).toBe(false);
    }
  });
});
