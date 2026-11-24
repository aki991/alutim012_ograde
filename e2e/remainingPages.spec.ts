import { expect, test, type Page } from '@playwright/test';
import type { Project } from '../src/domain/models/types';
function createProject(name: string, items: Project['items'] = []): Project {
 return { id: 'temp', schemaVersion: 3, name, customerId: null, status: 'nacrt', createdAt: '2026-10-01T12:00:00+02:00', updatedAt: '2026-10-01T12:00:00+02:00', notes: '', quoteNo: '', items, posts: items.length ? [0, 1].map((i) => ({ id: `phase6_post_${i}`, type: 'aluminium', widthMm: 40, heightMm: 1100, color: 'RAL 7016', mounting: 'concrete_base', custom: false })) : [], settings: { totalMode: 'auto', fixedTotalMm: 1200, fillStrategy: 'proportional', defaultHeightMm: 1000, defaultColor: 'RAL 7016', showDimensions: true, showGrid: true, showLabels: false, pricing: { vatPercent: 20, pricesIncludeVat: false, profitMode: 'margin', profitPercent: 25, discountPercent: 0, laborPerM2Rsd: 0, laborPerGateRsd: 0, installPerMeterRsd: 0, installPerGateRsd: 0, coatingPerM2Rsd: 0, currency: 'RSD' } } };
}
import { MODEL_MATERIALS } from '../src/data/modelMaterials';
test.use({ timezoneId: 'Europe/Belgrade' });
async function seed(page: Page) {
 const a = { ...createProject('Sličan naziv'), id: 'proj_phase6_a', quoteNo: 'O-101', customerId: 'cust_phase6_a', updatedAt: '2026-10-01T12:00:00+02:00' };
 const b = { ...createProject('Sličan naziv', [{ id: 'phase6_fence', kind: 'fence', modelId: 'cm_phase6_zero', materialId: 'mat_phase6_zero', widthMm: 1200, heightMm: 1000, color: 'RAL 7016', params: { barSizeMm: 16, gapMm: 100, frameMm: 40 } }]), id: 'proj_phase6_b', quoteNo: 'O-102', customerId: 'cust_phase6_b', status: 'ponuda' as const, updatedAt: '2026-11-24T00:00:00+01:00' };
 const c = { ...createProject('Kraj dana'), id: 'proj_phase6_c', quoteNo: 'O-103', updatedAt: '2026-11-24T23:59:59+01:00' };
 const material = MODEL_MATERIALS.find((m) => m.id === 'mat_kv_30x20')!;
 const stock = [{ id: 'stock_phase6_a', materialId: material.id, lengthMm: 6000, qty: 5 }, { id: 'stock_phase6_b', materialId: material.id, lengthMm: 1000, qty: 3, note: 'Polica B' }];
 const projects = [{ ...a, offcuts: [{ materialId: material.id, lengthMm: 6000, qty: 2, stockId: stock[0].id }] }, { ...b, offcuts: [{ materialId: material.id, lengthMm: 1000, qty: 7, stockId: stock[1].id }] }, c];
 await page.goto('/'); await expect(page.getByTestId('hero-new')).toBeVisible();
 await page.evaluate(async ({ projects, stock, material }) => {
  const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
  const settings = await new Promise<Record<string, unknown>>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
  const catalog = await new Promise<Array<{ id: string; unitPrice: number }>>((resolve) => { const r = db.transaction('materials').objectStore('materials').getAll(); r.onsuccess = () => resolve(r.result); });
  await new Promise<void>((resolve, reject) => { const t = db.transaction(['kv', 'projects', 'customers', 'materials'], 'readwrite'); t.objectStore('projects').clear(); projects.forEach((p) => t.objectStore('projects').put(p));
   t.objectStore('kv').put({ ...settings, stock, stockBookings: {}, customModels: [{ id: 'cm_phase6_zero', name: 'Model bez cene faza 6', kind: 'fence', widthMm: 1200, heightMm: 1000, color: 'RAL 7016', updatedAt: '2026-11-24T00:00:00+01:00', parts: [{ id: 'phase6_part', materialId: 'mat_phase6_zero', x: 0, y: 300, lengthMm: 1200, angleDeg: 0, rot: 0, z: 0 }] }] }, 'settings'); catalog.forEach((m) => t.objectStore('materials').put({ ...m, unitPrice: 0 })); t.objectStore('materials').put({ ...material, unitPrice: 0 }); t.objectStore('materials').put({ ...material, id: 'mat_phase6_zero', sku: 'PHASE6', name: 'Profil bez cene faza 6', unitPrice: 0 });
   for (const [id, name] of [['cust_phase6_a', 'Kupac Alfa'], ['cust_phase6_b', 'Kupac Beta']]) t.objectStore('customers').put({ id, name, address: 'Adresa faza 6', phone: '012345', email: 'test@example.com', notes: '' });
   t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); }); db.close(); localStorage.setItem('alu-tim.lastProject', projects[0].id);
 }, { projects, stock, material });
}
test('faza 6: početna nastavlja poslednji otvoreni projekat, a projekti imaju oznake i jedinice bez prelamanja', async ({ page }) => {
 await seed(page); await page.reload();
 await expect(page.getByTestId('continue-project')).toHaveAttribute('href', '/editor/proj_phase6_a');
 const recent = page.getByRole('heading', { name: 'Nedavni projekti', exact: true }); const popular = page.getByRole('heading', { name: 'Popularni modeli ograda', exact: true });
 expect((await recent.boundingBox())!.y).toBeLessThan((await popular.boundingBox())!.y);
 await page.screenshot({ path: 'test-results/phase6-home.png' });
 await page.goto('/projekti'); const row = page.getByTestId('project-row').filter({ hasText: 'O-102' }); await expect(row).toContainText('Kupac Beta');
 expect(await row.locator('td').nth(3).evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('nowrap');
 await page.getByRole('textbox', { name: 'Pretraga projekata' }).fill('O-101'); await expect(page.getByTestId('project-row')).toHaveCount(1);
});
test('faza 6: magacin pokazuje stanje, rezervacije, slobodno i manjak bez menjanja evidencije', async ({ page }) => {
 await seed(page); await page.goto('/magacin');
 await page.screenshot({ path: 'test-results/phase6-stock.png' });
 const summary = page.getByTestId('stock-summary'); await expect(summary).toContainText('8 kom'); await expect(summary).toContainText('9 kom'); await expect(summary).toContainText('3 kom');
 await expect(page.getByRole('alert')).toContainText('premašuju');
 await expect(page.getByTestId('stock-free').first()).toHaveText('3'); await expect(page.getByTestId('stock-free').last()).toHaveText('0');
 await page.getByRole('combobox', { name: 'Raspoloživost' }).selectOption('free'); await expect(page.getByTestId('stock-row')).toHaveCount(1);
 await page.getByRole('combobox', { name: 'Vrsta komada' }).selectOption('offcut'); await expect(page.getByTestId('stock-row')).toHaveCount(0);
 await page.getByRole('button', { name: 'Pomoć: Stanje, rezervacije i slobodan materijal' }).click(); await expect(page.getByRole('dialog')).toContainText('proknjiženo');
});
test('faza 6: svi izveštaji prate uključive datume i status, uz oznaku nepotpunih kalkulacija', async ({ page }) => {
 await seed(page); await page.goto('/izvestaji');
 await expect(page.getByTestId('reports-table').locator('tbody tr')).toHaveCount(3); await expect(page.getByTestId('reports-incomplete')).toBeVisible();
 await page.screenshot({ path: 'test-results/phase6-reports.png' });
 await page.getByLabel('Od datuma', { exact: true }).fill('2026-11-24'); await page.getByLabel('Do datuma', { exact: true }).fill('2026-11-24');
 await expect(page.getByTestId('reports-table').locator('tbody tr')).toHaveCount(2);
 await page.getByRole('combobox', { name: 'Filter statusa' }).selectOption('ponuda'); await expect(page.getByTestId('reports-table').locator('tbody tr')).toHaveCount(1); await expect(page.getByTestId('reports-table')).toContainText('O-102');
 await page.getByRole('textbox', { name: 'Pretraga izveštaja' }).fill('Nema takvog projekta'); await expect(page.getByTestId('reports-table')).toContainText('Nema projekata'); await expect(page.getByTestId('reports-incomplete')).toHaveCount(0);
 await page.getByRole('button', { name: 'Poništi filtere' }).click(); await expect(page.getByTestId('reports-table').locator('tbody tr')).toHaveCount(3);
 await page.getByLabel('Od datuma', { exact: true }).fill('2026-11-25'); await page.getByLabel('Do datuma', { exact: true }).fill('2026-11-24'); await expect(page.getByRole('alert')).toContainText('Početni datum');
});
test('faza 6: detalj kupca, grupe menija i pomoć podešavanja su dostupni', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
 await seed(page); await page.goto('/kupci'); await page.getByRole('button', { name: 'Projekti kupca Kupac Alfa' }).click();
 const detail = page.getByRole('complementary', { name: 'Detalj kupca' }); await expect(detail).toContainText('Kupac Alfa'); await expect(detail).toContainText('Adresa faza 6'); await expect(detail).toContainText('O-101');
 const nav = page.getByTestId('main-navigation'); for (const title of ['Rad', 'Biblioteka', 'Poslovanje i radionica', 'Administracija']) await expect(nav.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
 await page.goto('/podesavanja'); for (const id of ['company', 'account', 'pricing', 'cutting', 'display', 'data']) await expect(page.getByTestId(`settings-${id}`)).toBeVisible();
 await page.getByRole('button', { name: 'Pomoć: Sečenje i magacin' }).click(); await expect(page.getByRole('dialog')).toContainText('postojeći projekti');
 await page.getByRole('link', { name: 'Otvori celo uputstvo' }).click(); await expect(page).toHaveURL(/pomoc#vodic-cutting/); await expect(page.getByTestId('help-manual')).toBeVisible(); await expect(page.getByTestId('help-topics')).toBeVisible();
 for (const width of [1440, 1160, 390]) { await page.setViewportSize({ width, height: 950 }); await page.goto('/podesavanja'); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); }
 await page.screenshot({ path: 'test-results/phase6-settings.png' }); expect(errors).toEqual([]);
});
