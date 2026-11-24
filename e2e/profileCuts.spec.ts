import { expect, test, type Page } from '@playwright/test';
import type { CustomModel } from '../src/domain/models/custom';
import type { Material } from '../src/domain/models/types';

const tube: Material = { id: 'mat_cut_test', sku: 'TEST40', name: 'Kvadratna cev 40x40x2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 0, demo: false };

async function seed(page: Page, kind: 'fence' | 'gate') {
  await page.goto('/');
  await page.getByTestId('hero').waitFor();
  const model: CustomModel = {
    id: `cm_cut_${kind}`, name: 'Ugaoni spoj', kind, widthMm: 1000, heightMm: 1000, color: 'RAL 7016', updatedAt: '',
    parts: [
      { id: 'cut-v', materialId: tube.id, x: 20, y: 0, z: 0, rot: 0, angleDeg: 90, lengthMm: 1000 },
      { id: 'cut-h', materialId: tube.id, x: 0, y: 980, z: 0, rot: 0, angleDeg: 0, lengthMm: 1000 },
    ],
  };
  await page.evaluate(async ({ model, tube }) => {
    localStorage.setItem('alutim.modelMaterialsV1', '1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const get = (key: string) => new Promise<any>((resolve, reject) => { const req = db.transaction('kv').objectStore('kv').get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    for (let i = 0; i < 100 && !(await get('seeded')); i++) await new Promise((r) => setTimeout(r, 50));
    const settings = await get('settings');
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['kv', 'materials'], 'readwrite');
      tx.objectStore('materials').put(tube);
      tx.objectStore('kv').put({ ...settings, customModels: [model] }, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { model, tube });
  await page.goto(`/modeli/crtanje/${model.id}`);
  await page.getByTestId('designer-part').first().waitFor();
}

async function dragEnd(page: Page, end: 'start' | 'end', dxMm: number, dyMm: number, options: { shift?: boolean; cancel?: boolean } = {}) {
  const grip = page.getByTestId(`designer-resize-${end}`);
  const box = (await grip.boundingBox())!;
  const scale = await page.getByTestId('designer-2d').locator(':scope > svg').evaluate((el) => el.getBoundingClientRect().width / (el as SVGSVGElement).viewBox.baseVal.width);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (options.shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dxMm * scale, box.y + box.height / 2 - dyMm * scale, { steps: 8 });
  if (options.cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  if (options.shift) await page.keyboard.up('Shift');
}

for (const kind of ['fence', 'gate'] as const) {
  test(`${kind}: dužina se menja povlačenjem obe ivice, Shift menja nagib, Esc otkazuje`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seed(page, kind);
    await page.locator('[data-part-id="cut-h"]').click();
    await expect(page.getByTestId('designer-resize-handles').locator('circle')).toHaveCount(2);
    await dragEnd(page, 'end', 200, 0);
    await expect(page.getByTestId('part-length')).toHaveValue('1200');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('part-length')).toHaveValue('1000');
    await page.keyboard.press('Control+y');
    await expect(page.getByTestId('part-length')).toHaveValue('1200');
    await dragEnd(page, 'start', 100, 0);
    await expect(page.getByTestId('part-length')).toHaveValue('1100');
    await expect(page.getByTestId('part-x')).toHaveValue('100');
    await dragEnd(page, 'end', 150, 0, { cancel: true });
    await expect(page.getByTestId('part-length')).toHaveValue('1100');
    await dragEnd(page, 'end', 0, 300, { shift: true });
    await expect(page.getByTestId('part-angle')).toHaveValue('15,26');
    await expect(page.getByTestId('part-length')).toHaveValue('1140,18');
    await expect(page.getByTestId('designer-resize-hint')).toContainText('Povucite kružić');
    await page.screenshot({ path: testInfo.outputPath('kosi-profil-sa-rucicama.png') });
    expect(errors).toEqual([]);
  });

  test(`${kind}: profil se odmah crta ukoso, a režim za prav ugao je vidljiv`, async ({ page }) => {
    await seed(page, kind);
    await expect(page.getByTestId('designer-angle-free')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('designer-angle-ortho')).toBeVisible();
    await page.getByLabel('Pretraga materijala').fill('TEST40');
    await page.getByTestId('designer-material').click();
    const canvas = (await page.getByTestId('designer-2d').boundingBox())!;
    const a = { x: canvas.x + canvas.width * 0.4, y: canvas.y + canvas.height * 0.65 };
    const b = { x: canvas.x + canvas.width * 0.65, y: canvas.y + canvas.height * 0.4 };
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await expect(page.getByTestId('designer-ghost-label')).toContainText('°');
    await page.mouse.up();
    await expect(page.getByTestId('designer-part')).toHaveCount(3);
    const angle = Number((await page.getByTestId('part-angle').inputValue()).replace(',', '.'));
    expect(angle).toBeGreaterThan(10); expect(angle).toBeLessThan(80);
    await page.getByTestId('designer-angle-ortho').click();
    await expect(page.getByTestId('designer-angle-ortho')).toHaveAttribute('aria-checked', 'true');
  });

  test(`${kind}: prilagođavanje spoja, pojedinačni rezovi, poništavanje i čuvanje`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seed(page, kind);
    await page.getByText('Alati', { exact: true }).click();
    await page.locator('[data-part-id="cut-v"]').click();
    await expect(page.getByTestId('part-cut-start')).toHaveValue('90');
    await expect(page.getByTestId('part-cut-end')).toHaveValue('90');
    await expect(page.getByTestId('profile-cut-panel')).toContainText('Gornji kraj');
    await page.getByTestId('part-cut-fit').click();
    await expect(page.getByTestId('part-cut-end')).toHaveValue('45');
    await page.getByRole('button', { name: 'Poništi', exact: true }).click();
    await expect(page.getByTestId('part-cut-end')).toHaveValue('90');
    await page.getByRole('button', { name: 'Ponovi izmenu', exact: true }).click();
    await expect(page.getByTestId('part-cut-end')).toHaveValue('45');
    await page.screenshot({ path: testInfo.outputPath('spoj-i-uglovi.png') });

    await page.locator('[data-part-id="cut-h"]').click();
    await expect(page.getByTestId('part-cut-start')).toHaveValue('45');
    await expect(page.getByTestId('part-cut-end')).toHaveValue('90');
    await page.getByTestId('designer-free').click();
    await page.getByTestId('part-cut-start').fill('32,5');
    await page.getByTestId('part-cut-start').press('Enter');
    await expect(page.getByTestId('part-cut-start')).toHaveValue('32,5');
    await page.getByTestId('part-cut-flip-0').click();
    await expect(page.getByTestId('part-cut-start')).toHaveValue('32,5');
    await page.getByTestId('designer-view-skica').click();
    await expect(page.getByText('rezovi 32,5° / 90°', { exact: true })).toBeVisible();
    await page.getByTestId('designer-view-3d').click();
    await expect(page.getByTestId('designer-3d').locator('canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
      const settings = await new Promise<any>((resolve) => { const req = db.transaction('kv').objectStore('kv').get('settings'); req.onsuccess = () => resolve(req.result); });
      db.close();
      return settings?.customModels?.find((m: CustomModel) => m.id === id)?.parts.find((p: CustomModel['parts'][number]) => p.id === 'cut-h')?.endCuts;
    }, `cm_cut_${kind}`)).toEqual([32.5, 90]);
    await page.reload();
    await page.locator('[data-part-id="cut-h"]').click();
    await expect(page.getByTestId('part-cut-start')).toHaveValue('32,5');
    await expect(page.getByTestId('part-cut-end')).toHaveValue('90');
    expect(errors).toEqual([]);
  });
}
