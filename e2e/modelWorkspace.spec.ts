import { test, expect, type Page } from '@playwright/test';
import { TERRACE_MATERIALS } from '../src/data/terraceMaterials';
import { MODEL_MATERIALS } from '../src/data/modelMaterials';
import type { CustomModel } from '../src/domain/models/custom';
const yard: CustomModel = { id: 'cm_phase4_yard', name: 'Dvorište faza četiri', kind: 'fence', widthMm: 1200, heightMm: 1000, color: 'RAL 7016', updatedAt: new Date().toISOString(), parts: [{ id: 'rail4', materialId: 'mat_kv_30x20', x: 0, y: 300, lengthMm: 1200, angleDeg: 0, rot: 0, z: 0 }] };
const terrace: CustomModel = { ...yard, id: 'cm_phase4_terrace', name: 'Terasa faza četiri', kind: 'terrace', parts: [100, 1100].map((x, i) => ({ id: `post4_${i}`, materialId: TERRACE_MATERIALS.find((m) => m.sku === 'P-1057')!.id, x, y: 0, lengthMm: 1000, angleDeg: 90, rot: 0, z: 0 })) };
async function seed(page: Page) {
 await page.goto('/'); await expect(page.getByTestId('hero-new')).toBeVisible();
 await page.evaluate(async ({ models, materials }) => {
  const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('alu-tim-012'); r.onsuccess = () => resolve(r.result); });
  const settings = await new Promise<Record<string, unknown>>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => resolve(r.result); });
  await new Promise<void>((resolve, reject) => { const t = db.transaction(['kv', 'materials'], 'readwrite'); t.objectStore('kv').put({ ...settings, customModels: models, terraceModelIds: [models[0].id] }, 'settings'); materials.forEach((m) => t.objectStore('materials').put(m)); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); }); db.close();
 }, { models: [yard, terrace, { ...yard, id: 'cm_phase4_gate', kind: 'gate', name: 'Kapija faza četiri', gate: { gateType: 'pedestrian', version: 1 } }], materials: [...MODEL_MATERIALS, ...TERRACE_MATERIALS] });
}
test('faza 4: izabrani deo dobija prednost nad staklom, a mere okova su razdvojene', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
 await seed(page); await page.goto(`/modeli-terasa/crtanje/${terrace.id}`);
 const tabs = page.getByTestId('designer-property-tabs');
 await tabs.getByRole('tab', { name: 'Konstrukcija', exact: true }).click();
 await expect(page.getByTestId('glass-railing-mode')).toBeVisible();
 await page.locator('[data-part-id="post4_0"]').first().click();
 await expect(tabs.getByRole('tab', { name: 'Deo', exact: true })).toHaveAttribute('aria-selected', 'true');
 await expect(page.getByTestId('part-x')).toBeVisible(); await expect(page.getByTestId('glass-railing-mode')).toBeHidden();
 await tabs.getByRole('tab', { name: 'Materijal', exact: true }).click(); await expect(page.getByTestId('designer-bom')).toBeVisible();
 await page.getByTestId('designer-construction-tools').locator('summary').click(); await page.getByTestId('designer-terrace-measures').click();
 await expect(page.getByRole('dialog')).toContainText('Mere okova i spojeva');
 await expect(page.getByTestId('hardware-production').getByTestId('terrace-dim-ballArm')).toBeVisible();
 await expect(page.getByTestId('hardware-appearance').getByTestId('terrace-dim-endCapLen')).toBeVisible();
 await page.getByTestId('terrace-measures-close').click();
 for (const width of [1440, 1160, 390]) { await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); }
 expect(errors).toEqual([]);
});
test('faza 4: biblioteke pretražuju, filtriraju, kopiraju i preimenuju modele', async ({ page }) => {
 await seed(page); await page.goto('/modeli');
 await page.getByRole('textbox', { name: 'Pretraga modela' }).fill('Dvorište faza');
 const card = page.getByTestId('custom-model-card').filter({ hasText: yard.name }); await expect(card).toHaveCount(1); await expect(card).toContainText('dostupan i za terase');
 await card.getByRole('button', { name: 'Radnje modela', exact: true }).click(); await page.getByRole('menuitem', { name: 'Napravi kopiju', exact: true }).click();
 await expect(page.getByTestId('custom-model-card')).toHaveCount(2);
 const copy = page.getByTestId('custom-model-card').filter({ hasText: '— kopija' });
 await copy.getByRole('button', { name: 'Radnje modela', exact: true }).click(); await page.getByRole('menuitem', { name: 'Preimenuj', exact: true }).click();
 await page.getByRole('dialog').getByRole('textbox').fill('Novo ime faza četiri'); await page.getByRole('button', { name: 'Sačuvaj naziv' }).click();
 await page.getByRole('textbox', { name: 'Pretraga modela' }).fill('Novo ime'); await expect(page.getByTestId('custom-model-card')).toHaveCount(1);
 await page.getByRole('combobox', { name: 'Filter modela' }).selectOption('shared'); await expect(page.getByTestId('custom-model-card')).toHaveCount(0);
 await page.goto('/modeli-kapija'); await page.getByRole('textbox', { name: 'Pretraga modela' }).fill('Kapija faza');
 const gate = page.getByTestId('gate-model-card'); await expect(gate).toHaveCount(1);
 await gate.getByRole('button', { name: 'Radnje modela', exact: true }).click(); await page.getByRole('menuitem', { name: 'Napravi kopiju' }).click(); await expect(gate).toHaveCount(2);
});
test('faza 4: novi crtež i postojeći model imaju jasne poruke o čuvanju', async ({ page }) => {
 await seed(page); await page.goto('/modeli-terasa/crtanje/cm_phase4_empty'); await expect(page.getByTestId('designer-save-context')).toContainText('Prazan crtež se još ne čuva');
 await page.goto(`/modeli/crtanje/${yard.id}`); await expect(page.getByTestId('designer-save-context')).toContainText('Izmene se automatski upisuju');
 await page.getByTestId('designer-tools').locator('summary').click(); await expect(page.getByRole('button', { name: 'Kopiraj izbor', exact: true })).toBeDisabled();
 await page.locator('[data-part-id="rail4"]').first().click(); await expect(page.getByRole('button', { name: 'Kopiraj izbor', exact: true })).toBeEnabled();
 await page.screenshot({ path: 'test-results/phase4-designer.png' });
});
