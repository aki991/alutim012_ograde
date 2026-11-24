import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_MATERIALS } from '../data/modelMaterials';
import { withTerraceMaterials } from '../data/terraceMaterials';
import { createFence, createProject } from '../domain/models/factories';
import { newTerraceModel, type CustomModel } from '../domain/models/custom';
import { customPartsFor, registerCustomModels, terraceVariantId } from '../domain/models/customRegistry';
import { fitPicketsToTreads } from '../domain/models/sharedTerrace';
import { withRunPosts } from '../domain/geometry/runPosts';
import { patchTerracePost, restoreTerracePosts, setTerracePostsEnabled } from '../domain/geometry/terracePosts';
import { computeLayout } from '../domain/geometry/layout';
import { buildCutList } from '../domain/pricing/production';
import { buildBom } from '../domain/pricing/calc';
import { layoutPosts, setHwPick } from '../domain/models/terraceHardware';
import { propagateItemChange } from '../domain/geometry/editScope';
import { updateItem } from '../domain/geometry/operations';

const materials = withTerraceMaterials(MODEL_MATERIALS)!;
const mat = (sku: string) => materials.find((m) => m.sku === sku)!;
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg = 0, z = 0) => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z });
const model = (): CustomModel => setHwPick({ ...newTerraceModel('Stubovi'), id: 'cm_edit_terrace_posts', widthMm: 1200,
  parts: [part('p1', mat('P-1054').id, 100, 0, 1000, 90), part('p2', mat('P-1054').id, 1100, 0, 1000, 90), part('rail', mat('P-1037').id, 0, 1040, 1200)] }, 'p1', 'flange', mat('AK-5036').id);
const project = () => { const m = model(); registerCustomModels([m], materials); return withRunPosts(createProject('Stubovi', [createFence({ modelId: m.id as `cm_${string}`, widthMm: 3200, heightMm: 1100 })]), materials); };
const parts = (p: ReturnType<typeof project>) => { const it = p.items[0]; if (it.kind !== 'fence') throw new Error('Ograda'); return customPartsFor(it.modelId, computeLayout(p).items[0].clearWidth, it.heightMm, '#999', it.params.slats); };
afterEach(() => registerCustomModels([], materials, []));

describe('izostavljanje i dimenzije stubova terase', () => {
  it('isključivanje krajnjeg stuba stepeništa ne prebacuje pojedinačne mere na susedni stub', () => {
    const p = project(); const base = p.items[0]; if (base.kind !== 'fence') throw new Error('Ograda');
    const stair = withRunPosts({ ...p, items: [{ ...base, widthMm: 1800, stair: { riseMm: -1200, steps: 6, group: 'g' } }] }, materials);
    const edited = withRunPosts(patchTerracePost(stair, base.id, '1', { heightMm: 950 }), materials);
    const it = edited.items[0]; if (it.kind !== 'fence') throw new Error('Ograda');
    const hidden = withRunPosts({ ...edited, items: [{ ...it, params: { ...it.params, slats: { ...it.params.slats, stairLastPost: false } } }] }, materials);
    const post = parts(hidden).find((r) => r.part.terracePostKey === '1');
    expect(post?.part.lengthMm).toBe(950);
    expect(post?.part.x).toBe(parts(edited).find((r) => r.part.terracePostKey === '1')?.part.x);
  });
  it('ponovni raspored ne prenosi izmenu prvog stuba na druge i ne dodaje spuštanje dva puta', () => {
    const m = model(); const over = { postXs: [100, 1100, 2100], postDrops: [100, 200, 300], stairTan: 0.6, postOverrides: { '0': { materialId: 'mat_ek_ktf808030', heightMm: 950 }, '1': { removed: true } } };
    const first = layoutPosts({ ...m, widthMm: 2200 }, m, materials, over.postXs, over);
    const second = layoutPosts(first, m, materials, over.postXs, over);
    const posts = (q: CustomModel) => q.parts.filter((p) => p.terracePostKey !== undefined).map((p) => ({ key: p.terracePostKey, id: p.id, material: p.materialId, height: p.lengthMm, y: p.y }));
    expect(posts(second)).toEqual(posts(first));
    expect(posts(second)[1]).toMatchObject({ key: '2', material: mat('P-1054').id, height: 1300, y: -300 });
  });
  it('masovno vraćanje podešavanja drugog platna ne briše pojedinačne izmene stubova', () => {
    const first = createFence({ params: { barSizeMm: 20, gapMm: 20, frameMm: 0, slats: { gapMm: 20, postOverrides: { '0': { removed: true } } } } });
    const second = createFence({ params: { barSizeMm: 20, gapMm: 20, frameMm: 0, slats: { gapMm: 40, postOverrides: { '1': { heightMm: 950 } } } } });
    const p = createProject('Opseg', [first, second]);
    const next = updateItem(p, first.id, { params: { barSizeMm: 20, gapMm: 20, frameMm: 0 } });
    const out = propagateItemChange(p, next, first.id, 'same').items[1];
    expect(out.kind === 'fence' && out.params.slats?.postOverrides).toEqual({ '1': { heightMm: 950 } });
  });
  it('pojedinačno uklanjanje ne menja ključeve i položaje drugih stubova, a uklanja njegov okov i nabavku', () => {
    const p = project(); const original = parts(p).filter((r) => r.part.terracePostKey !== undefined);
    expect(original).toHaveLength(4);
    const next = withRunPosts(patchTerracePost(p, p.items[0].id, '1', { removed: true }), materials);
    expect(parts(next).filter((r) => r.part.terracePostKey !== undefined).map((r) => [r.part.terracePostKey, r.part.x])).toEqual(original.filter((r) => r.part.terracePostKey !== '1').map((r) => [r.part.terracePostKey, r.part.x]));
    expect(buildCutList(next, undefined, materials).filter((r) => r.part === 'Stub').reduce((n, r) => n + r.qty, 0)).toBe(3);
    const qty = (q: typeof p) => buildBom(q, materials).find((r) => r.materialId === mat('AK-5036').id)?.geometricQty;
    expect(qty(next)).toBe(qty(p)! - 1);
    const restored = withRunPosts(restoreTerracePosts(JSON.parse(JSON.stringify(next))), materials);
    expect(parts(restored)).toEqual(parts(p));
  });
  it('pojedinačna promena preseka i visine prati prikaz i krojnu listu', () => {
    const p = project(); const replacement = 'mat_ek_ktf808030';
    expect(materials.some((m) => m.id === replacement)).toBe(true);
    const next = withRunPosts(patchTerracePost(p, p.items[0].id, '2', { materialId: replacement, heightMm: 950 }), materials);
    const posts = parts(next).filter((r) => r.part.terracePostKey !== undefined);
    expect(posts.find((r) => r.part.terracePostKey === '2')?.part).toMatchObject({ materialId: replacement, lengthMm: 950 });
    expect(posts.filter((r) => r.part.terracePostKey !== '2').every((r) => r.part.materialId === mat('P-1054').id)).toBe(true);
    expect(buildCutList(next, undefined, materials).some((r) => r.lengthMm === 950 && r.profile === materials.find((m) => m.id === replacement)?.name)).toBe(true);
  });
  it('bez stubova ne uklanja nosače iz prenetog modela i ne ostavlja praznine za stubove', () => {
    const source: CustomModel = { ...model(), id: 'cm_yard_holders', kind: 'fence', parts: [part('holder', 'mat_kv_30x20', 300, 0, 1000, 90, -25),
      ...Array.from({ length: 5 }, (_, i) => part(`picket${i}`, 'mat_ek_kv000007', 100 + i * 220, 0, 980, 90))] };
    registerCustomModels([source], materials, [source.id]);
    const p = withRunPosts(createProject('Bez stubova', [createFence({ modelId: terraceVariantId(source.id), widthMm: 1700 })]), materials);
    const next = withRunPosts(setTerracePostsEnabled(p, false), materials);
    const resolved = parts(next);
    expect(resolved.some((r) => r.part.terracePostKey !== undefined)).toBe(false);
    expect(resolved.some((r) => r.part.id.startsWith('holder~bay'))).toBe(true);
    expect(resolved.filter((r) => r.part.materialId === 'mat_ek_kv000007').every((r) => r.part.id.endsWith('~bay0'))).toBe(true);
    expect(buildCutList(next, undefined, materials).some((r) => r.part === 'Stub')).toBe(false);
  });
  it('odvojeni projektni stub može da se izostavi i vrati bez brisanja platana ili ugla trase', () => {
    const p = createProject('Ugrađena terasa', [createFence({ modelId: 'rail_black' }), createFence({ modelId: 'rail_black' })]);
    p.posts[1].turnDeg = 45;
    const next = { ...p, posts: p.posts.map((q, i) => i === 1 ? { ...q, removed: true } : q) };
    expect(computeLayout(next).posts[1]).toMatchObject({ hidden: true, widthMm: 0, post: { turnDeg: 45 } });
    expect(next.items).toEqual(p.items);
    expect(restoreTerracePosts(next).posts[1].removed).toBe(false);
  });
});

it.each([0.6, -0.6])('uža vertikala iza tarabice završava na njenom rezu, nagib %s', (tan) => {
  const m: CustomModel = { ...model(), parts: [part('picket', 'mat_ek_kv000007', 280, 0, 1000, 90), part('holder', 'mat_kv_30x20', 270, 0, 1000, 90, -30)] };
  const result = fitPicketsToTreads(m, materials, { stairTan: tan, stairTreads: [{ fromMm: 0, toMm: 300, levelMm: 0 }, { fromMm: 300, toMm: 600, levelMm: 170 }], treadClearanceMm: 30 });
  const picket = result.parts.find((p) => p.id === 'picket')!; const holder = result.parts.find((p) => p.id === 'holder')!;
  expect(holder.y + tan * holder.x).toBeCloseTo(picket.y + tan * picket.x, 5);
  expect(holder.y + holder.lengthMm).toBe(1000);
  expect(holder.lengthMm).toBeLessThan(1000);
});
