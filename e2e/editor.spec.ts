import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';

async function enableAdvanced(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Podešavanja' }).first().click();
  const sw = page.getByTestId('set-advanced');
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await page.getByRole('link', { name: 'Početna' }).first().click();
}

async function showDims(page: import('@playwright/test').Page) {
  await page.getByTestId('btn-view-options').click();
  const cb = page.getByTestId('opt-showDimensions');
  if (!(await cb.isChecked())) await cb.check();
  await page.getByTestId('btn-view-options').click();
}

/** Raspakuje sve tokove PDF-a i vraća njihov sadržaj (da bismo proverili ToUnicode mapu fonta). */
function inflatedStreams(buf: Buffer): string {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const a = buf.indexOf('stream', from, 'latin1');
    if (a < 0) break;
    const b = buf.indexOf('endstream', a, 'latin1');
    if (b < 0) break;
    const start = a + 6 + (buf[a + 6] === 0x0d ? 2 : 1);
    try { out.push(zlib.inflateSync(buf.subarray(start, b)).toString('latin1')); } catch { /* nije FlateDecode */ }
    from = b + 9;
  }
  return out.join(' ');
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

const num = (s: string | null) => Number((s ?? '').replace(/[^\d]/g, ''));

test('glavni scenario: projektovanje, kalkulacija, čuvanje, izvoz', async ({ page }) => {
  const errors = trackErrors(page);

  // 1–2. otvori aplikaciju, klikni Novi projekat
  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await enableAdvanced(page);
  await page.getByTestId('hero-new').click();
  await expect(page).toHaveURL(/\/editor\/proj_/);

  // 3. naziv (sa srpskim slovima)
  const name = 'Čačak šuma žđ ćuprija';
  await page.getByTestId('project-name').fill(name);

  // 4. tri segmenta ograde
  for (let i = 0; i < 3; i++) await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('count-items')).toHaveText('3');

  // 5–6. pešačka i klizna kapija
  await page.getByTestId('cat-gate-pedestrian-add').click();
  await page.getByTestId('cat-gate-sliding-add').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');
  await expect(page.getByTestId('count-posts')).toHaveText('6 (4)');
  expect(num(await page.getByTestId('total-modular').textContent())).toBe(10460); // spoljne mere 3 × 2000 + 1000 + 4000 minus zajednički stubovi

  // 7–8. promeni širinu prvog segmenta i proveri da se crtež promenio
  await page.locator('[data-hit="item"]').first().click();
  await expect(page.getByTestId('panel-item')).toContainText('Ograda 1');
  const before = await page.getByTestId('front-view').innerHTML();
  await page.getByTestId('field-width').fill('1500');
  await expect(page.getByTestId('total-modular')).toContainText('9.960');
  await showDims(page);
  await expect(page.getByTestId('front-view').getByText(/1\.500/).first()).toBeVisible();
  expect(await page.getByTestId('front-view').innerHTML()).not.toBe(before);

  // nevažeća vrednost: objašnjenje, vrednost se ne primenjuje potajno
  await page.getByTestId('field-width').fill('50');
  await expect(page.getByRole('alert').filter({ hasText: 'najmanja dozvoljena' })).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('total-modular')).toContainText('9.960');
  await page.getByTestId('field-width').fill('1500');

  // 9–10. promena redosleda dugmetom i provera ukupne širine
  await page.getByTestId('btn-move-right').click();
  await page.getByTestId('tab-dims').click();
  const firstRowWidth = await page.getByTestId('dims-table').locator('tbody tr').first().locator('td').nth(3).textContent();
  expect(num(firstRowWidth)).toBe(2000);
  await expect(page.getByTestId('dims-table')).toContainText('9.960');
  await page.getByTestId('tab-front').click();

  // drag-and-drop: pešačku kapiju prevuci na početak
  const gateHit = page.locator('[data-hit="item"]').nth(3);
  const firstHit = page.locator('[data-hit="item"]').first();
  const gb = (await gateHit.boundingBox())!;
  const fb = (await firstHit.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width / 2 - 30, gb.y + gb.height / 2, { steps: 5 });
  await page.mouse.move(fb.x + 8, fb.y + fb.height / 2, { steps: 12 });
  await expect(page.getByTestId('drop-indicator')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('drop-indicator')).toHaveCount(0);
  await page.getByTestId('tab-dims').click();
  await expect(page.getByTestId('dims-table').locator('tbody tr').first()).toContainText('Pešačka kapija');
  await expect(page.getByTestId('dims-table')).toContainText('9.960');
  await page.getByTestId('tab-front').click();

  // 11. promena boje izabranog elementa
  await page.locator('[data-hit="item"]').nth(1).click();
  await page.getByTestId('field-color').locator('[data-color=\"RAL 5011\"]').click();
  await expect(page.getByTestId('field-color-value')).toHaveText('RAL 5011');

  // undo/redo
  await page.getByTestId('btn-undo').click();
  // promena ponašanja: selekcija ostaje posle undo (element postoji), boja se vraća
  await expect(page.getByTestId('field-color-value')).not.toHaveText('RAL 5011');
  await page.getByTestId('btn-redo').click();
  await expect(page.getByTestId('field-color-value')).toHaveText('RAL 5011');

  // 12–14. kalkulacija i izmena cene materijala
  await page.getByTestId('btn-calc').click();
  const total1 = num(await page.getByTestId('calc-total').textContent());
  expect(total1).toBeGreaterThan(0);
  await page.getByTestId('price-input-mat_alu_profil').fill('5000');
  await expect.poll(async () => num(await page.getByTestId('calc-total').textContent())).toBeGreaterThan(total1);
  await page.getByTestId('calc-close').click();

  // 15–17. sačuvaj, osveži, podaci ostaju
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('btn-save')).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveValue(name);
  await expect(page.getByTestId('count-items')).toHaveText('5');
  await expect(page.getByTestId('total-modular')).toContainText('9.960');

  // 18. izvoz projekta u JSON
  await page.goto('/projekti');
  const row = page.getByTestId('project-row').filter({ hasText: 'Čačak' });
  await row.getByRole('button', { name: 'Akcije' }).click();
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Izvezi JSON' }).click()]);
  const jsonPath = await jsonDl.path();
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  expect(parsed.project.name).toBe(name);
  expect(parsed.project.items).toHaveLength(5);
  expect(parsed.project.posts).toHaveLength(6);

  // 19. PDF ponuda
  await row.getByRole('button', { name: 'Akcije' }).click();
  await page.getByRole('menuitem', { name: 'Otvori' }).click();
  const [pdfDl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('btn-pdf').click()]);
  const pdfBytes = fs.readFileSync((await pdfDl.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdfBytes.length).toBeGreaterThan(20000);
  const latin = pdfBytes.toString('latin1');
  expect(latin).toContain('Roboto');
  // ToUnicode mapa ugrađenog fonta mora sadržati č, ć, š, ž, đ iz naziva projekta
  const cmap = inflatedStreams(pdfBytes).toLowerCase();
  for (const cp of ['010d', '0107', '0161', '017e', '0111']) expect(cmap, `glif U+${cp}`).toContain(`<${cp}>`);

  // 20. nema JavaScript grešaka
  expect(errors).toEqual([]);
});

test('demo projekat Petrović se otvara sa tačnim rasporedom i 11000 mm', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await enableAdvanced(page);
  await page.getByTestId('recent-row').filter({ hasText: 'Porodična kuća Petrović' }).getByRole('link').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');
  await expect(page.getByTestId('total-modular')).toContainText('11.000');
  await expect(page.getByTestId('count-posts')).toHaveText('6 (4)');
  await expect(page.getByTestId('front-view')).toBeVisible();
  // klik na stub, izmena širine utiče na svetli otvor
  await page.locator('[data-hit="post"]').nth(1).click();
  await expect(page.getByTestId('panel-post')).toBeVisible();
  // 3D je sada aktivan prikaz
  await expect(page.getByTestId('tab-three')).toBeVisible();
  // Escape poništava selekciju, Delete briše element, Ctrl+Z vraća
  await page.locator('[data-hit="item"]').first().click();
  await expect(page.getByTestId('panel-item')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('count-items')).toHaveText('4');
  await expect(page.getByTestId('panel-item')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('count-items')).toHaveText('5');
  await page.locator('[data-hit="item"]').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('fiksna ukupna dužina: upozorenje i automatsko raspoređivanje', async ({ page }) => {
  await page.goto('/');
  await enableAdvanced(page);
  await page.getByTestId('recent-row').filter({ hasText: 'Petrović' }).getByRole('link').click();
  await page.getByTestId('total-mode').getByRole('radio', { name: 'Fiksna' }).click();
  await page.getByTestId('fixed-total').fill('10000');
  await expect(page.getByTestId('panel-basics')).toContainText('Prekoračenje za 1.000');
  await page.getByTestId('fixed-total').fill('12000');
  await expect(page.getByTestId('panel-basics')).toContainText('Slobodan prostor');
  await page.getByTestId('btn-autofill').click();
  await expect(page.getByTestId('total-modular')).toContainText('12.000');
  await expect(page.getByTestId('panel-basics')).toContainText('Raspoređeno');
});

test('dashboard statistika, modeli i projekti rade', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('stat-customers')).toHaveText('8');
  await expect(page.getByTestId('popular-model')).toHaveCount(6);
  await page.getByTestId('popular-model').first().click();
  await expect(page).toHaveURL(/\/editor\//);
  await expect(page.getByTestId('count-items')).toHaveText('1');
  for (const path of ['/projekti', '/modeli', '/materijali', '/kupci', '/ponude', '/proizvodnja', '/izvestaji', '/podesavanja', '/pomoc']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
  }
  // materijali: izmena cene i dodavanje
  await page.goto('/materijali');
  await page.getByTestId('btn-add-material').click();
  await page.getByTestId('material-sku').fill('TEST-1');
  await page.getByTestId('material-name').fill('Probni materijal');
  await page.getByTestId('material-save').click();
  await expect(page.getByTestId('materials-table')).toContainText('Probni materijal');
  // kupci: dodavanje i pretraga
  await page.goto('/kupci');
  await page.getByTestId('btn-add-customer').click();
  await page.getByTestId('customer-name').fill('Đorđe Šaranović');
  await page.getByTestId('customer-save').click();
  await expect(page.getByTestId('customers-table')).toContainText('Đorđe Šaranović');
  // ponuda, proizvodnja PDF/CSV
  await page.goto('/proizvodnja');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('prod-csv').click()]);
  expect(fs.readFileSync((await csv.path())!, 'utf-8')).toContain('Naziv');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('prod-pdf').click()]);
  expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('uvoz JSON prijavljuje grešku za neispravan format', async ({ page }) => {
  await page.goto('/projekti');
  await page.getByTestId('import-file').setInputFiles({ name: 'lose.json', mimeType: 'application/json', buffer: Buffer.from('{"project":{"id":"x","name":"y","items":"bad","posts":[]}}') });
  await expect(page.getByRole('alert')).toContainText('Uvoz nije uspeo');
  const good = JSON.stringify({ project: { id: 'imp1', name: 'Uvezeni projekat', items: [], posts: [{ id: 'p1', type: 'aluminium', widthMm: 100, heightMm: 1800, color: 'RAL 7016', mounting: 'wall', custom: false }], settings: {} } });
  await page.getByTestId('import-file').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(good) });
  await expect(page.getByTestId('projects-table')).toContainText('Uvezeni projekat');
});

test('reset demo podataka traži potvrdu', async ({ page }) => {
  await page.goto('/podesavanja');
  await page.getByTestId('btn-reset-demo').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Otkaži' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('„Uredi" otvara izmenu podataka projekta; kapija sa betonskim stubom se dodaje iz kataloga', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('project-edit').click();
  await page.getByTestId('edit-name').fill('Ograda Test');
  await page.getByTestId('edit-quote').fill('P-2026-777');
  await page.getByTestId('project-edit-done').click();
  await expect(page.getByTestId('project-data')).toContainText('P-2026-777');
  await page.getByTestId('cat-gate-concrete-add').click();
  await expect(page.getByTestId('front-view')).toBeVisible();
  await expect(page.getByTestId('count-items')).toHaveText('2');
});

const ALL_MODELS = ['h_narrow', 'h_boards', 'h_combo', 'rail_black', 'panel_lines', 'rail_inox', 'picket_narrow', 'louver_light', 'louver_dark', 'picket_brown', 'h_white', 'v_framed', 'picket_wide', 'h_wide', 'glass_inox'];

test('svih 15 modela: ograda i kapija se crtaju u 2D i 3D bez grešaka', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  // katalog nudi samo elemente izabranog modela: ograda, 4 vrste kapija, kapija sa betonskim stubom i prazan otvor
  for (const id of ['cat-fence', 'cat-gate-pedestrian', 'cat-gate-sliding', 'cat-gate-double', 'cat-gate-single', 'cat-gate-concrete', 'cat-opening']) await expect(page.getByTestId(id)).toBeVisible();
  for (const id of ALL_MODELS) {
    await page.getByTestId('catalog-model').selectOption(id);
    await page.getByTestId('cat-fence-add').click();
  }
  await page.getByTestId('cat-gate-sliding-add').click();
  for (const id of ALL_MODELS) {
    await page.getByTestId('field-model').selectOption(id);
    await expect(page.getByTestId('field-model')).toHaveValue(id);
  }
  await expect(page.getByTestId('count-items')).toHaveText('16');
  // kapija u 3D se učitava iz GLB modela izabranog dizajna (15 = Inox i staklo, klizna)
  const glb = page.waitForResponse((r) => /15-klizna.*\.glb/.test(r.url()) && r.ok());
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  const res = await glb;
  expect((await res.body()).byteLength).toBeGreaterThan(10000);
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
});

test('model 04: sastavnica i krojna lista u proizvodnji, PDF i CSV', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('rail_black');
  for (let i = 0; i < 2; i++) await page.getByTestId('cat-fence-add').click();
  await page.getByRole('button', { name: 'Sačuvaj' }).click();
  await page.waitForTimeout(800);
  await page.goto('/proizvodnja');
  await page.locator('select').first().selectOption({ label: 'Novi projekat' });
  const sheet = page.getByTestId('rail04-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('rail04-bom')).toContainText('PEGA 06');
  await expect(page.getByTestId('rail04-cuts')).toContainText('S-01');
  await expect(page.getByTestId('rail04-bars')).toContainText('Stub Ø40');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rail04-csv').click()]);
  expect(fs.readFileSync((await csv.path())!, 'utf-8')).toContain('PEGA 2275/1');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('prod-pdf').click()]);
  expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('ograda pod uglom: ugao skretanja na stubu, tlocrt i 3D', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  for (let i = 0; i < 3; i++) await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('tab-top').click().catch(() => undefined);
  // izbor međustuba preko pogleda odozgo i zadavanje ugla
  await page.getByRole('tab', { name: /Pogled odozgo/ }).click();
  await page.getByTestId('top-post-1').click();
  await page.getByTestId('turn-90').click();
  await expect(page.getByTestId('top-view')).toHaveAttribute('data-turned', 'true');
  await expect(page.getByTestId('turn-1')).toContainText('90°');
  // 3D prikaz se crta bez grešaka, prevlačenje je isključeno za trasu sa skretanjem
  await page.getByRole('tab', { name: /3D prikaz/ }).click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.getByTestId('mode-edit')).toBeDisabled();
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
});

test('ugaoni spoj: savijanje cevi između dva stuba, sastavnica i krojna lista', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('rail_black');
  for (let i = 0; i < 2; i++) await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('add-end').click({ force: true });
  await page.getByTestId('add-kind-corner').click();
  await page.getByTestId('add-bend').fill('45');
  await page.getByTestId('add-apply').click(); // novi element je izabran
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('count-items')).toHaveText('4');
  await expect(page.getByTestId('count-posts')).toContainText('5'); // dva stuba uz spoj: ugao nije na stubu
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Sačuvaj' }).click();
  await page.waitForTimeout(800);
  await page.goto('/proizvodnja');
  await page.locator('select').first().selectOption({ label: 'Novi projekat' });
  await expect(page.getByTestId('rail04-cuts')).toContainText('savijanje: 45° udesno');
  await expect(page.getByTestId('rail04-bom')).toContainText('Savijanje cevi');
  expect(errors).toEqual([]);
});

test('model 08: radna sastavnica i krojna lista, polja za nepotvrđene podatke', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('louver_light');
  await page.getByTestId('cat-fence-add').click();
  await page.getByRole('button', { name: 'Sačuvaj' }).click();
  await page.waitForTimeout(800);
  await page.goto('/proizvodnja');
  await page.locator('select').first().selectOption({ label: 'Novi projekat' });
  await expect(page.getByTestId('louver08-status')).toContainText('čeka potvrdu');
  await expect(page.getByTestId('louver08-bom')).toContainText('U 60 × 28');
  await expect(page.getByTestId('louver08-cuts')).toContainText('U-01');
  await page.getByTestId('l08-wall').fill('3');
  await page.getByTestId('l08-wall').press('Enter');
  await page.getByTestId('l08-fill').selectOption('kz4');
  await expect(page.getByTestId('louver08-bom')).toContainText('KZ000004');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('louver08-csv').click()]);
  expect(fs.readFileSync((await csv.path())!, 'utf-8')).toContain('KZ000004');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('prod-pdf').click()]);
  expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});

test('modeli: specifikacija ograde — dodavanje, brisanje i formule', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli');
  await page.getByTestId('spec-model-h_narrow').click();
  const editor = page.getByTestId('spec-editor');
  await expect(editor).toBeVisible();
  const rowsBefore = await page.locator('[data-testid^="spec-row-"]').count();
  expect(rowsBefore).toBeGreaterThan(3);
  // neispravna formula blokira čuvanje i prikazuje poruku
  await page.getByTestId('spec-qty-0').fill('W+');
  await expect(editor.getByRole('alert').first()).toBeVisible();
  await expect(page.getByTestId('spec-save')).toBeDisabled();
  await page.getByTestId('spec-qty-0').fill('3');
  await expect(page.getByTestId('spec-save')).toBeEnabled();
  // brisanje i dodavanje elementa
  await page.getByTestId('spec-del-1').click();
  await page.getByTestId('spec-add').click();
  await expect(page.locator('[data-testid^="spec-row-"]')).toHaveCount(rowsBefore);
  await page.getByTestId(`spec-name-${rowsBefore - 1}`).fill('Dodatni profil');
  await page.getByTestId(`spec-len-${rowsBefore - 1}`).fill('H');
  await page.getByTestId('spec-save').click();
  await expect(page.getByTestId('spec-model-h_narrow')).toContainText('izmenjena');
  expect(errors).toEqual([]);
  // vraćanje podrazumevane (nakon automatskog čuvanja)
  await page.waitForTimeout(900);
  await page.goto('/modeli');
  await page.getByTestId('spec-model-h_narrow').click();
  await page.getByTestId('spec-reset').click();
  await expect(page.getByTestId('spec-model-h_narrow')).not.toContainText('izmenjena');
});

test('crtanje ograde: tačke u gornjem prikazu prave polja izabranog modela', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await page.getByTestId('btn-trace').click();
  const svg = page.getByTestId('trace-svg');
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  for (const [fx, fy] of [[0.2, 0.3], [0.5, 0.3], [0.5, 0.7]] as const) {
    const p = at(fx, fy);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId('trace-point-2')).toBeVisible();
  await page.getByTestId('trace-finish').click();
  await expect(page.getByTestId('trace-canvas')).toHaveCount(0);
  await expect(page.getByTestId('top-view')).toHaveAttribute('data-turned', 'true');
});

test('crtanje ograde: završi crtanje, izmeni meru, pa napravi ogradu', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await page.getByTestId('btn-trace').click();
  const svg = page.getByTestId('trace-svg');
  const box = (await svg.boundingBox())!;
  for (const [fx, fy] of [[0.25, 0.35], [0.6, 0.35]] as const) {
    const x = box.x + box.width * fx; const y = box.y + box.height * fy;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
  }
  await page.getByTestId('trace-stop').click();
  await expect(page.getByTestId('trace-canvas')).toHaveAttribute('data-mode', 'edit');
  await page.getByTestId('trace-len-0').fill('6000');
  await expect(page.getByTestId('trace-total')).toContainText('6.000');
  await expect(page.getByTestId('project-select')).toBeVisible().catch(() => undefined);
  await page.getByTestId('trace-finish').click();
  await expect(page.getByTestId('trace-canvas')).toHaveCount(0);
  await page.getByTestId('tab-dims').click();
  await expect(page.getByTestId('canvas-card')).toContainText('6.000');
});

test('klik na kotu menja širinu elementa uz proveru granica', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await page.getByTestId('cat-fence-add').click();
  await showDims(page);
  await page.locator('[data-dim="width"]').first().click({ force: true });
  await expect(page.getByTestId('dim-edit')).toBeVisible();
  await page.getByTestId('dim-input').fill('300');
  await expect(page.getByTestId('dim-error')).toContainText('600');
  await expect(page.getByTestId('dim-apply')).toBeDisabled();
  await page.getByTestId('dim-input').fill('2400');
  await page.getByTestId('dim-input').press('Enter');
  await expect(page.getByTestId('dim-edit')).toHaveCount(0);
  await expect(page.getByTestId('front-view')).toContainText('2.400');
});

test('dugme + na kraju niza dodaje sledeći element sa zadatim merama', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await page.getByTestId('cat-fence-add').click();
  await showDims(page);
  await page.getByTestId('add-end').click({ force: true });
  await expect(page.getByTestId('add-menu')).toBeVisible();
  await page.getByTestId('add-kind-fence').click();
  await page.getByTestId('add-width').fill('300');
  await expect(page.getByTestId('add-error')).toContainText('600');
  await expect(page.getByTestId('add-apply')).toBeDisabled();
  await page.getByTestId('add-width').fill('1700');
  await page.getByTestId('add-height').fill('1200');
  await page.getByTestId('add-post-concrete').click();
  await page.getByTestId('add-apply').click();
  await expect(page.getByTestId('add-form')).toHaveCount(0);
  await expect(page.getByTestId('front-view')).toContainText('1.700');
  await page.getByTestId('add-end').click({ force: true });
  await page.getByTestId('add-kind-pedestrian').click();
  await page.getByTestId('add-apply').click();
  await expect(page.locator('[data-dim="width"]')).toHaveCount(3);
});

test('„Trenutni projekat" otvara projekat na kome se radi, a ne pravi novi', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  const url = page.url();
  await page.getByRole('link', { name: 'Projekti' }).click();
  await expect(page).toHaveURL(/projekti/);
  await page.getByTestId('nav-current-project').click();
  await expect(page).toHaveURL(url);
  await page.waitForTimeout(700);
  // posle ponovnog učitavanja vraća poslednji otvoren projekat
  await page.goto('/');
  await page.getByTestId('nav-current-project').click();
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('count-items')).toHaveText('1');
});

test('PDF ponuda: prvo pregled, tek onda čuvanje', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('btn-pdf').click();
  await expect(page.getByTestId('pdf-preview')).toBeVisible();
  await expect(page.getByTestId('pdf-frame')).toBeVisible({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByTestId('pdf-save').click();
  expect((await download).suggestedFilename()).toMatch(/^ponuda_.*\.pdf$/);
  await page.getByTestId('pdf-close').click();
  await expect(page.getByTestId('pdf-preview')).toHaveCount(0);
});

test('dugme Sačuvaj: pri klikom se pojavi kružić, pa se vrati početno stanje; nema natpisa u zaglavlju', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await expect(page.locator('header').getByText('Sačuvano')).toHaveCount(0);
  const btn = page.getByTestId('btn-save');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  await expect(btn).toHaveAttribute('aria-busy', 'false', { timeout: 5000 });
  await expect(btn).toContainText('Sačuvaj');
  await expect(btn).toBeEnabled();
});

test('obaveštenja: zvonce otvara samo poruku da nema obaveštenja', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Obaveštenja' }).click();
  await expect(page.getByTestId('bell-empty')).toHaveText('Nema obaveštenja.');
});

test('klik na kotu ukupne dužine raspoređuje polja na zadatu dužinu; meni prikaza se zatvara klikom van njega', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('btn-view-options').click();
  await page.getByTestId('opt-showDimensions').check();
  await expect(page.getByTestId('opt-showGrid')).toBeVisible();
  await page.getByTestId('canvas-area').click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('opt-showGrid')).toHaveCount(0);
  await expect(page.getByTestId('total-length')).toHaveText('3.900 mm');
  await page.locator('[data-dim="total"]').click({ force: true });
  await page.getByTestId('dim-input').fill('2000');
  await page.getByTestId('dim-apply').click();
  await expect(page.getByTestId('total-length')).toHaveText('2.000 mm');
  // premalo za dva polja: poruka, bez primene
  await page.locator('[data-dim="total"]').click({ force: true });
  await page.getByTestId('dim-input').fill('1000');
  await expect(page.getByTestId('dim-error')).toBeVisible();
  await expect(page.getByTestId('dim-apply')).toBeDisabled();
});

test('katalog: „Prikaži sve" otvara ugaoni spoj i sve vrste stubova', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('catalog-all')).toHaveCount(0);
  await page.getByTestId('catalog-show-all').click();
  for (const t of ['aluminium', 'concrete', 'concrete_plinth', 'decorative', 'gate']) await expect(page.getByTestId(`cat-post-${t}`)).toBeVisible();
  await page.getByTestId('cat-post-concrete-add').click();
  await page.getByTestId('cat-corner-add').click();
  await expect(page.getByTestId('count-items')).toHaveText('2');
  await page.getByTestId('catalog-show-all').click();
  await expect(page.getByTestId('catalog-all')).toHaveCount(0);
});

test('simulacija na fotografiji: učitavanje slike, pomeranje uglova, čuvanje i preuzimanje', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-gate-double-add').click();
  await page.getByTestId('tab-photo').click();
  await expect(page.getByTestId('sim-empty')).toBeVisible();
  // mala PNG slika 4 × 3 (zeleno)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEklEQVR4nGNgoBAwMjAwMDAwAAAE3wABHpCQ8gAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('sim-file').setInputFiles({ name: 'dvoriste.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('sim-fence')).toBeVisible();
  await expect(page.locator('[data-testid^="sim-handle-"]')).toHaveCount(4);
  const before = await page.getByTestId('sim-fence').getAttribute('style');
  const h = (await page.getByTestId('sim-handle-1').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 40, h.y + 50, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.getByTestId('sim-fence').getAttribute('style')).not.toBe(before);
  const download = page.waitForEvent('download');
  await page.getByTestId('sim-download').click();
  expect((await download).suggestedFilename()).toMatch(/_simulacija\.jpg$/);
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByTestId('tab-photo').click();
  await expect(page.getByTestId('sim-fence')).toBeVisible();
  await page.getByTestId('sim-remove').click();
  await expect(page.getByTestId('sim-empty')).toBeVisible();
});

test('simulacija se isključuje i uključuje u podešavanjima (Napredne opcije)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await expect(page.getByTestId('tab-photo')).toBeVisible();
  await page.getByRole('link', { name: 'Podešavanja' }).first().click();
  await expect(page.getByText('Napredne opcije')).toBeVisible();
  await page.getByTestId('set-photosim').click();
  await expect(page.getByTestId('set-photosim')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('nav-current-project').click();
  await expect(page.getByTestId('tab-photo')).toHaveCount(0);
  await page.getByRole('link', { name: 'Podešavanja' }).first().click();
  await page.getByTestId('set-photosim').click();
  await page.getByTestId('nav-current-project').click();
  await expect(page.getByTestId('tab-photo')).toBeVisible();
});

test('materijali: izvoz tabele i uvoz cena sa pregledom pre primene', async ({ page }) => {
  await page.goto('/materijali');
  const download = page.waitForEvent('download');
  await page.getByTestId('btn-export-materials').click();
  await page.getByTestId('export-csv').click();
  expect((await download).suggestedFilename()).toMatch(/^materijali_\d{4}-\d{2}-\d{2}\.csv$/);

  const csv = 'Šifra;Naziv;Cena\nDEMO-HP-100;x;777,5\nNEPOZNATO-1;y;10\n';
  await page.getByTestId('import-file').setInputFiles({ name: 'cene.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-counts')).toContainText('Menja se: 1');
  await expect(page.getByTestId('import-row-changed')).toContainText('777,5');
  await expect(page.getByTestId('import-row-unknown')).toBeVisible();
  await page.getByTestId('import-apply').click();
  await expect(page.getByTestId('import-preview')).toHaveCount(0);
  await expect(page.getByLabel('Cena: Aluminijumski profil 100×20 (horizontalna letvica)')).toHaveValue('777.5');

  // dokument bez kolone sa cenom: poruka, bez primene
  await page.getByTestId('import-file').setInputFiles({ name: 'lose.csv', mimeType: 'text/csv', buffer: Buffer.from('Naziv;Opis\nx;y\n', 'utf-8') });
  await expect(page.getByTestId('import-fatal')).toBeVisible();
  await expect(page.getByTestId('import-apply')).toBeDisabled();
});

test('materijali: uvoz Excel (.xlsx) dokumenta prikazuje pregled izmena', async ({ page }) => {
  await page.goto('/materijali');
  await page.getByTestId('import-file').setInputFiles('probni-cenovnik.xlsx');
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-summary')).toContainText('5 cena');
  await expect(page.getByTestId('import-summary')).toContainText('3 novih');
  await expect(page.getByTestId('import-counts')).toContainText('Novi: 3');
  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('import-preview')).toHaveCount(0);
  await page.getByTestId('import-file').setInputFiles({ name: 'los.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('nije excel') });
  await expect(page.getByRole('alert').filter({ hasText: 'Excel' })).toBeVisible();
});

import { existsSync } from 'node:fs';
const SUPPLIER_PDF = 'C:/Users/Andreja/Desktop/CENOVNIK - ALUMINIJUMSKE OGRADE - 2026 (7)_1740ea0c-25b3-44c5-85c4-09960912e2f5.pdf';
test('materijali: uvoz PDF cenovnika dobavljača kao tabele, sa pregledom', async ({ page }) => {
  test.skip(!existsSync(SUPPLIER_PDF), 'PDF cenovnik dobavljača nije na ovom računaru');
  await page.goto('/materijali');
  await page.getByTestId('import-file').setInputFiles(SUPPLIER_PDF);
  await expect(page.getByTestId('import-preview')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('import-summary')).toContainText('novih materijala');
  await expect(page.getByTestId('import-counts')).toContainText('Novi: 67');
  await expect(page.getByTestId('import-counts')).toContainText('Menja se: 5');
  await expect(page.getByTestId('import-big')).toBeVisible();
  await expect(page.getByTestId('import-row-changed').first()).toContainText('po metru');
  await page.getByTestId('import-cancel').click();
});

test('materijali: uvoz probnog PDF-a (test-cenovnik-dobavljac.pdf)', async ({ page }) => {
  await page.goto('/materijali');
  await page.getByTestId('import-file').setInputFiles('test-cenovnik-dobavljac.pdf');
  await expect(page.getByTestId('import-preview')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('import-counts')).toContainText('Menja se: 6');
  await expect(page.getByTestId('import-counts')).toContainText('Novi: 7');
  await page.getByTestId('import-cancel').click();
});

test('materijali: izvoz u PDF, meni se zatvara klikom van njega, izvezeni PDF se uvozi nazad bez izmena', async ({ page }) => {
  await page.goto('/materijali');
  await page.getByTestId('btn-export-materials').click();
  await expect(page.getByTestId('export-menu')).toBeVisible();
  await page.getByRole('heading', { name: 'Materijali i cene' }).click();
  await expect(page.getByTestId('export-menu')).toHaveCount(0);
  await page.getByTestId('btn-export-materials').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^materijali_\d{4}-\d{2}-\d{2}\.pdf$/);
  const path = await d.path();
  const total = await page.getByTestId('material-row').count();
  await page.getByTestId('import-file').setInputFiles(path!);
  await page.getByTestId('import-preview').waitFor({ timeout: 30000 });
  await expect(page.getByTestId('import-counts')).toContainText(`Isto: ${total}`);
  await expect(page.getByTestId('import-apply')).toBeDisabled();
});

test('materijali: klik na materijal sa crtežom otvara crtež ispod reda; ostali redovi nemaju crtež', async ({ page }) => {
  await page.goto('/materijali');
  await expect(page.getByTestId('profile-drawing')).toHaveCount(0);
  const withDrawing = page.locator('[data-testid="material-row"][data-has-drawing="true"]');
  await expect(withDrawing).toHaveCount(2);
  await withDrawing.first().click();
  await expect(page.getByTestId('profile-drawing')).toBeVisible();
  await expect(page.getByTestId('material-drawing-row')).toContainText('KZ000003');
  // klik na polje sa cenom ne otvara/zatvara crtež
  await withDrawing.first().getByLabel(/^Cena:/).click();
  await expect(page.getByTestId('profile-drawing')).toBeVisible();
  // drugi materijal zamenjuje prvi, ponovni klik zatvara
  await withDrawing.nth(1).click();
  await expect(page.getByTestId('material-drawing-row')).toContainText('KU000002');
  await expect(page.getByTestId('profile-drawing')).toHaveCount(1);
  await withDrawing.nth(1).click();
  await expect(page.getByTestId('profile-drawing')).toHaveCount(0);
  // materijal bez crteža: klik ne radi ništa
  await page.getByTestId('material-row').first().click();
  await expect(page.getByTestId('profile-drawing')).toHaveCount(0);
});
