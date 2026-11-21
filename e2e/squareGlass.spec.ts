import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { TERRACE_MATERIALS } from '../src/data/terraceMaterials';
import type { CustomModel, CustomPart } from '../src/domain/models/custom';

test('kvadratna staklena ograda: dopuna starog cenovnika, okov, 2D i 3D', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bySku = (sku: string) => TERRACE_MATERIALS.find((m) => m.sku === sku)!;
  const part = (id: string, sku: string, x: number, y: number, lengthMm: number, angleDeg = 0, extra: Partial<CustomPart> = {}): CustomPart => ({
    id, materialId: bySku(sku).id, x, y, lengthMm, angleDeg, rot: 0, z: 0, ...extra,
  });
  const model: CustomModel = { id: 'cm_square_glass_test', name: 'Staklena ograda – kvadratni sistem', kind: 'terrace', widthMm: 1200, heightMm: 1100,
    color: 'RAL 7016', updatedAt: new Date().toISOString(), parts: [
      part('p1', 'P-1057', 100, 8, 1000, 90, { materialId: 'moj_kvadratni_stub' }),
      part('p2', 'P-1057', 1100, 8, 1000, 90, { materialId: 'moj_kvadratni_stub' }),
      part('rail', 'P-1072', 0, 1040, 1200, 0, { rot: 90 }),
      part('glass', 'TER-VSG-66', 140, 150, 920, 0, { heightMm: 750 }),
      ...[250, 800].flatMap((y, i) => [part(`clamp-l${i}`, 'AK-5205', 120, y, 0), part(`clamp-r${i}`, 'AK-5205', 1080, y, 0, 180)]),
    ] };
  await page.goto('/');
  await expect(page.getByTestId('hero-new').first()).toBeVisible();
  await page.evaluate(async ({ model, glass, post, connectorId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const settings = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').get('settings'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['materials', 'kv'], 'readwrite');
      tx.objectStore('materials').put(glass);
      tx.objectStore('materials').delete(post.id);
      tx.objectStore('materials').delete(connectorId);
      tx.objectStore('materials').put({ ...post, id: 'moj_kvadratni_stub', terrace: false, unitPrice: 1888 });
      tx.objectStore('kv').put({ ...settings, customModels: [model] }, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('alutim.terraceMaterialsV2', '1');
    localStorage.removeItem('alutim.squareGlassMaterialsV1');
    db.close();
  }, { model, glass: { ...bySku('TER-VSG-66'), unitPrice: 13500 }, post: bySku('P-1057'), connectorId: bySku('AK-5126').id });
  await page.goto(`/modeli-terasa/crtanje/${model.id}`);
  await expect(page.getByTestId('designer-fill-hw')).toBeVisible();
  await page.getByTestId('designer-fill-hw').click();
  const canvas = page.getByTestId('designer-2d');
  await expect(canvas.locator('[data-part-id^="hw~connector~"]')).toHaveCount(2);
  await expect(canvas.locator('[data-part-id^="hw~flange~"]')).toHaveCount(2);
  await expect(canvas.locator('[data-part-id^="clamp-"]')).toHaveCount(4);
  await expect(canvas.locator('[data-part-id="glass"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/square-glass-2d.png' });
  await page.getByTestId('designer-view-3d').click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => {
    const stats = await sharp(await page.locator('canvas').screenshot()).stats();
    return Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
  }, { timeout: 15000 }).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/square-glass-3d.png' });
  const state = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const list = await new Promise<Array<{ id: string; sku: string; terrace?: boolean; unitPrice: number; category: string }>>((resolve) => {
      const req = db.transaction('materials').objectStore('materials').getAll(); req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return { post: list.find((m) => m.id === 'moj_kvadratni_stub'), connectors: list.filter((m) => m.sku === 'AK-5126').length,
      panes: list.filter((m) => m.category === 'staklo').length, ready: localStorage.getItem('alutim.squareGlassMaterialsV1') };
  });
  expect(state.post).toMatchObject({ terrace: true, unitPrice: 1888 });
  expect(state.connectors).toBe(1);
  expect(state.panes).toBe(1);
  expect(state.ready).toBe('1');
  expect(errors).toEqual([]);
});
