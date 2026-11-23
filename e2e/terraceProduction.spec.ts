import { expect, test, type Page } from '@playwright/test';
import { TERRACE_MATERIALS } from '../src/data/terraceMaterials';
import { DEFAULT_RAILS, MODEL_MATERIALS } from '../src/data/modelMaterials';
import type { CustomModel } from '../src/domain/models/custom';
import type { Project } from '../src/domain/models/types';

const bySku = (sku: string) => TERRACE_MATERIALS.find((m) => m.sku === sku)!;
const yard = (id: string, name: string): CustomModel => ({ id, name, kind: 'fence', widthMm: 1200, heightMm: 1000, color: 'RAL 7016',
  updatedAt: new Date().toISOString(), parts: [{ id: 'rail', materialId: bySku('P-1072').id, x: 0, y: 500, lengthMm: 1200, angleDeg: 0, rot: 0, z: 0 }] });
const terrace = (): CustomModel => ({ ...yard('cm_e2e_terrace_glass', 'Staklena terasa'), kind: 'terrace',
  parts: [100, 1100].map((x, i) => ({ id: `post${i}`, materialId: bySku('P-1057').id, x, y: 0, lengthMm: 1000, angleDeg: 90, rot: 0, z: 0 })),
  glassRailing: { clampMaterialId: bySku('AK-5205').id, glassMaterialId: bySku('TER-VSG-66').id },
});
async function seed(page: Page, models: CustomModel[], projects: Project[] = []) {
  await page.goto('/');
  await expect(page.getByTestId('hero-new').first()).toBeVisible();
  await page.evaluate(async ({ models, projects, materials }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const settings = await new Promise<Record<string, unknown>>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'projects', 'materials'], 'readwrite');
      tx.objectStore('kv').put({ ...settings, customModels: models, terraceModelIds: [] }, 'settings');
      projects.forEach((p) => tx.objectStore('projects').put(p));
      materials.forEach((m) => tx.objectStore('materials').put(m));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('alutim.terraceMaterialsV2', '1'); db.close();
  }, { models, projects, materials: [...MODEL_MATERIALS, ...DEFAULT_RAILS, ...TERRACE_MATERIALS] });
}

for (const capped of [false, true]) test(`preneti model ${capped ? 'tarabica' : 'letvica sa rukohvatom'} preračunava ispunu i čuva podešavanja na stepeništu`, async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const source = yard('cm_e2e_shared_pickets', 'Vertikalne letvice 80×20');
  source.parts = [
    ...[80, 880].map((y, i) => ({ id: `support${i}`, materialId: 'mat_kv_30x20', x: 0, y, lengthMm: 1200, angleDeg: 0, rot: 0, z: -25 })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `picket${i}`, materialId: 'mat_ek_kv000007', x: 100 + i * 200, y: 0, lengthMm: capped ? 980 : 1000, angleDeg: 90, rot: 0, z: 0 })),
    ...(capped ? Array.from({ length: 6 }, (_, i) => ({ id: `cap${i}`, materialId: 'mat_ek_k100018', x: 100 + i * 200, y: 980, lengthMm: 0, angleDeg: 0, rot: 0, z: 0 }))
      : [{ id: 'handrail', materialId: DEFAULT_RAILS[0].id, x: 0, y: 980, lengthMm: 1200, angleDeg: 0, rot: 0, z: 0 }]),
  ];
  await seed(page, [source]);
  await page.goto('/modeli');
  await page.getByTestId('terrace-model-picker').locator('summary').click();
  await page.getByTestId(`terrace-use-${source.id}`).check();
  await page.getByRole('link', { name: 'Modeli ograda za terase', exact: true }).click();
  await page.getByTestId('custom-model-card').filter({ hasText: source.name }).getByTestId('use-custom-model').click();
  const art = page.getByTestId('front-view').getByTestId('custom-art').first();
  await expect(art).toBeVisible();
  await art.click({ force: true });
  await expect(page.getByTestId('panel-item')).toBeVisible();
  await page.getByTestId('field-width').fill('4000');
  await page.getByTestId('field-width').press('Tab');
  await page.getByTestId('field-height').fill('833');
  await page.getByTestId('field-height').press('Tab');
  await expect(page.getByTestId('post-settings')).toBeVisible();
  const posts = art.locator('[data-part-id^="terrace-post"]');
  await expect(posts).toHaveCount(5);
  await page.getByTestId('post-spacing').fill('600');
  await page.getByTestId('post-spacing').press('Tab');
  await expect(posts).toHaveCount(8);
  await page.getByTestId('post-left').fill('100');
  await page.getByTestId('post-left').press('Tab');
  await page.getByTestId('post-right').fill('200');
  await page.getByTestId('post-right').press('Tab');
  await page.getByTestId('terrace-post-material').selectOption(bySku('P-1057').id);
  await expect(posts.first().locator('g').first()).toHaveAttribute('transform', 'translate(100 0) rotate(90)');
  const pickets = () => art.locator('[data-part-id]:not([data-part-id^="terrace-post"])').filter({ has: page.locator('g[transform*="rotate(90)"]') });
  await expect.poll(() => pickets().count()).toBeGreaterThan(15);
  const initialCount = await pickets().count();
  await page.getByTestId('slat-settings-toggle').click();
  await expect(page.getByTestId('slat-gap')).toBeVisible();
  await page.getByTestId('slat-gap').fill('60');
  await page.getByTestId('slat-gap').press('Tab');
  await expect.poll(() => pickets().count()).toBeGreaterThan(initialCount);
  await page.getByTestId('btn-fit').click();
  await page.getByTestId('front-view').screenshot({ path: `test-results/shared-terrace-${capped ? 'pickets' : 'handrail'}-flat.png` });
  await page.getByTestId('field-stair-on').click();
  await expect(page.getByTestId('front-view').getByTestId('stair-steps-0')).toBeVisible();
  await page.getByTestId('field-stair-run').fill('1800');
  await page.getByTestId('field-stair-run').press('Tab');
  await page.getByTestId('field-stair-rise').fill('1020');
  await page.getByTestId('field-stair-rise').press('Tab');
  await expect(page.getByTestId('slat-gap')).toBeVisible();
  await expect(page.getByTestId('tread-clearance')).toHaveValue('30');
  await page.getByTestId('tread-clearance').fill('50');
  await page.getByTestId('tread-clearance').press('Tab');
  await expect(page.getByTestId('post-first')).toBeVisible();
  await expect(page.getByTestId('post-last-step')).toBeVisible();
  if (capped) expect(await art.locator(':scope > g[transform^="matrix"]').count()).toBe(await posts.count() + 2 * await pickets().count());
  await page.getByTestId('btn-fit').click();
  await page.getByTestId('front-view').screenshot({ path: `test-results/shared-terrace-${capped ? 'pickets' : 'handrail'}-2d.png` });
  await page.getByTestId('tab-three').click();
  await expect(page.locator('canvas')).toBeVisible();
  const sharp = (await import('sharp')).default;
  await expect.poll(async () => Math.max(...(await sharp(await page.locator('canvas').screenshot()).stats()).channels.slice(0, 3).map((c) => c.stdev)), { timeout: 15000 }).toBeGreaterThan(5);
  await page.locator('canvas').screenshot({ path: `test-results/shared-terrace-${capped ? 'pickets' : 'handrail'}-3d.png` });
  expect(errors).toEqual([]);
});

test('označeni dvorišni model je na obe stranice, a kapije uz terasni projekat koriste prvi dvorišni model', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const first = yard('cm_e2e_yard_first', 'Prvi dvorišni model');
  const second = yard('cm_e2e_yard_second', 'Drugi dvorišni model');
  const native = terrace();
  const invalidGate: CustomModel = { ...first, id: 'cm_e2e_terrace_gate', kind: 'gate', name: 'Kapija od terase se ne nudi', leafModelId: native.id };
  await seed(page, [first, second, native, invalidGate]);
  await page.goto('/modeli');
  await page.getByTestId('terrace-model-picker').locator('summary').click();
  await page.getByTestId(`terrace-use-${first.id}`).check();
  await expect(page.getByTestId(`terrace-use-${second.id}`)).not.toBeChecked();
  await page.getByRole('link', { name: 'Modeli ograda za terase', exact: true }).click();
  const card = page.getByTestId('custom-model-card').filter({ hasText: first.name });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('custom-model-card').filter({ hasText: second.name })).toHaveCount(0);
  await card.getByTestId('use-custom-model').click();
  await expect(page).toHaveURL(/\/editor\//);
  await page.getByRole('link', { name: 'Modeli kapija', exact: true }).click();
  const thumbnails = page.locator('[data-fence-model]');
  await expect(thumbnails.first()).toHaveAttribute('data-fence-model', first.id);
  expect(await thumbnails.evaluateAll((els) => els.every((e) => e.getAttribute('data-fence-model') === 'cm_e2e_yard_first'))).toBe(true);
  await expect(page.getByTestId('gate-model-card').filter({ hasText: invalidGate.name })).toHaveCount(0);
  await page.getByRole('link', { name: 'Modeli ograda', exact: true }).click();
  await expect(page.getByTestId('custom-model-card').filter({ hasText: first.name })).toBeVisible();
  await page.getByTestId('terrace-model-picker').locator('summary').click();
  await expect(page.getByTestId(`terrace-use-${first.id}`)).toBeChecked();
  await page.getByTestId(`terrace-use-${first.id}`).uncheck();
  await page.getByRole('link', { name: 'Modeli ograda za terase', exact: true }).click();
  await expect(page.getByTestId('custom-model-card').filter({ hasText: first.name })).toHaveCount(0);
  await expect(page.getByTestId('custom-model-card').filter({ hasText: native.name })).toBeVisible();
  expect(errors).toEqual([]);
});

test('staklo na stepeništu ima skicu i sve mere i uglove u krojnoj listi i preuzetom PDF-u', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const model = terrace();
  const project: Project = { id: 'proj_glass_cut_e2e', schemaVersion: 3, name: 'Stepenište — staklo', customerId: null, status: 'nacrt',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: '', quoteNo: 'S-001',
    items: [{ id: 'stair_glass', kind: 'fence', modelId: model.id as `cm_${string}`, widthMm: 1200, heightMm: 1000, color: 'RAL 7016', materialId: bySku('P-1057').id,
      params: { barSizeMm: 0, gapMm: 0, frameMm: 0 }, stair: { riseMm: 600, steps: 4, group: 's' } }],
    posts: [0, 1].map((i) => ({ id: `post_glass_${i}`, type: 'aluminium', widthMm: 40, heightMm: 1000, color: 'RAL 7016', mounting: 'concrete_base', custom: false })),
    settings: { totalMode: 'auto', fixedTotalMm: 1200, fillStrategy: 'proportional', defaultHeightMm: 1000, defaultColor: 'RAL 7016', showDimensions: true, showGrid: true, showLabels: false,
      pricing: { vatPercent: 20, pricesIncludeVat: false, profitMode: 'margin', profitPercent: 25, discountPercent: 0, laborPerM2Rsd: 0, laborPerGateRsd: 0, installPerMeterRsd: 0, installPerGateRsd: 0, coatingPerM2Rsd: 0, currency: 'RSD' } },
  };
  await seed(page, [model], [project]);
  await page.goto('/proizvodnja');
  await expect(page.getByTestId('glass-cut-list')).toBeVisible();
  await expect(page.getByTestId('glass-cut-piece')).toHaveCount(1);
  await expect(page.getByTestId('glass-cut-angles')).toContainText('63,4°');
  await expect(page.getByTestId('glass-cut-angles')).toContainText('116,6°');
  await expect(page.getByTestId('glass-cut-edges')).toContainText('AB');
  await page.goto(`/editor/${project.id}`);
  await page.screenshot({ path: 'test-results/glass-project-before-select.png' });
  await page.locator('[data-hit="item"]').first().click({ modifiers: ['Control'], timeout: 5000 });
  await page.screenshot({ path: 'test-results/glass-project-controls.png' });
  await expect(page.getByTestId('field-glass-tolerance')).toHaveValue('0');
  // Prvo postavi raspored stubova na gazištima, pa uporedi istu tablu pre i posle tolerancije.
  await page.getByTestId('post-spacing').fill('800');
  await page.getByTestId('post-spacing').press('Enter');
  const pane = page.getByTestId('front-view').locator('[data-part-id^="glazing~pane~"] rect').first();
  await expect(pane).toBeVisible();
  const widthBefore = Number(await pane.getAttribute('width'));
  const heightBefore = Number(await pane.getAttribute('height'));
  await page.getByTestId('field-glass-tolerance').fill('2');
  await page.getByTestId('field-glass-tolerance').press('Enter');
  const factor = Math.hypot(1, 0.5);
  await expect.poll(async () => Number(await pane.getAttribute('width'))).toBeCloseTo(widthBefore - 2 / factor, 2);
  await expect.poll(async () => Number(await pane.getAttribute('height'))).toBeCloseTo(heightBefore, 3);
  const width = Number(await pane.getAttribute('width'));
  const height = Number(await pane.getAttribute('height'));
  await expect.poll(() => page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const p = await new Promise<Project>((resolve) => { const req = db.transaction('projects').objectStore('projects').get(id); req.onsuccess = () => resolve(req.result); });
    db.close(); return p.items[0].kind === 'fence' ? p.items[0].params.slats?.glassToleranceMm : undefined;
  }, project.id)).toBe(2);
  await page.goto('/proizvodnja');
  await expect(page.getByTestId('glass-cut-edges')).toContainText(`AB ${(width * factor).toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1 })} mm`);
  await expect(page.getByTestId('glass-cut-edges')).toContainText(`BC ${height.toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1 })} mm`);
  await expect(page.getByTestId('glass-cut-angles')).toContainText('63,4°');
  await page.getByTestId('glass-cut-list').screenshot({ path: 'test-results/glass-cut-list.png' });
  await page.getByTestId('cutlist-pdf').click();
  await expect(page.getByTestId('pdf-save')).toBeEnabled({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByTestId('pdf-save').click();
  await (await download).saveAs('test-results/terrace-glass-cutlist.pdf');
  expect(errors).toEqual([]);
});

for (const stair of [true, false]) test(`početno i završno staklo ${stair ? 'stepeništa' : 'ravnog platna'}: dva držača, ograničenje širine i čuvanje`, async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const model = { ...terrace(), postLayout: { leftMm: 200, rightMm: 200 } };
  const factor = Math.hypot(1, stair ? 1020 / 1800 : 0);
  const project: Project = { id: `proj_glass_ends_${stair ? 'stair' : 'flat'}`, schemaVersion: 3, name: 'Krajnje staklo', customerId: null, status: 'nacrt',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), notes: '', quoteNo: '',
    items: [{ id: 'stair_glass_ends', kind: 'fence', modelId: model.id as `cm_${string}`, widthMm: 1800, heightMm: 1100, color: 'RAL 7016', materialId: bySku('P-1057').id,
      params: { barSizeMm: 0, gapMm: 0, frameMm: 0, slats: { glassToleranceMm: 2 } }, ...(stair ? { stair: { riseMm: -1020, steps: 6, group: 's' } } : {}) }],
    posts: [0, 1].map((i) => ({ id: `endpost${i}`, type: 'aluminium', widthMm: 40, heightMm: 1100, color: 'RAL 7016', mounting: 'concrete_base', custom: false })),
    settings: { totalMode: 'auto', fixedTotalMm: 1800, fillStrategy: 'proportional', defaultHeightMm: 1100, defaultColor: 'RAL 7016', showDimensions: true, showGrid: true, showLabels: false,
      pricing: { vatPercent: 20, pricesIncludeVat: false, profitMode: 'margin', profitPercent: 25, discountPercent: 0, laborPerM2Rsd: 0, laborPerGateRsd: 0, installPerMeterRsd: 0, installPerGateRsd: 0, coatingPerM2Rsd: 0, currency: 'RSD' } },
  };
  await seed(page, [model], [project]);
  await page.goto(`/editor/${project.id}`);
  await page.locator('[data-hit="item"]').first().click({ modifiers: ['Control'] });
  // Promena rasporeda aktivira isti proračun stubova koji se koristi pri crtanju.
  await page.getByTestId('post-spacing').fill('800'); await page.getByTestId('post-spacing').press('Enter');
  const front = page.getByTestId('front-view');
  const normalCount = await front.locator('[data-part-id^="glazing~pane~"]').count();
  for (const [side, width] of [['start', 80], ['end', 120]] as const) {
    await page.getByTestId(`stair-glass-${side}-on`).click();
    const input = page.getByTestId(`stair-glass-${side}-width`);
    await input.fill(String(width)); await input.press('Enter');
    await expect(front.locator(`[data-part-id^="glazing~clamp~end~${side}~"]`)).toHaveCount(2);
    const pane = front.locator(`[data-part-id^="glazing~pane~end~${side}~"] rect`);
    await expect(pane).toBeVisible();
    await expect.poll(async () => Number(await pane.getAttribute('width')) * factor).toBeCloseTo(width - 2, 2);
    await input.fill('9999'); await input.press('Enter');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(async () => Number(await pane.getAttribute('width')) * factor).toBeCloseTo(width - 2, 2);
    await input.press('Escape');
  }
  await expect(front.locator('[data-part-id^="glazing~pane~"]')).toHaveCount(normalCount + 2);
  const clampTilts = await front.evaluate((svg) => Array.from(svg.querySelectorAll<SVGRectElement>('[data-part-id^="glazing~clamp~"] rect')).map((rect) => rect.getCTM()!.b));
  expect(clampTilts.length).toBeGreaterThan(0);
  for (const tilt of clampTilts) expect(tilt).toBeCloseTo(0, 8);
  await front.screenshot({ path: `test-results/${stair ? 'stair' : 'flat'}-glass-ends-front.png` });
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas').locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__aluTest?.stats().triangles ?? 0)).toBeGreaterThan(0);
  await page.getByTestId('three-canvas').screenshot({ path: `test-results/${stair ? 'stair' : 'flat'}-glass-ends-three.png` });
  await page.reload();
  await page.locator('[data-hit="item"]').first().click({ modifiers: ['Control'] });
  await expect(page.getByTestId('stair-glass-start-width')).toHaveValue('80');
  await expect(page.getByTestId('stair-glass-end-width')).toHaveValue('120');
  await expect(front.locator('[data-part-id^="glazing~pane~end~"]')).toHaveCount(2);
  await page.getByTestId('stair-glass-start-on').click();
  await expect(front.locator('[data-part-id^="glazing~pane~end~start~"]')).toHaveCount(0);
  await expect(front.locator('[data-part-id^="glazing~clamp~end~start~"]')).toHaveCount(0);
  await expect(front.locator('[data-part-id^="glazing~pane~end~end~"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const p = await new Promise<Project>((resolve) => { const req = db.transaction('projects').objectStore('projects').get(id); req.onsuccess = () => resolve(req.result); });
    db.close(); return p.items[0].kind === 'fence' ? p.items[0].params.slats?.stairGlassStartMm : undefined;
  }, project.id)).toBe(0);
  await page.goto('/proizvodnja');
  await expect(page.getByTestId('glass-cut-piece')).toHaveCount(normalCount + 1);
  await expect(page.getByTestId('glass-cut-edges').last()).toContainText('AB 118 mm');
  expect(errors).toEqual([]);
});
