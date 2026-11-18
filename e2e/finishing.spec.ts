import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { FINISHING_MATERIALS, FINISHING_SPECS, finishingProject } from '../src/tests/fixtures/finishing';
import type { AppSettings, Project } from '../src/domain/models/types';

test('plastifikacija: neto zbir, mase elemenata, trajna cena i oba PDF dokumenta', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); await expect(page.getByTestId('hero')).toBeVisible();
  await page.evaluate(async ({ project, materials, specs }) => {
    for (const key of ['modelMaterialsV1', 'pairHardwareV1', 'materialNamesV2', 'carriagesV1', 'railProfileV1', 'slopePlateV1', 'terraceMaterialsV2', 'projectsWipedV1']) localStorage.setItem(`alutim.${key}`, '1');
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const settings = await new Promise<AppSettings>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'materials', 'kv'], 'readwrite');
      tx.objectStore('projects').clear(); tx.objectStore('projects').put(project);
      tx.objectStore('materials').clear(); for (const m of materials) tx.objectStore('materials').put(m);
      tx.objectStore('kv').put({ ...settings, modelSpecs: specs, pricing: { ...settings.pricing, coatingPerM2Rsd: 0 } }, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  }, { project: finishingProject(), materials: FINISHING_MATERIALS, specs: FINISHING_SPECS });

  await page.goto('/proizvodnja');
  await expect(page.getByTestId('prod-element-mass')).toHaveCount(3);
  for (const cell of await page.getByTestId('prod-element-mass').all()) await expect(cell).toHaveText('0,778 kg');
  await expect(page.getByTestId('cutlist-finishing-area')).toHaveText('0,96 m²');
  await expect(page.getByTestId('cutlist-finishing-mass')).toHaveText('4,666 kg');
  await page.getByTestId('cutlist-finishing').screenshot({ path: testInfo.outputPath('zbir-plastifikacija.png') });

  await page.goto('/podesavanja');
  await page.getByTestId('set-coating-rate').fill('1000'); await page.getByTestId('set-coating-rate').press('Tab');
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const p = await new Promise<Project>((resolve) => { const r = db.transaction('projects').objectStore('projects').get('proj_finishing'); r.onsuccess = () => resolve(r.result); }); db.close();
    return p.settings.pricing.coatingPerM2Rsd;
  })).toBe(1000);
  await page.reload(); await expect(page.getByTestId('set-coating-rate')).toHaveValue('1000');
  await page.getByTestId('set-coating').screenshot({ path: testInfo.outputPath('cena-plastifikacije.png') });

  await page.goto('/editor/proj_finishing'); await page.getByTestId('btn-open-calc').click();
  await expect(page.getByTestId('calc-coating-rate')).toHaveValue('1000');
  const coating = page.getByTestId('calc-breakdown').getByRole('row').filter({ hasText: /^Plastificiranje/ });
  await expect(coating).toContainText('0,96 m²'); await expect(coating).toContainText('960');
  await page.getByTestId('calc-close').click();

  await page.goto('/proizvodnja');
  for (const [button, filename] of [['cutlist-pdf', 'krojna-lista.pdf'], ['prod-workorder', 'radni-nalog.pdf']] as const) {
    await page.getByTestId(button).click();
    await expect(page.getByTestId('pdf-save')).toBeEnabled({ timeout: 45_000 });
    const dl = page.waitForEvent('download'); await page.getByTestId('pdf-save').click();
    const file = testInfo.outputPath(filename); await (await dl).saveAs(file); expect((await stat(file)).size).toBeGreaterThan(10_000);
    // Isti dokument za kapiju: proverava i promenu opsega u stvarnom PDF generatoru.
    const previous = await page.getByTestId('pdf-frame').getAttribute('src');
    await page.getByTestId('pdf-scope-gates').click(); await expect(page.getByTestId('pdf-save')).toBeEnabled({ timeout: 45_000 });
    await expect(page.getByTestId('pdf-frame')).not.toHaveAttribute('src', previous!);
    const scoped = page.waitForEvent('download'); await page.getByTestId('pdf-save').click();
    await (await scoped).saveAs(testInfo.outputPath(`kapija-${filename}`));
    await page.getByTestId('pdf-close').click();
  }
  // Komadni završeci imaju procenjenu masu i površinu, vidljivo označenu i u PDF-u.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
    const settings = await new Promise<AppSettings>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ ...settings, modelSpecs: { ...settings.modelSpecs, h_white: [...settings.modelSpecs!.h_white!, { id: 'cap-spec', name: 'Kape', materialId: 'finish-cap', group: 'Nosači i spojnice', qty: '2', enabled: true }] } }, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.reload();
  await expect(page.getByTestId('cutlist-finishing-area')).toContainText('≈');
  await expect(page.getByTestId('cutlist-finishing-mass')).toContainText('≈');
  for (const [button, filename] of [['cutlist-pdf', 'procena-krojna-lista.pdf'], ['prod-workorder', 'procena-radni-nalog.pdf']] as const) {
    await page.getByTestId(button).click(); await expect(page.getByTestId('pdf-save')).toBeEnabled({ timeout: 45_000 });
    const dl = page.waitForEvent('download'); await page.getByTestId('pdf-save').click(); await (await dl).saveAs(testInfo.outputPath(filename));
    await page.getByTestId('pdf-close').click();
  }
  expect(errors).toEqual([]);
});
