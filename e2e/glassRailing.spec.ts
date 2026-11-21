import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { TERRACE_MATERIALS } from '../src/data/terraceMaterials';
import type { CustomModel } from '../src/domain/models/custom';

test('desni panel: dodaj držače, popuni staklom, promeni mere i ponovo otvori model', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const material = (sku: string) => TERRACE_MATERIALS.find((m) => m.sku === sku)!;
  const model: CustomModel = { id: 'cm_glass_railing_controls', name: 'Automatska staklena ograda', kind: 'terrace', widthMm: 2200, heightMm: 1100,
    color: 'RAL 7016', updatedAt: new Date().toISOString(), parts: [
      ...[100, 1100, 2100].map((x, i) => ({ id: `post${i}`, materialId: material('P-1057').id, x, y: 8, lengthMm: 1000, angleDeg: 90, rot: 0, z: 0 })),
      { id: 'rail', materialId: material('P-1072').id, x: 0, y: 1040, lengthMm: 2200, angleDeg: 0, rot: 90, z: 0 },
    ] };
  await page.goto('/');
  await expect(page.getByTestId('hero-new').first()).toBeVisible();
  await page.evaluate(async ({ model, glasses }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const settings = await new Promise<Record<string, unknown>>((resolve) => {
      const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'materials'], 'readwrite');
      tx.objectStore('kv').put({ ...settings, customModels: [model] }, 'settings');
      glasses.forEach((m) => tx.objectStore('materials').put(m));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('alutim.terraceMaterialsV2', '1');
    db.close();
  }, { model, glasses: [material('TER-VSG-66'), material('TER-VSG-88')] });
  await page.goto(`/modeli-terasa/crtanje/${model.id}`);
  await expect(page.getByTestId('glass-railing-panel')).toBeVisible();
  await expect(page.getByTestId('glass-clamp-material')).toHaveValue(material('AK-5205').id);
  const canvas = page.getByTestId('designer-2d');
  const holders = canvas.locator('[data-part-id^="glazing~clamp~"]');
  const panes = canvas.locator('[data-part-id^="glazing~pane~"]');
  await page.getByTestId('glass-add-clamps').click();
  await expect(holders).toHaveCount(8);
  await expect(panes).toHaveCount(0);
  await page.getByTestId('glass-add-clamps').click();
  await expect(holders).toHaveCount(8);
  await page.getByTestId('glass-pane-material').selectOption(material('TER-VSG-88').id);
  await page.getByTestId('glass-railing-fill').check();
  await expect(panes).toHaveCount(2);
  await page.getByTestId('glass-bottom-gap').fill('150');
  await page.getByTestId('glass-bottom-gap').press('Enter');
  await expect(page.getByTestId('glass-bottom-gap')).toHaveValue('150');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('glass-bottom-gap')).toHaveValue('100');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('glass-bottom-gap')).toHaveValue('150');
  await page.screenshot({ path: 'test-results/glass-railing-controls-2d.png' });
  // Sačekaj upis konfiguracije i geometrije u stvarnu lokalnu bazu aplikacije.
  await expect.poll(async () => page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const settings = await new Promise<{ customModels?: CustomModel[] }>((resolve) => {
      const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result);
    }); db.close();
    return settings.customModels?.find((m) => m.id === id)?.glassRailing?.bottomMm;
  }, model.id)).toBe(150);
  await page.reload();
  await expect(page.getByTestId('glass-railing-fill')).toBeChecked();
  await expect(panes).toHaveCount(2);
  await expect(holders).toHaveCount(8);
  await expect(page.getByTestId('glass-pane-material')).toHaveValue(material('TER-VSG-88').id);
  await page.getByTestId('designer-view-3d').click();
  await expect.poll(async () => {
    const stats = await sharp(await page.locator('canvas').screenshot()).stats();
    return Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
  }).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/glass-railing-controls-3d.png' });
  await page.getByTestId('glass-railing-fill').uncheck();
  await page.getByTestId('designer-view-2d').click();
  await expect(panes).toHaveCount(0);
  await expect(holders).toHaveCount(8);
  await page.getByTestId('glass-railing-remove').click();
  await expect(holders).toHaveCount(0);
  expect(errors).toEqual([]);
});
