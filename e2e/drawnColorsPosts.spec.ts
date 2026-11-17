import { expect, test, type Page } from '@playwright/test';
import { SEED_MATERIALS } from '../src/tests/fixtures/materials';

/**
 * Tri funkcije: nacrtan presek profila (Materijali i cene → „Nacrtaj element“), boja pojedinačnih delova u crtanju modela
 * i šabloni stubova (Podešavanja → Šabloni stubova, izbor u panelu stuba).
 */

/** cenovnik je u novoj instalaciji prazan: upisuje se probni cenovnik u lokalnu bazu (isto kao u editor.spec.ts) */
async function seedMaterials(page: Page, path = '/materijali') {
  await page.goto('/');
  await page.waitForSelector('[data-testid="hero"]');
  await page.evaluate(async (mats) => {
    localStorage.setItem('alutim.modelMaterialsV1', '1');
    const open = () => new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('alu-tim-012'); r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result); });
    const get = (db: IDBDatabase, store: string, key: string) => new Promise<unknown>((resolve, reject) => { const r = db.transaction([store]).objectStore(store).get(key); r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result); });
    const db = await open();
    for (let i = 0; i < 100 && !(await get(db, 'kv', 'seeded')); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['materials'], 'readwrite');
      const st = tx.objectStore('materials');
      st.clear();
      for (const m of mats) st.put(m);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, SEED_MATERIALS.map((m) => ({ ...m, demo: false })));
  await page.goto(path);
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

async function setNum(page: Page, testId: string, value: string) {
  const f = page.getByTestId(testId);
  await f.fill(value);
  await f.press('Enter');
}

/** boja (fill) nacrtanog dela u 2D crtežu */
const partFill = (page: Page, id: string) => page.locator(`[data-part-id="${id}"]`).locator('polygon, rect').first().getAttribute('fill');

test('Nacrtaj element: presek L profila se crta, čuva uz materijal i koristi u crtanju modela (2D i 3D)', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/materijali');
  await page.getByTestId('btn-draw-element').click();
  // polazni oblik L 40 × 40, zid 3
  await page.getByTestId('draw-kind').selectOption('l');
  await setNum(page, 'draw-a', '40');
  await setNum(page, 'draw-b', '40');
  await setNum(page, 'draw-t', '3');
  await page.getByTestId('draw-apply').click();
  await expect(page.getByTestId('draw-point')).toHaveCount(3);
  await expect(page.getByTestId('draw-section')).toBeVisible();
  await expect(page.getByTestId('draw-size')).toContainText('40 × 40 mm, zid 3 mm');
  // klik na prazno polje dodaje tačku, „Ukloni poslednju“ je briše
  const box = (await page.getByTestId('draw-canvas').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(page.getByTestId('draw-point')).toHaveCount(4);
  await page.getByTestId('draw-undo').click();
  await expect(page.getByTestId('draw-point')).toHaveCount(3);
  // tačka se menja i upisom
  await setNum(page, 'draw-x-2', '50');
  await expect(page.getByTestId('draw-size')).toContainText('50 × 40 mm');
  await setNum(page, 'draw-x-2', '40');
  await page.getByTestId('draw-save').click();
  // nov materijal sa nacrtanim presekom
  await expect(page.getByTestId('material-name')).toHaveValue('L profil 40×40×3 (nacrtan)');
  await expect(page.getByTestId('material-drawn')).toContainText('Nacrtan presek');
  await expect(page.getByTestId('material-dim-c')).toHaveValue('3');
  await page.getByTestId('material-save').click();
  const row = page.getByTestId('material-row').filter({ hasText: 'L profil 40×40×3 (nacrtan)' });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('material-drawn-badge')).toBeVisible();
  await row.click();
  const drawing = page.getByTestId('material-drawing-row');
  await expect(drawing.getByTestId('shape-drawing')).toBeVisible();
  await expect(drawing).toContainText('40 × 40 mm');
  await expect(drawing).toContainText('L profili');

  // crtanje modela: materijal je u grupi L profila, deo ima presek iz crteža
  await page.goto('/modeli/crtanje');
  await page.getByTestId('designer-palette').getByLabel('Pretraga materijala').fill('nacrtan');
  await expect(page.getByTestId('designer-group-l')).toBeVisible();
  await page.getByTestId('designer-material').filter({ hasText: 'L profil 40×40×3 (nacrtan)' }).click();
  const c = (await page.getByTestId('designer-2d').boundingBox())!;
  await page.mouse.move(c.x + c.width * 0.3, c.y + c.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.5, { steps: 5 });
  await page.mouse.move(c.x + c.width * 0.7, c.y + c.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('designer-part')).toHaveCount(1);
  await page.getByTestId('designer-tool-select').click();
  await page.getByTestId('designer-part').first().click({ force: true });
  await expect(page.getByTestId('designer-props')).toContainText('presek 40 × 40 mm');
  await expect(page.getByTestId('part-wall')).toHaveValue('3');
  await page.getByTestId('designer-view-3d').click();
  await expect(page.getByTestId('designer-3d').locator('canvas')).toBeVisible();
  await page.waitForTimeout(500);

  // izmena crteža postojećeg materijala i uklanjanje crteža
  await page.goto('/materijali');
  await page.getByTestId('material-row').filter({ hasText: 'L profil 40×40×3 (nacrtan)' }).getByTestId('material-edit').click();
  await page.getByTestId('material-draw').click();
  await expect(page.getByTestId('draw-point')).toHaveCount(3);
  await page.getByTestId('draw-closed').check();
  await expect(page.getByTestId('draw-size')).toBeVisible();
  await page.getByTestId('draw-save').click();
  await expect(page.getByTestId('material-drawn')).toContainText('Nacrtan presek');
  await page.getByTestId('material-draw-remove').click();
  await expect(page.getByTestId('material-drawn')).toContainText('Možete ga i nacrtati');
  await page.getByTestId('material-save').click();
  await expect(page.getByTestId('material-row').filter({ hasText: 'L profil 40×40×3 (nacrtan)' }).getByTestId('material-drawn-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('crtanje modela: izabrani delovi dobijaju svoju boju (npr. beo ram, sive prečke), boja se čuva i vidi u minijaturi', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/modeli');
  await page.getByTestId('rework-model-h_narrow').click();
  await page.getByTestId('designer-part').first().waitFor();
  const ids = await page.getByTestId('designer-part').evaluateAll((els) => els.map((e) => e.getAttribute('data-part-id')!));
  expect(ids.length).toBeGreaterThan(3);
  const [a, b, other] = [ids[0], ids[1], ids[ids.length - 1]];
  const modelFill = await partFill(page, other);

  // jedan deo: karta boja (sve RAL boje)
  await page.locator(`[data-part-id="${a}"]`).click({ force: true });
  await expect(page.getByTestId('part-color-value')).toContainText('boja modela');
  await page.getByTestId('part-color').click();
  await page.getByTestId('chart-color').and(page.locator('[data-color="RAL 9016"]')).click();
  await expect(page.getByTestId('part-color-value')).toHaveText('RAL 9016');
  const black = await partFill(page, a);
  expect(black).not.toBe(modelFill);

  // više delova (Ctrl + klik): brzi izbor boje važi za sve izabrane
  await page.locator(`[data-part-id="${b}"]`).click({ force: true, modifiers: ['Control'] });
  await expect(page.getByTestId('designer-multi')).toBeVisible();
  await expect(page.getByTestId('multi-color-value')).toHaveText('različite boje');
  await page.getByTestId('multi-color-box').getByRole('radio', { name: 'RAL 7035' }).click();
  await expect(page.getByTestId('multi-color-value')).toHaveText('RAL 7035');
  const grey = await partFill(page, a);
  expect(await partFill(page, b)).toBe(grey);
  expect(grey).not.toBe(black);
  // ostali delovi su i dalje u boji modela
  expect(await partFill(page, other)).toBe(modelFill);

  // „Boja modela“ vraća drugi deo na boju modela; prvi ostaje siv
  await page.getByTestId('multi-clear').click();
  await page.locator(`[data-part-id="${b}"]`).click({ force: true });
  await page.getByTestId('part-color-reset').click();
  await expect(page.getByTestId('part-color-value')).toContainText('boja modela');
  expect(await partFill(page, b)).toBe(modelFill);

  // promena boje modela ne menja deo sa sopstvenom bojom
  await page.getByTestId('designer-color').click();
  await page.getByTestId('chart-color').and(page.locator('[data-color="RAL 8017"]')).click();
  await expect.poll(() => partFill(page, b)).not.toBe(modelFill);
  expect(await partFill(page, a)).toBe(grey);

  // 3D prikaz radi sa bojama delova
  await page.getByTestId('designer-view-split').click();
  await expect(page.getByTestId('designer-3d').locator('canvas')).toBeVisible();

  // boja se čuva: posle osvežavanja ista, i u minijaturi na strani Modeli
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByTestId('designer-part').first().waitFor();
  expect(await partFill(page, a)).toBe(grey);
  await page.getByRole('link', { name: 'Modeli ograda' }).click();
  const thumb = page.getByTestId('custom-model-card').first();
  await expect(thumb.locator(`[data-part-id="${a}"]`).locator('polygon, rect').first()).toHaveAttribute('fill', grey!);
  expect(errors).toEqual([]);
});

test('šabloni stubova: pravljenje u Podešavanjima, izbor za stub u projektu, čuvanje stuba kao šablona', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/podesavanja');
  await expect(page.getByTestId('post-tpl-empty')).toBeVisible();
  await page.getByTestId('post-tpl-new').click();
  await page.getByTestId('post-tpl-name').fill('Stub 100 crni');
  // presek iz cenovnika: širina se uzima iz preseka
  await page.getByTestId('post-tpl-material').click();
  await page.getByTestId('post-tpl-material-option').filter({ hasText: 'Kvadratna cev 100×100×2' }).first().click();
  await expect(page.getByTestId('post-tpl-material-name')).toContainText('Kvadratna cev 100×100×2');
  await expect(page.getByTestId('post-tpl-width')).toHaveValue('100');
  await page.getByTestId('post-tpl-mounting').selectOption('embedded');
  await page.getByTestId('post-tpl-color').getByRole('radio', { name: 'RAL 7035' }).click();
  await page.getByTestId('post-tpl-save').click();
  const row = page.getByTestId('post-tpl-row').filter({ hasText: 'Stub 100 crni' });
  await expect(row).toContainText('Kvadratna cev 100×100×2');
  await expect(row).toContainText('Ugradnja u beton');

  // izmena šablona
  await row.getByTestId('post-tpl-edit').click();
  await setNum(page, 'post-tpl-height', '2000');
  await page.getByTestId('post-tpl-save').click();
  await expect(row).toContainText('visina 2000 mm');

  // projekat: izabran stub dobija šablon (izmene važe za sve stubove)
  await page.getByRole('link', { name: 'Početna', exact: true }).click();
  await page.getByTestId('recent-row').filter({ hasText: 'Porodična kuća Petrović' }).getByRole('link').click();
  await page.locator('[data-hit="post"]').nth(1).click();
  await expect(page.getByTestId('panel-post')).toBeVisible();
  await page.getByTestId('post-template-select').selectOption({ label: 'Stub 100 crni' });
  await expect(page.getByTestId('post-template-select').locator('option:checked')).toHaveText('Stub 100 crni');
  await expect(page.getByTestId('post-color-value')).toContainText('RAL 7035');
  await expect(page.getByTestId('panel-post').getByLabel('Montaža')).toHaveValue('embedded');
  await expect(page.getByTestId('panel-post').getByLabel('Visina', { exact: true })).toHaveValue('2000');
  await expect(page.getByTestId('post-material')).toContainText('Kvadratna cev 100×100×2');
  await expect(page.getByTestId('panel-post').getByRole('button', { name: '100×100' })).toHaveClass(/btn-primary/);
  // drugi stub ima isti šablon
  await page.locator('[data-hit="post"]').nth(2).click();
  await expect(page.getByTestId('post-template-select').locator('option:checked')).toHaveText('Stub 100 crni');

  // stub sačuvan kao nov šablon
  await page.getByTestId('post-template-save').click();
  await page.getByTestId('post-template-name').fill('Moj stub');
  await page.getByTestId('post-template-save-confirm').click();
  await expect(page.getByTestId('panel-post')).toContainText('Šablon „Moj stub“ je sačuvan.');
  await expect(page.getByTestId('post-template-select').locator('option:checked')).toHaveText('Moj stub');
  await page.getByRole('link', { name: 'Podešavanja' }).click();
  await expect(page.getByTestId('post-tpl-row')).toHaveCount(2);
  // brisanje šablona
  await page.getByTestId('post-tpl-row').filter({ hasText: 'Moj stub' }).getByTestId('post-tpl-delete').click();
  await page.getByRole('button', { name: 'Obriši', exact: true }).click();
  await expect(page.getByTestId('post-tpl-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});
