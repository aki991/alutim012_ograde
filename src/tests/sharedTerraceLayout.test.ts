import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RAILS, MODEL_MATERIALS } from '../data/modelMaterials';
import { newCustomModel, partBounds, type CustomModel, type CustomPart } from '../domain/models/custom';
import { customModelOf, customPartsFor, customRails, customSlatLayout, registerCustomModels, scaledModel, terraceEvaluated, terraceVariantId } from '../domain/models/customRegistry';
import { materialShape } from '../domain/models/materialShape';
import { builtinToCustom } from '../domain/models/fromBuiltin';
import { withRunPosts } from '../domain/geometry/runPosts';
import { createFence, createProject } from '../domain/models/factories';
import { computeLayout } from '../domain/geometry/layout';
import { hasFreeStairPickets, sharedBaySpans } from '../domain/models/sharedTerrace';
import { postSpec } from '../domain/models/terraceHardware';
import { hGuideInfo } from '../domain/models/guides';

const materials = [...MODEL_MATERIALS, ...DEFAULT_RAILS];
const tube = 'mat_ek_kv000007';
const cap = 'mat_ek_k100018';
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg = 0): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
// Šest letvica 80×20 i dva nosača: iste mere i tipovi delova kao na prijavljenim modelima.
const source = (capped: boolean): CustomModel => ({
  ...newCustomModel('Preneti model'), id: 'cm_shared_layout', widthMm: 1200, heightMm: 1000,
  parts: [part('lower', 'mat_kv_30x20', 0, 80, 1200), part('upper', 'mat_kv_30x20', 0, 880, 1200),
    ...Array.from({ length: 6 }, (_, i) => part(`picket${i}`, tube, 100 + i * 200, 0, capped ? 980 : 1000, 90)),
    ...(capped ? Array.from({ length: 6 }, (_, i) => part(`cap${i}`, cap, 100 + i * 200, 980, 0)) : [part('handrail', DEFAULT_RAILS[0].id, 0, 980, 1200)]),
  ],
});
const guidedSource = (linked = true): CustomModel => ({
  ...newCustomModel('Tarabice u profilima'), id: 'cm_shared_guided', widthMm: 1200, heightMm: 1000,
  parts: [{ ...part('bottom-guide', 'mat_u_60x28', 0, 14, 1200), rot: 90 }, { ...part('top-guide', 'mat_u_60x28', 0, 986, 1200), rot: 270 },
    ...Array.from({ length: 6 }, (_, i): CustomPart => ({ ...part(`picket${i}`, tube, 100 + i * 200, 3, 994, 90), ...(linked ? { guides: ['bottom-guide', 'top-guide'] } : {}) })),
  ],
});
const bounds = (p: CustomPart) => partBounds(p, materialShape(materials.find((m) => m.id === p.materialId)!));
const aliasOf = (m: CustomModel) => {
  registerCustomModels([m], materials, [m.id]);
  return customModelOf(terraceVariantId(m.id))!;
};
afterEach(() => registerCustomModels([], materials, []));

describe('parametarski raspored dvorišnih modela prenetih na terase', () => {
  for (const linked of [false, true]) it.each([-1020, 1020])(`tarabice u donjem i gornjem profilu zadržavaju uklapanje na stepeništu (%s mm), veze ${linked}`, (riseMm) => {
    const original = guidedSource(linked); const alias = aliasOf(original);
    expect(hasFreeStairPickets(original, materials)).toBe(false);
    expect(hasFreeStairPickets(source(true), materials)).toBe(true);
    const prepared = withRunPosts(createProject('Uklopljene tarabice', [createFence({ modelId: alias.id as `cm_${string}`, widthMm: 1700, heightMm: 1000, stair: { riseMm, steps: 6 } })]), materials);
    const item = prepared.items[0]; if (item.kind !== 'fence') throw new Error('Očekivana ograda');
    const width = computeLayout(prepared).items[0].clearWidth; const tan = item.params.slats!.stairTan!; const factor = Math.hypot(1, tan);
    const over = { ...item.params.slats, treadClearanceMm: 70 };
    const result = scaledModel(alias, width, 1000, over);
    const pickets = result.parts.filter((p) => p.materialId === tube);
    expect(pickets.length).toBeGreaterThan(2);
    for (const p of pickets) {
      const bay = p.id.match(/~bay\d+$/)![0];
      const bottom = result.parts.find((g) => g.id === `bottom-guide${bay}`)!;
      const top = result.parts.find((g) => g.id === `top-guide${bay}`)!;
      const B = hGuideInfo(bottom, materialShape(materials.find((m) => m.id === bottom.materialId)!))!;
      const T = hGuideInfo(top, materialShape(materials.find((m) => m.id === top.materialId)!))!;
      for (const guide of [bottom, top]) {
        expect(guide.unshearTan).toBe(tan);
        expect(guide.tube3d?.angleDeg).toBeCloseTo(Math.atan(tan) * 180 / Math.PI, 6);
        expect(guide.tube3d?.lengthMm).toBeCloseTo(guide.lengthMm * factor, 6);
      }
      expect(p.y).toBeGreaterThanOrEqual(bottom.y + (B.backY - bottom.y) * factor - 0.01);
      expect(p.y).toBeLessThan(bottom.y + (B.mouthY - bottom.y) * factor);
      expect(p.y + p.lengthMm).toBeGreaterThan(top.y + (T.mouthY - top.y) * factor);
      expect(p.y + p.lengthMm).toBeLessThanOrEqual(top.y + (T.backY - top.y) * factor + 0.01);
      expect(p.unshearTan).toBe(tan);
      expect(p.cutStartDeg).toBeCloseTo(Math.atan(tan) * 180 / Math.PI, 6);
      expect(p.cutEndDeg).toBeCloseTo(Math.atan(tan) * 180 / Math.PI, 6);
    }
    expect(scaledModel(alias, width, 1000, { ...over, treadClearanceMm: 0 }).parts).toEqual(result.parts);
    const cuts = terraceEvaluated(alias.id, width, 1000, over, factor)!.filter((r) => r.part.materialId === tube);
    expect(cuts.every((r) => r.part.note?.includes('oba kraja prate nagib profila'))).toBe(true);
    expect(cuts.flatMap((r) => Array.from({ length: r.qty }, () => r.lengthMm)).sort()).toEqual(pickets.map((p) => Math.round(p.lengthMm)).sort());
    expect(customModelOf(original.id)).toEqual(original);
  });
  for (const capped of [false, true]) {
    it(`${capped ? 'tarabice sa čepom' : 'letvice sa rukohvatom'}: broj prati širinu, presek i odstojanja ostaju isti`, () => {
      const original = source(capped);
      const alias = aliasOf(original);
      const counts: number[] = [];
      for (const width of [1600, 3900]) {
        const model = scaledModel(alias, width, 833);
        const pickets = model.parts.filter((p) => p.materialId === tube);
        const lay = customSlatLayout(alias.id, width, 833)!;
        expect(lay).not.toBeNull();
        expect(lay.count).toBe(pickets.length);
        expect(Math.abs(lay.gap - 120)).toBeLessThan(50);
        expect(lay.left).toBe(60); expect(lay.right).toBe(60);
        for (const p of pickets) {
          const b = bounds(p);
          expect(b.x1 - b.x0).toBeCloseTo(80, 6);
          expect(p.angleDeg).toBe(90);
          expect(p.lengthMm).toBe(capped ? 813 : 833);
        }
        expect(model.parts.filter((p) => p.id.startsWith('lower~')).every((p) => p.y === 80)).toBe(true);
        expect(model.parts.filter((p) => p.id.startsWith('upper~')).every((p) => p.y === 713)).toBe(true);
        const posts = model.parts.filter((p) => p.terraceRole === 'post');
        expect(posts.length).toBeGreaterThanOrEqual(2);
        for (const p of pickets) for (const post of posts) {
          const b = bounds(p); const pb = bounds(post);
          expect(b.x1 <= pb.x0 + 0.1 || b.x0 >= pb.x1 - 0.1).toBe(true);
        }
        if (capped) {
          const caps = model.parts.filter((p) => p.materialId === cap);
          expect(caps.length).toBe(pickets.length);
          for (const p of pickets) expect(caps.some((c) => Math.abs(c.x - p.x) < 0.1 && Math.abs(c.y - p.y - p.lengthMm) < 0.1)).toBe(true);
        }
        counts.push(pickets.length);
      }
      expect(counts[1]).toBeGreaterThan(counts[0]);
      expect(customModelOf(original.id)).toEqual(original);
    });
  }

  it('podešavanja razmaka i nosača menjaju prikaz i krojnu listu, i na stepeništu', () => {
    const alias = aliasOf(source(true));
    const slats = { leftMm: 50, rightMm: 70, gapMm: 60, rails: { lower: 120 } };
    const lay = customSlatLayout(alias.id, 3900, 833, slats)!;
    expect(lay.left).toBe(50); expect(lay.right).toBe(70);
    expect(lay.count).toBeGreaterThan(customSlatLayout(alias.id, 3900, 833)!.count);
    expect(customRails(alias.id, slats).find((r) => r.key === 'lower')?.offsetMm).toBe(120);
    const rendered = customPartsFor(alias.id, 3900, 833, '#ffffff', slats);
    const rows = terraceEvaluated(alias.id, 3900, 833, slats, Math.hypot(1, 0.6))!;
    expect(rows.filter((r) => r.part.materialId === tube).reduce((n, r) => n + r.qty, 0)).toBe(lay.count);
    expect(rows.find((r) => r.part.materialId === cap)?.qty).toBe(lay.count);
    expect(rendered.filter((r) => r.part.materialId === tube)).toHaveLength(lay.count);
    const expectedCuts = rendered.filter((r) => r.part.materialId === 'mat_kv_30x20').map((r) => Math.round(r.part.lengthMm * Math.hypot(1, 0.6))).sort();
    expect(rows.filter((r) => r.part.materialId === 'mat_kv_30x20').flatMap((r) => Array.from({ length: r.qty }, () => r.lengthMm)).sort()).toEqual(expectedCuts);
  });

  it.each([-1020, 1020])('tarabice i čepovi na stepeništu (%s mm) ostaju uspravni i pravilno raspoređeni', (riseMm) => {
    const alias = aliasOf(source(true));
    const project = createProject('Stepenište', [createFence({ modelId: terraceVariantId(source(true).id), widthMm: 1700, heightMm: 833, stair: { riseMm, steps: 6 } })]);
    const prepared = withRunPosts(project, materials);
    const item = prepared.items[0];
    if (item.kind !== 'fence') throw new Error('Očekivana ograda');
    expect(item.params.slats?.stairTan).toBeCloseTo(riseMm / 1700);
    expect(withRunPosts(prepared, materials)).toBe(prepared);
    const result = scaledModel(alias, computeLayout(prepared).items[0].clearWidth, 833, item.params.slats);
    const pickets = result.parts.filter((p) => p.materialId === tube);
    const caps = result.parts.filter((p) => p.materialId === cap);
    expect(caps.length).toBe(pickets.length);
    for (const p of [...pickets, ...caps]) expect(p.unshearTan).toBe(item.params.slats?.stairTan);
    expect(result.parts.find((p) => p.id === 'lower')?.unshearTan).toBeUndefined();
  });

  it('ram i vodoravna ispuna prenetog modela ostaju vezani za ivice i preračunavaju broj', () => {
    const original = { ...builtinToCustom('h_combo', materials, 'cm_horizontal_share'), kind: 'fence' as const };
    const alias = aliasOf(original);
    for (const [w, h] of [[3900, 833], [1600, 1200]]) {
      const actual = scaledModel(alias, w, h);
      sharedBaySpans(alias, w, materials).forEach(([from, to], i) => {
        const expected = scaledModel(original, to - from, h);
        const parts = actual.parts.filter((p) => p.id.endsWith(`~bay${i}`)).map((p) => ({ ...p, id: p.id.replace(/~bay\d+$/, ''), x: p.x - from }));
        expect(parts).toEqual(expected.parts);
      });
    }
  });

  it('razmak, krajnja odstojanja i materijal određuju stvarne stubove i krojnu listu', () => {
    const original = source(true); const alias = aliasOf(original);
    const over = { postSpacingMm: 600, postLeftMm: 100, postRightMm: 200, postMaterialId: 'mat_ek_ktf808030' };
    const result = scaledModel(alias, 4000, 1000, over);
    const posts = result.parts.filter((p) => p.terraceRole === 'post').sort((a, b) => a.x - b.x);
    expect(posts).toHaveLength(8);
    expect(posts[0].x).toBe(100); expect(posts.at(-1)!.x).toBe(3800);
    for (let i = 1; i < posts.length; i++) expect(posts[i].x - posts[i - 1].x).toBeLessThanOrEqual(600);
    expect(posts.every((p) => p.materialId === over.postMaterialId)).toBe(true);
    expect(postSpec(alias, materials, over)?.half).toBeCloseTo(40, 6);
    const rows = terraceEvaluated(alias.id, 4000, 1000, over, 1)!;
    expect(rows.filter((r) => r.part.group === 'Stubovi').reduce((n, r) => n + r.qty, 0)).toBe(8);
    expect(customModelOf(original.id)).toEqual(original);
  });

  it('podizanje ispune ne odvaja stubove od poda i ne skraćuje njihove krojne mere', () => {
    const alias = aliasOf(source(true));
    const rendered = customPartsFor(alias.id, 4000, 900, '#ffffff', undefined, 100);
    const posts = rendered.filter((r) => r.part.terraceRole === 'post');
    expect(posts.length).toBeGreaterThan(2);
    expect(posts.every((r) => r.part.y === -100 && r.part.lengthMm === 1000)).toBe(true);
    const rows = terraceEvaluated(alias.id, 4000, 900, undefined, 1, 100)!;
    expect(rows.filter((r) => r.part.group === 'Stubovi').every((r) => r.lengthMm === 1000)).toBe(true);
  });

  for (const riseMm of [-1200, 1200]) it(`ceo presek tarabice ostaje iznad nejednakih gazišta, smer ${riseMm}`, () => {
    const alias = aliasOf(source(true));
    const custom = [140, 460, 180, 420, 300, 300].map((treadMm, i) => ({ treadMm, riseMm: [150, 250, 100, 200, 300, 200][i] }));
    const project = createProject('Nejednaki stepenici', [createFence({ modelId: terraceVariantId(source(true).id), widthMm: 1800, heightMm: 1000, stair: { riseMm, steps: 6, custom } })]);
    const prepared = withRunPosts(project, materials);
    const it = prepared.items[0];
    if (it.kind !== 'fence') throw new Error('Očekivana ograda');
    expect(it.params.slats?.stairTreads).toHaveLength(6);
    for (const clearance of [0, 30, 70]) {
      const over = { ...it.params.slats, treadClearanceMm: clearance };
      const model = scaledModel(alias, computeLayout(prepared).items[0].clearWidth, 1000, over);
      const pickets = model.parts.filter((p) => p.materialId === tube);
      expect(pickets.length).toBeGreaterThan(2);
      const lengths = new Set<number>();
      for (const p of pickets) {
        const b = bounds(p);
        const levels = over.stairTreads!.filter((t) => t.toMm > b.x0 + 0.001 && t.fromMm < b.x1 - 0.001).map((t) => t.levelMm);
        expect(p.y + over.stairTan! * p.x).toBeGreaterThanOrEqual(Math.max(...levels) + clearance - 0.001);
        const capPart = model.parts.find((c) => c.materialId === cap && Math.abs(c.x - p.x) < 0.1)!;
        expect(capPart.y).toBeCloseTo(p.y + p.lengthMm, 3);
        lengths.add(Math.round(p.lengthMm));
      }
      expect(lengths.size).toBeGreaterThan(1);
      const cuts = terraceEvaluated(alias.id, 1800, 1000, over, Math.hypot(1, over.stairTan!))!.filter((r) => r.part.materialId === tube);
      expect(cuts.reduce((n, r) => n + r.qty, 0)).toBe(pickets.length);
      expect(cuts.flatMap((r) => Array.from({ length: r.qty }, () => r.lengthMm)).sort()).toEqual(pickets.map((p) => Math.round(p.lengthMm)).sort());
    }
    const flat = withRunPosts({ ...prepared, items: [{ ...it, stair: undefined }] }, materials).items[0];
    if (flat.kind !== 'fence') throw new Error('Očekivana ograda');
    expect(flat.params.slats?.stairTreads).toBeUndefined();
  });
});
