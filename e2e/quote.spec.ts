import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { FINISHING_MATERIALS, FINISHING_SPECS, finishingProject } from '../src/tests/fixtures/finishing';
import type { AppSettings, Material, PostType } from '../src/domain/models/types';
test.use({ actionTimeout: 10_000 });

test('ponuda za kupca i proizvodni PDF-ovi izostavljaju simulacione betonske stubove', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const p = finishingProject(); p.name = 'Ponuda i simulacioni stubovi';
  p.posts = p.posts.map((post, i) => i < 2 ? { ...post, type: (i === 0 ? 'concrete' : 'concrete_plinth') as PostType, materialId: 'sim-concrete', plinthMm: 0, capTopMaterialId: 'finish-cap' } : post);
  Object.assign(p.settings.pricing, { coatingPerM2Rsd: 1000, laborPerM2Rsd: 2800, laborPerGateRsd: 9000, installPerMeterRsd: 4500, installPerGateRsd: 12000, profitPercent: 31.5, discountPercent: 7.5 });
  const concrete: Material = { ...FINISHING_MATERIALS[0], id: 'sim-concrete', sku: 'BETON', name: 'Betonski stub 400×400', category: 'stub', unit: 'kom', unitPrice: 50000 };
  await page.goto('/'); await expect(page.getByTestId('hero')).toBeVisible();
  await page.evaluate(async ({ project, materials, specs }) => {
    for (const key of ['modelMaterialsV1', 'pairHardwareV1', 'materialNamesV2', 'carriagesV1', 'railProfileV1', 'slopePlateV1', 'terraceMaterialsV2', 'projectsWipedV1']) localStorage.setItem(`alutim.${key}`, '1');
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const settings = await new Promise<AppSettings>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'materials', 'kv'], 'readwrite');
      tx.objectStore('projects').clear(); tx.objectStore('projects').put(project);
      tx.objectStore('materials').clear(); for (const m of materials) tx.objectStore('materials').put(m);
      tx.objectStore('kv').put({ ...settings, currency: 'RSD', modelSpecs: specs }, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  }, { project: p, materials: [...FINISHING_MATERIALS, concrete], specs: FINISHING_SPECS });

  await page.goto('/editor/proj_finishing');
  // Beton ostaje nacrtan u simulaciji.
  expect(await page.getByTestId('front-view').innerHTML()).toContain('#c9ccd0');
  await page.getByTestId('btn-open-calc').click();
  const totalRsd = await page.getByTestId('calc-total').innerText();
  await expect(page.getByTestId('calc-bom')).not.toContainText('Betonski');
  await page.getByTestId('calc-close').click();
  const download = async (button: string, filename: string) => {
    await page.getByTestId(button).click(); await expect(page.getByTestId('pdf-save')).toBeEnabled({ timeout: 45_000 });
    const promise = page.waitForEvent('download'); await page.getByTestId('pdf-save').click();
    await (await promise).saveAs(testInfo.outputPath(filename)); await page.getByTestId('pdf-close').click();
  };
  await download('btn-pdf', 'ponuda-rsd.pdf');

  await page.goto('/proizvodnja');
  await expect(page.getByText('Stubova za izradu: 2 kom', { exact: false })).toBeVisible();
  await expect(page.getByTestId('cutlist-finishing-area')).toHaveText('0,72 m²');
  await expect(page.getByTestId('cutlist-finishing-mass')).toHaveText('3,499 kg');
  expect(await page.getByRole('img', { name: `Crtež ograde: ${p.name}`, exact: true }).innerHTML()).not.toContain('#c9ccd0');
  await page.screenshot({ path: testInfo.outputPath('proizvodnja-bez-betona.png'), fullPage: true });
  await download('prod-workorder', 'radni-nalog.pdf');
  await download('cutlist-pdf', 'krojna-lista.pdf');

  await page.goto('/podesavanja'); await page.getByRole('radio', { name: 'EUR', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const currency = await new Promise<string>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result.currency); }); db.close(); return currency;
  })).toBe('EUR');
  await page.goto('/editor/proj_finishing'); await page.getByTestId('btn-open-calc').click();
  const totalEur = await page.getByTestId('calc-total').innerText(); await page.getByTestId('calc-close').click();
  await download('btn-pdf', 'ponuda-eur.pdf');
  await writeFile(testInfo.outputPath('ocekivani-iznosi.json'), JSON.stringify({ totalRsd, totalEur }));
  expect(errors).toEqual([]);
});
