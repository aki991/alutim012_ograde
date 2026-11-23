import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { MODEL_MATERIALS } from '../src/data/modelMaterials';
import { TERRACE_MATERIALS } from '../src/data/terraceMaterials';
import type { CustomModel, CustomPart } from '../src/domain/models/custom';
import type { Project } from '../src/domain/models/types';

const materials = [...MODEL_MATERIALS, ...TERRACE_MATERIALS];
const bySku = (sku: string) => materials.find((m) => m.sku === sku)!;
const modelId = 'cm_e2e_joints'; const projectId = 'proj_e2e_joints';
async function seed(page: Page, mode: 'ball' | 'elbow', turn: number, rise: number, square: boolean, bothTransitions = false) {
  const part = (id: string, sku: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId: bySku(sku).id, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
  const model: CustomModel = { id: modelId, name: square ? 'Staklo sa uglom' : 'Inox sa uglom', kind: 'terrace', widthMm: 1200, heightMm: 1100, color: 'RAL 9006', updatedAt: new Date().toISOString(),
    parts: [part('p1', square ? 'P-1057' : 'P-1054', 100, 0, 1000, 90), part('p2', square ? 'P-1057' : 'P-1054', 1100, 0, 1000, 90),
      part('h', square ? 'P-1072' : 'P-1037', 0, 1040, 1200, 0), ...(!square ? ((turn && rise) || bothTransitions ? [200, 400, 600, 800] : [300, 600]).map((y, i) => part(`r${i + 1}`, 'P-1146', 0, y, 1200, 0)) : [])],
    ...(square ? { glassRailing: { clampMaterialId: bySku('AK-5205').id, glassMaterialId: bySku('TER-VSG-66').id } } : {}),
  };
  model.parts = model.parts.map((p) => p.id.startsWith('p') ? { ...p, hwPick: { flange: bySku('AK-5036').id, connector: bySku(square ? 'AK-5126' : 'AK-5039-40').id } }
    : p.id.startsWith('r') ? { ...p, hwPick: { holder: bySku('AK-5011Y').id } } : p);
  const project: Project = { id: projectId, name: 'Provera ugaonih spojeva', schemaVersion: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), customerId: null, status: 'nacrt', quoteNo: '', notes: '',
    items: (bothTransitions ? [4000, 1700, 4000] : [1200, 1200]).map((widthMm, i) => ({ id: `field${i}`, kind: 'fence' as const, modelId, widthMm, heightMm: 1100, color: 'RAL 9006', materialId: model.parts[0].materialId,
      params: { barSizeMm: 0, gapMm: 0, frameMm: 0 }, ...(i === 1 && rise ? { stair: { riseMm: rise, steps: 6, group: 's' } } : {}) })),
    posts: (bothTransitions ? [0, 1, 2, 3] : [0, 1, 2]).map((i) => ({ id: `post${i}`, type: 'aluminium' as const, widthMm: 40, heightMm: 1100, color: 'RAL 9006', mounting: 'concrete_base' as const, custom: false, ...(i === (bothTransitions ? 2 : 1) ? { turnDeg: turn } : {}) })),
    settings: { totalMode: 'auto', fixedTotalMm: 2400, fillStrategy: 'proportional', defaultHeightMm: 1100, defaultColor: 'RAL 9006', showDimensions: true, showGrid: true, showLabels: false, cornerJoint: mode, cornerArmMm: 40,
      pricing: { vatPercent: 20, pricesIncludeVat: false, profitMode: 'margin', profitPercent: 25, discountPercent: 0, laborPerM2Rsd: 0, laborPerGateRsd: 0, installPerMeterRsd: 0, installPerGateRsd: 0, coatingPerM2Rsd: 0, currency: 'RSD' } },
  };
  await page.goto('/'); await expect(page.getByTestId('hero-new').first()).toBeVisible();
  await page.evaluate(async ({ model, project, materials }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const settings = await new Promise<Record<string, unknown>>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'projects', 'materials'], 'readwrite');
      tx.objectStore('kv').put({ ...settings, customModels: [model], terraceModelIds: [] }, 'settings');
      tx.objectStore('projects').put(project); materials.forEach((m) => tx.objectStore('materials').put(m));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('alutim.terraceMaterialsV2', '1'); db.close();
  }, { model, project, materials });
  await page.goto(`/editor/${projectId}`);
}
async function saved(page: Page) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const p = await new Promise<Project>((resolve) => { const r = db.transaction('projects').objectStore('projects').get(id); r.onsuccess = () => resolve(r.result); });
    db.close(); return p;
  }, projectId);
}

const cases: ['ball' | 'elbow', number, number, boolean, boolean?][] = [['ball', 90, 0, false], ['elbow', 90, 0, false], ['ball', 0, -720, false], ['ball', 90, -720, false], ['elbow', 0, -720, false], ['elbow', 90, 0, true], ['ball', 0, -1020, false, true], ['ball', 90, -1020, false, true]];
for (const [mode, turn, rise, square, bothTransitions] of cases) test(`ugao u 3D: ${square ? 'staklo' : 'inox'}, ${mode}, skretanje ${turn}, stepenište ${rise}`, async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, mode, turn, rise, square, bothTransitions);
  const jointCount = bothTransitions ? 10 : square ? 1 : turn && rise ? 5 : 3;
  const joints = page.getByTestId('front-view').locator('[data-part-id^="hw~cornerBall~"]');
  await expect(joints).toHaveCount(jointCount);
  await expect(page.getByTestId('front-view').locator('[data-part-id^="hw~cornerArm~"]')).toHaveCount(0);
  await expect.poll(async () => {
    const p = await saved(page); const a = p.items[0];
    return a.kind === 'fence' ? a.params.slats?.cornerConnections?.filter((c) => c.fitting).length : 0;
  }).toBe(bothTransitions ? 5 : jointCount);
  {
    const p = await saved(page);
    const gaps = await page.evaluate((p) => {
      const gaps: number[] = [];
      p.items.forEach((item, i) => {
        if (item.kind !== 'fence') return;
        item.params.slats?.cornerConnections?.forEach((connection) => {
          if (!connection.fitting) return;
          const field = document.querySelector(`[data-item-art="${item.id}"]`)!;
          const next = document.querySelector(`[data-item-art="${p.items[i + 1].id}"]`)!;
          const joint = field.querySelector<SVGPathElement>(`[data-part-id="hw~cornerBall~${connection.on}~~b"] path`)!;
          const left = field.querySelector<SVGRectElement>(`[data-part-id="${connection.on}"] rect`)!;
          const right = next.querySelector<SVGRectElement>(`[data-part-id="${connection.on}"] rect`)!;
          const end = (rect: SVGRectElement, last: boolean) => new DOMPoint(rect.x.baseVal.value + (last ? rect.width.baseVal.value : 0), rect.y.baseVal.value + rect.height.baseVal.value / 2).matrixTransform(rect.getCTM()!);
          const a = joint.getPointAtLength(0).matrixTransform(joint.getCTM()!);
          const b = joint.getPointAtLength(joint.getTotalLength()).matrixTransform(joint.getCTM()!);
          const pa = end(left, true); const pb = end(right, false);
          gaps.push(Math.hypot(a.x - pa.x, a.y - pa.y), Math.hypot(b.x - pb.x, b.y - pb.y));
        });
      });
      return gaps;
    }, p);
    expect(gaps).toHaveLength(jointCount * 2);
    for (const gap of gaps) expect(gap).toBeLessThan(0.05);
  }
  if (rise) {
    const flangeTilts = await page.getByTestId('front-view').evaluate((svg) => Array.from(svg.querySelectorAll<SVGRectElement>('[data-stair="true"] [data-part-id^="hw~flange~"] rect')).map((rect) => rect.getCTM()!.b));
    expect(flangeTilts.length).toBeGreaterThan(0);
    for (const tilt of flangeTilts) expect(tilt).toBeCloseTo(0, 8);
  }
  await page.getByTestId('front-view').screenshot({ path: `test-results/joint-front-${square ? 'glass' : 'inox'}-${mode}-${turn}-${rise}.png` });
  if (mode === 'elbow') {
    await page.getByTestId('project-corner-arm').fill('60'); await page.getByTestId('project-corner-arm').press('Enter');
    await expect.poll(async () => {
      const p = await saved(page); const a = p.items[0];
      return a.kind === 'fence' ? a.params.slats?.cornerConnections?.find((c) => c.fitting)?.fitting?.shape.takeoffMm : 0;
    }).toBe(60);
  }
  await page.getByTestId('tab-three').click();
  const canvas = page.getByTestId('three-canvas').locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__aluTest?.stats().jointBalls)).toBe(mode === 'ball' ? jointCount : 0);
  await expect.poll(async () => Math.max(...(await sharp(await canvas.screenshot()).stats()).channels.slice(0, 3).map((c) => c.stdev))).toBeGreaterThan(5);
  await canvas.screenshot({ path: `test-results/joint-${square ? 'glass' : 'inox'}-${mode}-${turn}-${rise}.png` });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.78, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -650);
  await canvas.screenshot({ path: `test-results/joint-close-${square ? 'glass' : 'inox'}-${mode}-${turn}-${rise}.png` });
  await page.reload(); await expect(page.getByTestId('front-view').locator('[data-part-id^="hw~cornerBall~"]')).toHaveCount(jointCount);
  const p = await saved(page);
  expect(p.items.map((i) => i.widthMm)).toEqual(bothTransitions ? [4000, 1700, 4000] : [1200, 1200]);
  if (mode === 'elbow' && rise) await expect(page.getByTestId('corner-missing-material')).toBeVisible();
  expect(errors).toEqual([]);
});

test('prepust na stepeništu prikazuje stvarnu meru i isti unos ne menja geometriju', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, 'ball', 0, -720, false);
  await page.locator('[data-hit="item"][data-id="field1"]').click({ modifiers: ['Control'] });
  // Aktivira raspored po gazištima i na tek učitanom projektu.
  await page.getByTestId('post-settings-toggle').click();
  await page.getByTestId('post-spacing').fill('800'); await page.getByTestId('post-spacing').press('Enter');
  const input = page.getByTestId('post-end-overhang');
  await expect(input).toBeVisible();
  const actual = Number(await input.inputValue());
  expect(actual).toBeGreaterThan(100);
  const rod = page.getByTestId('front-view').locator('[data-item-art="field1"] [data-part-id="r1"] rect');
  const before = Number(await rod.getAttribute('width'));
  await input.fill(String(actual)); await input.press('Enter');
  expect(Number(await rod.getAttribute('width'))).toBe(before);
  await input.fill('100'); await input.press('Enter');
  await expect(input).toHaveValue('100');
  await expect.poll(async () => before - Number(await rod.getAttribute('width'))).toBeCloseTo((actual - 100) * Math.hypot(1, 720 / 1200), 2);
  await expect.poll(async () => {
    const p = await saved(page); const item = p.items[1];
    return item.kind === 'fence' ? item.params.slats?.endOverhangMm : undefined;
  }).toBe(100);
  await page.reload();
  await page.locator('[data-hit="item"][data-id="field1"]').click({ modifiers: ['Control'] });
  await page.getByTestId('post-settings-toggle').click();
  await expect(page.getByTestId('post-end-overhang')).toHaveValue('100');
});
