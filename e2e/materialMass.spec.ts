import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEFAULT_PLATES, DEFAULT_RAILS } from '../src/data/modelMaterials';
import { cleanMaterialName } from '../src/domain/models/materialTitle';
import type { Material } from '../src/domain/models/types';

test('masa u katalogu: cev, specijalni profil, okov, lim i trajno čuvanje ručnog unosa', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Nezavisan probni katalog: ovaj dobavljačev CSV nema navodnike ni razdvajače unutar ćelije.
  const catalog: Material[] = readFileSync('ekoluka-cenovnik-2026.csv', 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
    const [sku, name, category, unit, price, waste] = line.split(';');
    return { id: `mat_imp_${sku.toLowerCase()}`, sku, name: cleanMaterialName(name), category: category === 'Profili' ? 'profil' : 'okov', unit: unit as Material['unit'], unitPrice: Number(price.replace(',', '.')), wastePercent: Number(waste), demo: false };
  });
  const pipe: Material = { id: 'test-pipe-20', sku: 'TEST-20', name: 'Kvadratna cev 20×20×2', category: 'profil', unit: 'm', unitPrice: 123.45, wastePercent: 3, demo: false };
  const piece: Material = { ...pipe, id: 'test-finished', sku: 'TEST-KOM', name: 'Aluminijumski stub gotov 1800 mm', category: 'stub', unit: 'kom' };
  const glass: Material = { ...pipe, id: 'test-glass', sku: 'TEST-STAKLO', name: 'Kaljeno staklo 8 mm', category: 'staklo', unit: 'm2' };
  const lock: Material = { ...pipe, id: 'test-lock', sku: 'TEST-BRAVA', name: 'Brava test', category: 'okov', unit: 'kom' };
  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await page.evaluate(async (mats) => {
    for (const key of ['modelMaterialsV1', 'pairHardwareV1', 'materialNamesV2', 'carriagesV1', 'railProfileV1', 'slopePlateV1', 'terraceMaterialsV2', 'projectsWipedV1']) localStorage.setItem(`alutim.${key}`, '1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('materials', 'readwrite');
      for (const m of mats) tx.objectStore('materials').put(m);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, [...catalog, ...DEFAULT_RAILS, ...DEFAULT_PLATES, pipe, piece, glass, lock]);
  await page.goto('/materijali');
  await expect(page.getByRole('columnheader', { name: 'Masa', exact: true })).toBeVisible();
  await expect(page.getByTestId('materials-table')).not.toContainText('Potreban podatak');
  await expect(page.getByTestId('material-mass-legend')).toContainText('≈');
  const search = page.getByRole('textbox', { name: 'Pretraga materijala' });
  const row = (name: string) => page.getByTestId('material-row').filter({ has: page.getByText(name, { exact: false }) }).first();
  const savedMaterial = (id: string) => page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const m = await new Promise<Material | undefined>((resolve) => { const req = db.transaction('materials').objectStore('materials').get(key); req.onsuccess = () => resolve(req.result); });
    db.close(); return m;
  }, id);
  await search.fill(pipe.name);
  await expect(row(pipe.name).getByTestId('material-mass')).toHaveText('0,389 kg/m');
  await page.screenshot({ path: testInfo.outputPath('masa-cev.png'), fullPage: true });

  await search.fill('Rukohvat profilisan');
  const special = row(DEFAULT_RAILS[0].name);
  await expect(special.getByTestId('material-mass')).toHaveText('≈ 2,851 kg/m');
  await page.reload();
  await search.fill('Rukohvat profilisan');
  await expect(special.getByTestId('material-mass')).toHaveText('≈ 2,851 kg/m');
  await page.screenshot({ path: testInfo.outputPath('masa-specijalni-profil.png'), fullPage: true });
  await special.getByTestId('material-edit').click();
  await expect(page.getByTestId('material-mass-assumptions')).toContainText('usvojen šuplji presek');
  await page.getByTestId('material-kgm').fill('1,23456789');
  // Klik na Sačuvaj potvrđuje i trenutno fokusiran unos.
  await page.getByTestId('material-save').click();
  await expect(special.getByTestId('material-mass')).toHaveText('1,235 kg/m');
  await expect.poll(async () => (await savedMaterial(DEFAULT_RAILS[0].id))?.mass).toBe(1.23456789);
  await page.reload();
  await search.fill('Rukohvat profilisan');
  await expect(special.getByTestId('material-mass')).toHaveText('1,235 kg/m');
  await special.getByTestId('material-edit').click();
  await expect(page.getByTestId('material-kgm')).toHaveValue('1,235');
  await page.getByRole('button', { name: 'Otkaži', exact: true }).click();

  await search.fill(glass.name);
  await expect(page.getByTestId('material-mass')).toHaveText('—');

  await search.fill('Čep tarabice pun');
  await expect(page.getByTestId('material-mass').first()).toHaveText(/≈ .* kg\/kom/);
  await expect(page.getByTestId('material-row').first()).toContainText('Kape i završeci');

  await page.getByRole('combobox', { name: 'Kategorija', exact: true }).selectOption('montaza');
  await search.fill('stopa');
  await expect(page.getByTestId('material-row').first()).toContainText('Stope i spojni elementi');
  await expect(page.getByTestId('material-mass').first()).toHaveText(/≈ .* kg\/kom/);
  await page.getByRole('combobox', { name: 'Kategorija', exact: true }).selectOption('zavrsetak');
  await search.fill('Rozetna 80×80');
  await expect(page.getByTestId('material-mass').first()).toHaveText(/≈ .* kg\/kom/);
  await page.screenshot({ path: testInfo.outputPath('masa-rozetna.png'), fullPage: true });
  await search.fill('Kapa pismo 80×80');
  await expect(page.getByTestId('material-mass').first()).toHaveText(/≈ .* kg\/kom/);
  await page.screenshot({ path: testInfo.outputPath('masa-kapa-pismo.png'), fullPage: true });
  await search.fill('Kapa pismo 60');
  await page.getByTestId('material-edit').first().click();
  await expect(page.getByRole('combobox', { name: 'Jedinica mase' })).toHaveValue('kg/kom');
  await expect(page.getByTestId('material-mass-assumptions')).toContainText('Šuplja kapa pismo');
  await page.getByTestId('material-kgm').fill('0,123456789');
  await page.getByTestId('material-save').click();
  await expect.poll(async () => (await savedMaterial('mat_imp_k100009'))?.mass).toBe(0.123456789);
  await page.reload();
  await search.fill('Kapa pismo 60');
  await expect(page.getByTestId('material-mass').first()).toHaveText('0,123 kg/kom');
  await expect(page.getByTestId('material-row').first()).toContainText('Kape i završeci');

  await search.fill(lock.name);
  await expect(page.getByTestId('material-mass').first()).toHaveText('—');
  await page.screenshot({ path: testInfo.outputPath('masa-okov.png'), fullPage: true });
  await page.getByTestId('material-edit').first().click();
  await expect(page.getByTestId('material-mass-excluded')).toBeVisible();
  await expect(page.getByTestId('material-kgm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Otkaži', exact: true }).click();

  await search.fill('Aluminijumski lim');
  await expect(page.getByTestId('material-mass')).toHaveText('5,4 kg/m²');
  await search.fill(piece.name);
  await page.getByTestId('material-edit').click();
  await expect(page.getByRole('combobox', { name: 'Jedinica mase' })).toHaveValue('kg/kom');
  await page.getByTestId('material-kgm').fill('2,345678');
  await page.getByTestId('material-save').click();
  await expect(page.getByTestId('material-mass')).toHaveText('2,346 kg/kom');

  await search.fill(pipe.name);
  const price = row(pipe.name).getByRole('spinbutton', { name: `Cena: ${pipe.name}` });
  await price.fill('456.78');
  await price.press('Tab');
  await expect.poll(async () => (await savedMaterial(pipe.id))?.unitPrice).toBe(456.78);
  await page.reload();
  await search.fill(pipe.name);
  await expect(price).toHaveValue('456.78');
  await expect(row(pipe.name).getByTestId('material-mass')).toHaveText('0,389 kg/m');

  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('alu-tim-012'); req.onsuccess = () => resolve(req.result); });
    const rows = await new Promise<Material[]>((resolve) => { const req = db.transaction('materials').objectStore('materials').getAll(); req.onsuccess = () => resolve(req.result); });
    db.close(); return rows;
  });
  expect(stored.find((m) => m.id === DEFAULT_RAILS[0].id)).toMatchObject({ mass: 1.23456789, massUnit: 'kg/m', massSource: 'manual' });
  expect(stored.find((m) => m.id === pipe.id)).toMatchObject({ massUnit: 'kg/m', unitPrice: 456.78 });
  expect(stored.find((m) => m.id === pipe.id)?.mass).toBeCloseTo(0.3888, 12);
  expect(stored.find((m) => m.id === piece.id)).toMatchObject({ mass: 2.345678, massUnit: 'kg/kom' });
  expect(stored.find((m) => m.id === 'mat_imp_k100009')).toMatchObject({ category: 'zavrsetak', mass: 0.123456789, massUnit: 'kg/kom', unitPrice: catalog.find((m) => m.sku === 'K100009')!.unitPrice });
  expect(errors).toEqual([]);
});
