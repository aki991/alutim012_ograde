import { expect, test, type Page } from '@playwright/test';
import { TERRACE_MATERIALS } from '../src/data/terraceMaterials';
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
  }, { models, projects, materials: TERRACE_MATERIALS });
}

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
  await page.getByTestId('glass-cut-list').screenshot({ path: 'test-results/glass-cut-list.png' });
  await page.getByTestId('cutlist-pdf').click();
  await expect(page.getByTestId('pdf-save')).toBeEnabled({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByTestId('pdf-save').click();
  await (await download).saveAs('test-results/terrace-glass-cutlist.pdf');
  expect(errors).toEqual([]);
});
