import { expect, test } from '@playwright/test';
import type { Material } from '../src/domain/models/types';

test('smislene jedinice, preračun cene i trajno čuvanje posle osvežavanja', async ({ page }, testInfo) => {
  const base: Material = { id: 'units-pipe', sku: 'PIPE20', name: 'Cev 20×20×2', category: 'profil', unit: 'm', unitPrice: 100, wastePercent: 3, demo: false };
  const materials: Material[] = [
    base,
    { ...base, id: 'units-bar', sku: 'BAR65', name: 'Cev 20×20×2, šipka 6,5 m' },
    { ...base, id: 'units-sheet', sku: 'SHEET2', name: 'Aluminijumski lim 2 mm', category: 'panel', unit: 'm2', unitPrice: 540 },
    { ...base, id: 'units-plate', sku: 'PLATE2', name: 'Aluminijumska ploča 2000×1000×2', category: 'panel', unit: 'm2', unitPrice: 540 },
    { ...base, id: 'units-cap', sku: 'CAP80', name: 'Kapa ravna 80×80', category: 'zavrsetak', unit: 'kom', unitPrice: 50, mass: 0.1, massUnit: 'kg/kom', massSource: 'manual' },
    { ...base, id: 'units-estimate', sku: 'CAP60', name: 'Kapa pismo 60×60', category: 'zavrsetak', unit: 'kom', unitPrice: 50 },
    { ...base, id: 'units-set', sku: 'CAP-SET', name: 'Završeci, levi i desni', category: 'zavrsetak', unit: 'set', mass: 0.2, massUnit: 'kg/kom', massSource: 'manual' },
    { ...base, id: 'units-lock', sku: 'LOCK', name: 'Brava standardna', category: 'okov', unit: 'kom', unitPrice: 900 },
    { ...base, id: 'units-glass', sku: 'GLASS', name: 'Staklo kaljeno 8 mm', category: 'staklo', unit: 'm2', unitPrice: 2000 },
    { ...base, id: 'units-wrong', sku: 'WRONG', name: 'Rozetna 80×80', category: 'zavrsetak', unit: 'm', unitPrice: 50 },
  ];
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); await expect(page.getByTestId('hero')).toBeVisible();
  await page.evaluate(async (mats) => {
    for (const key of ['modelMaterialsV1', 'pairHardwareV1', 'materialNamesV2', 'carriagesV1', 'railProfileV1', 'slopePlateV1', 'terraceMaterialsV2', 'projectsWipedV1']) localStorage.setItem(`alutim.${key}`, '1');
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('materials', 'readwrite'); for (const m of mats) tx.objectStore('materials').put(m); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  }, materials);
  await page.goto('/materijali');
  const find = async (name: string) => { await page.getByRole('textbox', { name: 'Pretraga materijala' }).fill(name); return page.getByTestId('material-row').filter({ has: page.getByText(name, { exact: false }) }).first(); };
  const saved = (id: string) => page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const value = await new Promise<Material>((resolve) => { const r = db.transaction('materials').objectStore('materials').get(key); r.onsuccess = () => resolve(r.result); }); db.close(); return value;
  }, id);
  const unit = (row: ReturnType<typeof page.getByTestId>) => row.getByRole('combobox');
  const price = (row: ReturnType<typeof page.getByTestId>) => row.getByRole('spinbutton', { name: /^Cena:/ });
  const choices = async (row: ReturnType<typeof page.getByTestId>) => unit(row).locator('option').evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));

  let row = await find(base.name);
  expect(await choices(row)).toEqual(['m', 'kg']);
  await unit(row).selectOption('kg');
  await expect(price(row)).toHaveValue('257.2');
  await price(row).fill('300'); await price(row).press('Tab');
  await expect.poll(async () => (await saved(base.id)).unitPrice).toBeCloseTo(116.64, 10);
  await expect.poll(async () => (await saved(base.id)).priceUnit).toBe('kg');
  await page.reload(); row = await find(base.name);
  await expect(unit(row)).toHaveValue('kg'); await expect(price(row)).toHaveValue('300');
  await unit(row).selectOption('m'); await expect(price(row)).toHaveValue('116.64');
  await row.getByTestId('material-edit').click();
  await page.getByRole('combobox', { name: 'Jedinica mere', exact: true }).selectOption('kg');
  await page.getByRole('textbox', { name: 'Cena po kg', exact: true }).fill('350');
  await page.getByRole('textbox', { name: 'Cena po kg', exact: true }).press('Tab');
  await page.getByTestId('material-save').click();
  await expect(price(row)).toHaveValue('350');
  await expect.poll(async () => (await saved(base.id)).unitPrice).toBeCloseTo(136.08, 10);
  await page.screenshot({ path: testInfo.outputPath('cena-po-kg.png'), fullPage: true });

  row = await find('Aluminijumski lim 2 mm'); await unit(row).selectOption('kg'); await expect(price(row)).toHaveValue('100');
  row = await find('Aluminijumska ploča 2000×1000×2'); await unit(row).selectOption('kom'); await expect(price(row)).toHaveValue('1080');
  row = await find('Cev 20×20×2, šipka 6,5 m'); await unit(row).selectOption('kom'); await expect(price(row)).toHaveValue('650');
  row = await find('Kapa ravna 80×80'); expect(await choices(row)).toEqual(['kom', 'kg']); await unit(row).selectOption('kg'); await expect(price(row)).toHaveValue('500');
  row = await find('Kapa pismo 60×60'); await unit(row).selectOption('kg'); await expect(row.getByTestId('price-estimated')).toBeVisible();
  row = await find('Završeci, levi i desni'); expect(await choices(row)).toEqual(['set', 'kom', 'kg']); await unit(row).selectOption('kom'); await expect(price(row)).toHaveValue('50'); await unit(row).selectOption('kg'); await expect(price(row)).toHaveValue('500');
  row = await find('Brava standardna'); expect(await choices(row)).toEqual(['kom']);
  row = await find('Staklo kaljeno 8 mm'); expect(await choices(row)).toEqual(['m2']);
  row = await find('Rozetna 80×80'); await expect(unit(row)).toHaveValue('kom'); await expect(row).toContainText('Proveri osnovicu cene');
  expect((await saved('units-wrong')).unit).toBe('kom');
  expect(errors).toEqual([]);
});
