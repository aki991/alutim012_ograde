import { expect, test, type Page } from '@playwright/test';
import { MODEL_MATERIALS } from '../src/data/modelMaterials';
import type { CustomModel, CustomPart } from '../src/domain/models/custom';

const modelId = 'cm_e2e_picket_depth';
const part = (id: string, materialId: string, x: number, y: number, lengthMm: number, angleDeg: number): CustomPart => ({ id, materialId, x, y, lengthMm, angleDeg, rot: 0, z: 0 });
async function seed(page: Page, caps = false) {
  const model: CustomModel = { id: modelId, name: 'Vertikalne tarabice 80×20', kind: 'fence', widthMm: 500, heightMm: caps ? 710 : 670, color: 'RAL 9016', updatedAt: new Date().toISOString(),
    parts: [...Array.from({ length: 5 }, (_, i) => part(`p${i}`, 'mat_ek_kv000007', 50 + i * 100, 0, 670, 90)),
      ...[100, 570].map((y, i) => part(`rail${i}`, 'mat_kv_30x20', 0, y, 500, 0)),
      ...(caps ? Array.from({ length: 5 }, (_, i) => part(`cap${i}`, 'mat_ek_k100018', 50 + i * 100, 670, 0, 0)) : [])],
  };
  await page.goto('/');
  await expect(page.getByTestId('hero-new').first()).toBeVisible();
  await page.evaluate(async ({ model, materials }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const settings = await new Promise<Record<string, unknown>>((resolve) => { const req = db.transaction('kv').objectStore('kv').get('settings'); req.onsuccess = () => resolve(req.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'materials'], 'readwrite');
      tx.objectStore('kv').put({ ...settings, customModels: [model], terraceModelIds: [model.id] }, 'settings');
      materials.forEach((m) => tx.objectStore('materials').put(m));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { model, materials: MODEL_MATERIALS });
  await page.goto(`/modeli/crtanje/${modelId}`);
  await expect(page.getByTestId('designer-supports-behind')).toBeVisible();
}
async function saved(page: Page): Promise<CustomPart[]> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const settings = await new Promise<{ customModels: CustomModel[] }>((resolve) => { const req = db.transaction('kv').objectStore('kv').get('settings'); req.onsuccess = () => resolve(req.result); });
    db.close(); return settings.customModels.find((m) => m.id === id)!.parts;
  }, modelId);
}
const railDepths = async (page: Page) => (await saved(page)).filter((p) => p.id.startsWith('rail')).map((p) => p.z);

test('strelice u izboru preseka menjaju opciju bez pomeranja izabranog dela', async ({ page }) => {
  await seed(page);
  await page.locator('[data-part-id="p2"]').click();
  const x = await page.getByTestId('part-x').inputValue(); const y = await page.getByTestId('part-y').inputValue();
  await page.getByTestId('part-face-0').focus(); await page.getByTestId('part-face-0').press('ArrowRight');
  await expect(page.getByTestId('part-face-90')).toBeChecked();
  await expect(page.getByTestId('part-x')).toHaveValue(x); await expect(page.getByTestId('part-y')).toHaveValue(y);
  await expect.poll(async () => (await saved(page)).find((p) => p.id === 'p2')?.rot).toBe(90);
});

test('postojeće prečke se postavljaju iza tarabica u 3D; izbor sloja, poništi i ponovno otvaranje čuvaju dubinu', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  // Bez selekcije lista i dalje određuje sloj sledećeg novog dela.
  await page.getByTestId('designer-layer').selectOption('front');
  expect(await railDepths(page)).toEqual([0, 0]);
  await page.getByTestId('designer-view-3d').click();
  const canvas = page.getByTestId('designer-3d').locator('canvas');
  await expect(canvas).toBeVisible();
  const sharp = (await import('sharp')).default;
  await expect.poll(async () => Math.max(...(await sharp(await canvas.screenshot()).stats()).channels.slice(0, 3).map((c) => c.stdev)), { timeout: 15000 }).toBeGreaterThan(5);
  await canvas.screenshot({ path: 'test-results/picket-depth-before-3d.png' });
  await page.getByTestId('designer-supports-behind').click();
  await expect(page.getByTestId('designer-multi')).toContainText('Izabrano delova: 2');
  await expect.poll(() => railDepths(page)).toEqual([-20, -20]);
  await expect(page.getByTestId('multi-z')).toHaveValue('-20');
  await canvas.screenshot({ path: 'test-results/picket-depth-after-3d.png' });
  await page.getByRole('button', { name: 'Poništi', exact: true }).click();
  await expect.poll(() => railDepths(page)).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Ponovi izmenu', exact: true }).click();
  await expect.poll(() => railDepths(page)).toEqual([-20, -20]);
  // Ista lista sada odmah pomera označene delove, i pri ponovljenom izboru istog smera.
  await page.getByTestId('designer-layer').selectOption('front');
  await expect.poll(() => railDepths(page)).toEqual([20, 20]);
  await page.getByTestId('multi-layer-behind').click();
  await expect.poll(() => railDepths(page)).toEqual([-20, -20]);
  await page.getByTestId('designer-layer').selectOption('front');
  await expect.poll(() => railDepths(page)).toEqual([20, 20]);
  await page.getByTestId('designer-layer').selectOption('behind');
  await expect.poll(() => railDepths(page)).toEqual([-20, -20]);
  expect((await saved(page)).filter((p) => p.id.startsWith('p')).every((p) => p.z === 0 && p.lengthMm === 670)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('designer-supports-behind')).toBeVisible();
  expect(await railDepths(page)).toEqual([-20, -20]);
  await page.getByTestId('designer-view-3d').click();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Math.max(...(await sharp(await canvas.screenshot()).stats()).channels.slice(0, 3).map((c) => c.stdev))).toBeGreaterThan(5);
  await canvas.screenshot({ path: 'test-results/picket-depth-saved-3d.png' });
  expect(errors).toEqual([]);
});

test('promena sloja izabrane tarabice pomera i njen čep', async ({ page }) => {
  await seed(page, true);
  await page.locator('[data-part-id="p2"]').click();
  await expect(page.getByTestId('part-z')).toHaveValue('0');
  await page.getByTestId('designer-layer').selectOption('front');
  await expect(page.getByTestId('part-z')).toHaveValue('20');
  await expect.poll(async () => (await saved(page)).filter((p) => p.id === 'p2' || p.id === 'cap2').map((p) => p.z)).toEqual([20, 20]);
  await page.getByTestId('part-layer-behind').click();
  await expect.poll(async () => (await saved(page)).filter((p) => p.id === 'p2' || p.id === 'cap2').map((p) => p.z)).toEqual([-20, -20]);
  expect((await saved(page)).filter((p) => p.id !== 'p2' && p.id !== 'cap2').every((p) => p.z === 0)).toBe(true);
});
