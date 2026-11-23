import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CustomModel } from '../src/domain/models/custom';
import type { Material } from '../src/domain/models/types';

const material = (id: string, name: string, terrace = false): Material => ({ id, sku: id, name, terrace, category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 0, demo: false });
const materials = [
  material('usage_used', 'Profil u terasnom modelu 20×20×2'),
  material('usage_extra', 'Profil dodatne sastavnice 30×30×2', true),
  material('usage_unused', 'Neiskorišćeni terasni profil 40×40×2', true),
  material('usage_yard', 'Neiskorišćeni dvorišni profil 50×50×2'),
];
const model: CustomModel = { id: 'cm_usage_e2e', name: 'Terasna ograda za proveru', kind: 'terrace', widthMm: 2000, heightMm: 1100, color: 'RAL 9006', updatedAt: new Date().toISOString(), parts: [{ id: 'p', materialId: materials[0].id, x: 100, y: 100, z: 0, rot: 0, angleDeg: 0, lengthMm: 1000 }] };

async function seed(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await page.evaluate(async ({ materials, model }) => {
    for (const key of ['modelMaterialsV1', 'pairHardwareV1', 'materialNamesV2', 'carriagesV1', 'railProfileV1', 'slopePlateV1', 'terraceMaterialsV2', 'squareGlassMaterialsV1', 'projectsWipedV1']) localStorage.setItem(`alutim.${key}`, '1');
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('alu-tim-012'); request.onsuccess = () => resolve(request.result); });
    const settings = await new Promise<Record<string, unknown>>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['materials', 'projects', 'kv'], 'readwrite');
      tx.objectStore('materials').clear();
      tx.objectStore('projects').clear();
      for (const m of materials) tx.objectStore('materials').put(m);
      tx.objectStore('kv').put({ ...settings, customModels: [model], hiddenModels: ['rail_black', 'rail_inox'], terraceModelIds: [], modelSpecs: { [`${model.id}#dodato`]: [{ id: 'extra', name: 'Dodatni profil', materialId: materials[1].id, enabled: true, qty: '1', lengthMm: '100', group: 'Dodatni materijal' }] } }, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { materials, model });
}

test('cenovnik razdvaja upotrebu, čuva zajedničke materijale i izvozi izabranu grupu', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);
  await page.goto('/materijali');
  const rows = page.getByTestId('material-row');
  await expect(page.getByTestId('materials-used')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await page.getByTestId('materials-use').selectOption('terrace');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: materials[0].name })).toHaveCount(1);
  await page.getByTestId('materials-unused').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(materials[2].name);
  await page.getByTestId('btn-export-materials').click();
  const downloaded = page.waitForEvent('download');
  await page.getByTestId('export-csv').click();
  const csv = await readFile((await (await downloaded).path())!, 'utf8');
  expect(csv).toContain(materials[2].name);
  expect(csv).not.toContain(materials[0].name);
  await page.getByTestId('materials-all').click();
  await expect(rows).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('materijali-po-upotrebi.png'), fullPage: true });
  await page.reload();
  await page.getByTestId('materials-all').click();
  await expect(rows).toHaveCount(4);
  await page.getByTestId('materials-use').selectOption('terrace');
  await page.getByTestId('materials-used').click();
  await page.getByTestId('btn-add-material').click();
  await page.getByTestId('material-name').fill('Novi materijal za terasu');
  await page.getByTestId('material-save').click();
  await expect(page.getByTestId('materials-unused')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Novi materijal za terasu' })).toHaveCount(1);
  await page.getByTestId('materials-used').click();
  await rows.filter({ hasText: materials[0].name }).getByTestId('material-copy').click();
  await page.getByTestId('material-save').click();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: `${materials[0].name} (kopija)` })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('crtanje terase prvo prikazuje korišćene materijale, ostale otvara odvojeno', async ({ page }, testInfo) => {
  await seed(page);
  await page.goto(`/modeli-terasa/crtanje/${model.id}`);
  await expect(page.getByTestId('designer-materials-used')).toHaveAttribute('aria-pressed', 'true');
  const palette = page.getByTestId('designer-palette');
  await expect(palette.getByTestId('designer-material')).toHaveCount(2);
  await expect(palette).toContainText(materials[0].name);
  await expect(palette).not.toContainText(materials[2].name);
  await page.getByTestId('designer-materials-other').click();
  await expect(palette.getByTestId('designer-material')).toHaveCount(1);
  await expect(palette).toContainText(materials[2].name);
  await palette.getByLabel('Pretraga materijala').fill('dvorišni');
  await expect(palette.getByTestId('designer-material')).toHaveCount(0);
  await page.getByTestId('designer-show-all-materials').click();
  await expect(palette.getByTestId('designer-material')).toHaveCount(1);
  await palette.getByLabel('Pretraga materijala').fill('');
  await page.getByTestId('designer-materials-used').click();
  await expect(palette.getByTestId('designer-material')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('terasa-korisceni-materijali.png'), fullPage: true });
});
