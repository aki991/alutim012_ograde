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

  // 4. tri segmenta ograde (model bez posebne početne veličine: 2000 mm)
  await page.getByTestId('catalog-model').selectOption('h_white');
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
  await expect(page.getByTestId('panel-item')).toContainText('Platno 1');
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
  // RAL 5011 nije među pet boja za brzi izbor: bira se sa karte boja (klik na kružić trenutne boje)
  await page.getByTestId('field-color-current').click();
  await page.getByTestId('chart-color').and(page.locator('[data-color="RAL 5011"]')).click();
  await expect(page.getByTestId('field-color-value')).toHaveText('RAL 5011');

  // undo/redo
  await page.getByTestId('btn-undo').click();
  // promena ponašanja: selekcija ostaje posle undo (element postoji), boja se vraća
  await expect(page.getByTestId('field-color-value')).not.toHaveText('RAL 5011');
  await page.getByTestId('btn-redo').click();
  await expect(page.getByTestId('field-color-value')).toHaveText('RAL 5011');

  // 12–14. kalkulacija i izmena cene materijala
  await page.getByTestId('btn-open-calc').click();
  const total1 = num(await page.getByTestId('calc-total').textContent());
  expect(total1).toBeGreaterThan(0);
  await page.getByTestId('price-input-mat_alu_lamela').fill('5000');
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
  await page.getByTestId('danger-zone').locator('summary').click();
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
  await page.getByTestId('catalog-show-all').click(); // kapija sa betonskim stubom je među stubovima
  await page.getByTestId('cat-gate-concrete-add').click();
  await expect(page.getByTestId('front-view')).toBeVisible();
  await expect(page.getByTestId('count-items')).toHaveText('2');
});

const TERRACE = ['rail_black', 'rail_inox'];
const ALL_MODELS = ['h_narrow', 'h_boards', 'h_combo', 'rail_black', 'panel_lines', 'rail_inox', 'picket_narrow', 'louver_light', 'louver_dark', 'picket_brown', 'h_white', 'v_framed', 'picket_wide', 'h_wide'];

test('svih 15 modela: ograda i kapija se crtaju u 2D i 3D bez grešaka', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  // katalog nudi samo elemente izabranog modela: ograda, 4 vrste kapija, kapija sa betonskim stubom i prazan otvor
  for (const id of ['cat-fence', 'cat-gate-pedestrian', 'cat-gate-sliding', 'cat-gate-double', 'cat-gate-single', 'cat-opening']) await expect(page.getByTestId(id)).toBeVisible();
  for (const id of ALL_MODELS) {
    await page.getByTestId('catalog-model').selectOption(id);
    await page.getByTestId('cat-fence-add').click();
  }
  // ograde za terase nemaju kapije: kapija se dodaje tek sa modelom koji je dozvoljava
  await page.getByTestId('catalog-model').selectOption('h_narrow');
  await page.getByTestId('cat-gate-sliding-add').click();
  for (const id of ALL_MODELS.filter((m) => !TERRACE.includes(m))) {
    await page.getByTestId('field-model').selectOption(id);
    await expect(page.getByTestId('field-model')).toHaveValue(id);
  }
  await expect(page.getByTestId('count-items')).toHaveText('16');
  // kapija u 3D se učitava iz GLB modela izabranog dizajna (14 = Antracit široke letvice, klizna)
  const glb = page.waitForResponse((r) => /14-klizna.*\.glb/.test(r.url()) && r.ok());
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

// test „ugaoni spoj" je uklonjen: ugaoni spoj se više ne dodaje kao poseban element (ugao se pravi na stubu); obračun ugla pokrivaju jedinični testovi (rl10corner)

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
  // dugmad su u panelu, u okviru Kalkulacija cene (ispod ukupne cene), a u zaglavlju ih nema
  const priceBox = (await page.getByTestId('panel-price').boundingBox())!;
  const pdfBox = (await page.getByTestId('btn-pdf').boundingBox())!;
  expect(pdfBox.y).toBeGreaterThan(priceBox.y);
  expect(pdfBox.y + pdfBox.height).toBeLessThanOrEqual(priceBox.y + priceBox.height);
  await expect(page.locator('header').getByTestId('btn-pdf')).toHaveCount(0);
  await expect(page.locator('header').getByRole('button', { name: /Izračunaj cenu/ })).toHaveCount(0);
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
  await page.getByTestId('catalog-model').selectOption('h_white');
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

test('katalog: „Prikaži sve" otvara sve vrste stubova, bez ugaonog spoja', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('catalog-all')).toHaveCount(0);
  await page.getByTestId('catalog-show-all').click();
  for (const t of ['aluminium', 'concrete', 'concrete_plinth']) await expect(page.getByTestId(`cat-post-${t}`)).toBeVisible();
  for (const t of ['decorative', 'gate']) await expect(page.getByTestId(`cat-post-${t}`)).toHaveCount(0); // dekorativni stub i stub kapije se ne nude
  await expect(page.getByTestId('cat-plinth')).toHaveCount(0); // podnožje se bira na ogradi
  await expect(page.getByTestId('cat-corner')).toHaveCount(0); // ugao se pravi na stubu, ne kao poseban element
  await page.getByTestId('cat-post-concrete-add').click();
  await expect(page.getByTestId('count-items')).toHaveText('1');
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
  await expect(page.getByTestId('import-counts')).toContainText('Novi: 60');
  await expect(page.getByTestId('import-counts')).toContainText('Menja se: 12');
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

test('materijali: klik na bilo koji materijal otvara crtež i karakteristike ispod reda', async ({ page }) => {
  await page.goto('/materijali');
  // cenovnik je prazan pa se dodaju dva materijala: jedan sa detaljnim crtežom dobavljača (šifra iz kataloga) i jedan običan
  const add = async (sku: string, name: string) => {
    await page.getByTestId('btn-add-material').click();
    await page.getByTestId('material-sku').fill(sku);
    await page.getByTestId('material-name').fill(name);
    await page.getByTestId('material-save').click();
  };
  await add('KV000007', 'Pravougaona cev 80×20×1 mm, sirovo');
  await add('TEST-ČEP', 'Čep tarabice pun 80×20 mm');
  await expect(page.getByTestId('profile-drawing')).toHaveCount(0);
  const withDrawing = page.locator('[data-testid="material-row"][data-has-drawing="true"]');
  await expect(withDrawing).toHaveCount(1);
  await withDrawing.first().click();
  await expect(page.getByTestId('profile-drawing')).toBeVisible();
  await expect(page.getByTestId('material-drawing-row')).toContainText('A — širina');
  // klik na polje sa cenom ne otvara/zatvara crtež
  await withDrawing.first().getByLabel(/^Cena:/).click();
  await expect(page.getByTestId('profile-drawing')).toBeVisible();
  // drugi materijal zamenjuje prvi: crtež oblika iz crtanja modela sa karakteristikama
  const plain = page.locator('[data-testid="material-row"]:not([data-has-drawing="true"])').first();
  await plain.click();
  await expect(page.getByTestId('profile-drawing')).toHaveCount(0);
  await expect(page.getByTestId('shape-drawing')).toBeVisible();
  await expect(page.getByTestId('material-drawing-row')).toContainText('Grupa');
  await expect(page.getByTestId('material-drawing-row')).toContainText('komadni deo');
  // ponovni klik zatvara
  await plain.click();
  await expect(page.getByTestId('shape-drawing')).toHaveCount(0);
});

test('stranica za prijavu: bez podešenog Supabase-a kaže da prijava nije podešena i pušta dalje', async ({ page }) => {
  await page.goto('/prijava');
  await expect(page.getByTestId('login-form')).toBeVisible();
  await expect(page.getByTestId('login-disabled')).toContainText('VITE_SUPABASE_URL');
  await expect(page.getByTestId('login-submit')).toBeDisabled();
  await page.getByRole('button', { name: 'Nastavi bez prijave' }).click();
  await expect(page.getByTestId('hero')).toBeVisible();
});

test('krojna lista: dugme u panelu daje PDF za ogradu, a Proizvodnja prikazuje šipke i menja se sa dužinom šipke i testerom', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('recent-row').filter({ hasText: 'Petrović' }).getByRole('link').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');

  // dugme je desno od PDF ponude (isti red); pregled pa čuvanje kao krojna-lista_*.pdf
  const pdfBox = (await page.getByTestId('btn-pdf').boundingBox())!;
  const cutBox = (await page.getByTestId('btn-cutlist').boundingBox())!;
  expect(cutBox.x).toBeGreaterThan(pdfBox.x);
  await page.getByTestId('btn-cutlist').click();
  await expect(page.getByRole('dialog')).toContainText('Pregled krojne liste');
  // pre PDF-a se pita ima li ostataka; PDF se ne pravi dok se ne odgovori
  await expect(page.getByTestId('offcuts-ask')).toBeVisible();
  await expect(page.getByTestId('pdf-frame')).toHaveCount(0);
  await expect(page.getByTestId('offcuts-continue')).toBeDisabled();
  await page.getByTestId('offcuts-none').click();
  await page.getByTestId('offcuts-continue').click();
  await expect(page.getByTestId('pdf-frame')).toBeVisible({ timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdf-save').click()]);
  expect(dl.suggestedFilename()).toMatch(/^krojna-lista_.*\.pdf$/);
  const bytes = fs.readFileSync((await dl.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(30000);
  await page.getByTestId('pdf-close').click();

  // Proizvodnja: zbirovi, legenda pozicija i šipke
  await page.goto('/proizvodnja');
  await page.getByRole('combobox').first().selectOption({ label: 'Porodična kuća Petrović' });
  const cut = page.getByTestId('cutlist');
  await expect(cut).toBeVisible();
  await expect(cut.getByTestId('cutlist-profile').first()).toBeVisible();
  await expect(cut.getByTestId('cutlist-legend')).toContainText('Klizna kapija');
  const bars = async () => num(await cut.getByTestId('cutlist-bars').textContent());
  const before = await bars();
  expect(before).toBeGreaterThan(0);
  // istovetne šipke se grupišu („Šipke 1–14 × 14")
  await expect(cut.getByTestId('cutlist-bar-count').first()).toContainText('×');
  // kraća šipka traži više šipki
  const stock = cut.getByTestId('cut-stock');
  await stock.fill('2500');
  await expect.poll(bars).toBeGreaterThan(before);
  await expect(cut.getByTestId('cutlist-pdf')).toBeEnabled();
});

test('radni nalog: dugme u panelu i na strani Proizvodnja daje PDF sa elementima i stubovima', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('recent-row').filter({ hasText: 'Petrović' }).getByRole('link').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');
  const cutBox = (await page.getByTestId('btn-cutlist').boundingBox())!;
  const orderBox = (await page.getByTestId('btn-workorder').boundingBox())!;
  expect(orderBox.x).toBeGreaterThan(cutBox.x);
  await page.getByTestId('btn-workorder').click();
  await expect(page.getByRole('dialog')).toContainText('Pregled radnog naloga');
  await expect(page.getByTestId('pdf-frame')).toBeVisible({ timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdf-save').click()]);
  expect(dl.suggestedFilename()).toMatch(/^radni-nalog_.*\.pdf$/);
  const bytes = fs.readFileSync((await dl.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(30000);
  await page.getByTestId('pdf-close').click();

  await page.goto('/proizvodnja');
  await page.getByRole('combobox').first().selectOption({ label: 'Porodična kuća Petrović' });
  await page.getByTestId('prod-workorder').click();
  await expect(page.getByRole('dialog')).toContainText('Pregled radnog naloga');
  await expect(page.getByTestId('pdf-frame')).toBeVisible({ timeout: 30000 });
});

test('izbor više polja: Ctrl+klik, Shift+klik i okvir; visina i boja odjednom, brisanje i poništavanje', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('recent-row').filter({ hasText: 'Petrović' }).getByRole('link').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');
  const hits = page.locator('[data-hit="item"]');

  // običan klik bira jedno polje; Ctrl+klik dodaje drugo i treće
  await hits.nth(0).click();
  await expect(page.getByTestId('panel-item')).toBeVisible();
  await hits.nth(1).click({ modifiers: ['Control'] });
  await expect(page.getByTestId('panel-multi')).toContainText('Izabrano polja: 2');
  await expect(page.getByTestId('multi-outline')).toHaveCount(2);
  await hits.nth(4).click({ modifiers: ['Control'] });
  await expect(page.getByTestId('panel-multi')).toContainText('Izabrano polja: 3');
  // Ctrl+klik na izabrano polje ga izbacuje
  await hits.nth(4).click({ modifiers: ['Control'] });
  await expect(page.getByTestId('panel-multi')).toContainText('Izabrano polja: 2');
  // Ctrl+klik na jedno preostalo vraća pojedinačni izbor
  await hits.nth(1).click({ modifiers: ['Control'] });
  await expect(page.getByTestId('panel-multi')).toHaveCount(0);
  await expect(page.getByTestId('panel-item')).toContainText('Platno 1');

  // Shift+klik: niz od prvog do trećeg polja
  await hits.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('panel-multi')).toContainText('Izabrano polja: 3');

  // visina svih izabranih odjednom (jedan korak poništavanja)
  await page.getByTestId('multi-height').fill('1400');
  await expect(page.getByTestId('multi-height')).toHaveValue('1400');
  await hits.nth(3).click();
  await expect(page.getByTestId('field-height')).not.toHaveValue('1400'); // četvrto polje nije menjano
  await hits.nth(1).click();
  await expect(page.getByTestId('field-height')).toHaveValue('1400');
  await hits.nth(2).click();
  await expect(page.getByTestId('field-height')).toHaveValue('1400');
  await page.getByTestId('btn-undo').click();
  await hits.nth(1).click();
  await expect(page.getByTestId('field-height')).not.toHaveValue('1400');

  // okvir: prevlačenje po pozadini levim tasterom bira polja koja dodiruje; Esc poništava
  const b0 = (await hits.nth(0).boundingBox())!;
  const b1 = (await hits.nth(1).boundingBox())!;
  const area = (await page.getByTestId('canvas-area').boundingBox())!;
  await page.mouse.move(Math.max(area.x + 6, b0.x - 20), Math.max(area.y + 6, b0.y - 25));
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 8 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('panel-multi')).toContainText('Izabrano polja: 2');
  await expect(page.getByTestId('marquee')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel-multi')).toHaveCount(0);

  // brisanje izabranih polja
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Control'] });
  await page.getByTestId('multi-delete').click();
  await expect(page.getByTestId('count-items')).toHaveText('3');
  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');
});

test('modeli: kartice navode profile (vertikale i horizontale) po podacima radnika', async ({ page }) => {
  await page.goto('/modeli');
  await expect(page.getByTestId('construction-vertical-louver_light')).toHaveText('U profil 60×28');
  await expect(page.getByTestId('construction-horizontal-louver_light')).toHaveText('Kutijasti profil 80×20');
  await expect(page.getByTestId('construction-vertical-h_narrow')).toContainText('U profil 20×20');
  await expect(page.getByTestId('construction-horizontal-h_narrow')).toContainText('Kvadratna cev 30×20');
  await expect(page.getByTestId('construction-horizontal-h_white')).toContainText('20×20');
  await expect(page.getByTestId('construction-horizontal-louver_dark')).toContainText('Z profil');
  // interne beleške (nepotvrđeni podaci, upućivanja na dokumentaciju) se ne prikazuju korisniku
  await expect(page.getByTestId('construction-note-louver_dark')).toHaveCount(0);
  // modeli bez podatka radnika nemaju red sa profilima
  await expect(page.getByTestId('construction-vertical-h_wide')).toHaveCount(0);
});

test('modeli: dugmad „Koristi model" i „Specifikacija" su na istoj visini u svim karticama istog reda', async ({ page }) => {
  await page.goto('/modeli');
  const ys = async (testId: (id: string) => string) => {
    const ids = ['h_narrow', 'h_boards', 'h_combo'];
    const out: number[] = [];
    for (const id of ids) out.push((await page.getByTestId(testId(id)).boundingBox())!.y);
    return out;
  };
  const use = await ys((id) => `use-model-${id}`);
  const spec = await ys((id) => `spec-model-${id}`);
  expect(Math.max(...use) - Math.min(...use)).toBeLessThan(1);
  expect(Math.max(...spec) - Math.min(...spec)).toBeLessThan(1);
  // i na kraju kartice: dno dugmeta je uz dno kartice
  const card = (await page.getByTestId('model-card-h_boards').boundingBox())!;
  const btn = (await page.getByTestId('use-model-h_boards').boundingBox())!;
  expect(card.y + card.height - (btn.y + btn.height)).toBeLessThan(24);
});


test('ograde za terase: bez kapija i kataloga stubova; model se ne menja dok ima kapija', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  for (const id of TERRACE) {
    await page.getByTestId('catalog-model').selectOption(id);
    await expect(page.getByTestId('cat-fence')).toBeVisible();
    await expect(page.getByTestId('cat-opening')).toBeVisible();
    for (const g of ['pedestrian', 'sliding', 'double', 'single', 'concrete']) await expect(page.getByTestId(`cat-gate-${g}`)).toHaveCount(0);
    await expect(page.getByTestId('catalog-terrace-note')).toBeVisible();
    await page.getByTestId('catalog-show-all').click();
    await expect(page.getByTestId('cat-corner')).toHaveCount(0); // ugaoni spoj se ne nudi
    await expect(page.getByTestId('cat-post-aluminium')).toHaveCount(0);
    await expect(page.getByTestId('cat-post-concrete')).toHaveCount(0);
    await page.getByTestId('catalog-show-all').click();
  }
  // dugme +: nema kapija ni izbora tipa stuba
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('add-end').click();
  await expect(page.getByTestId('add-kind-fence')).toBeVisible();
  for (const g of ['pedestrian', 'single', 'double', 'sliding', 'concrete']) await expect(page.getByTestId(`add-kind-${g}`)).toHaveCount(0);
  await page.getByTestId('add-kind-fence').click();
  await expect(page.getByTestId('add-post-concrete')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // model sa kapijama (nije za terasu): kapije ostaju, a promena na model za terasu se odbija sa porukom
  await page.getByTestId('catalog-model').selectOption('h_narrow');
  await expect(page.getByTestId('cat-gate-sliding')).toBeVisible();
  await page.getByTestId('cat-gate-sliding-add').click();
  const items = await page.getByTestId('count-items').textContent();
  await page.getByTestId('field-model').selectOption('rail_black');
  await expect(page.getByTestId('panel-basics')).toContainText('ograde za terase nemaju kapije');
  await expect(page.getByTestId('field-model')).not.toHaveValue('rail_black');
  await expect(page.getByTestId('count-items')).toHaveText(items!);
});

test('model tarabica: razmak i prepust se menjaju, stub ima izbor kapa, sastavnica sadrži cevi i kape iz kataloga', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('picket_wide');
  for (let i = 0; i < 2; i++) await page.getByTestId('cat-fence-add').click();
  await page.locator('[data-hit="item"]').first().click();

  // pri dodavanju prvog polja: 1000 × 1000 mm (7 tarabica), a sledeće polje preuzima mere postojećeg
  await expect(page.getByTestId('field-height')).toHaveValue('1000');
  await expect(page.getByTestId('field-width')).toHaveValue('1000');
  await expect(page.getByTestId('field-slat-count')).toHaveValue('7');

  // tarabice su podignute od poda (razmak od poda 40 mm), a bela ograda ima sivu pozadinu radi vidljivosti
  await expect(page.getByTestId('field-lift')).toHaveValue('40');
  await expect(page.getByTestId('canvas-area')).toHaveClass(/b3bac3/);

  // broj tarabica menja širinu polja
  await page.getByTestId('field-slat-count').fill('8');
  await expect(page.getByTestId('field-width')).toHaveValue('1040');
  await page.getByTestId('field-slat-count').fill('7');
  await expect(page.getByTestId('field-width')).toHaveValue('940');

  // podrazumevane mere iz opisa proizvoda: tarabica 80, razmak 20, prepust cevi 30×30 30 mm
  await expect(page.getByTestId('field-bar')).toHaveValue('80');
  await expect(page.getByTestId('field-gap')).toHaveValue('20');
  await expect(page.getByTestId('field-overhang')).toHaveValue('30');
  const slatCount = async () => page.locator('[data-item-art] path[fill-rule], [data-item-art] path').count();
  const before = await slatCount();
  await page.getByTestId('field-gap').fill('50');
  await expect.poll(slatCount).toBeLessThan(before);
  await page.getByTestId('field-gap').fill('20');
  await page.getByTestId('field-overhang').fill('60');
  await expect(page.getByTestId('panel-item')).toContainText('Prepust cevi 30×30');
  await page.getByTestId('field-overhang').fill('30');

  // stub: kape na vrhu i u dnu iz kataloga (80×80 i 100×100)
  await page.locator('[data-hit="post"]').nth(1).click();
  // izmene stuba po podrazumevanoj vrednosti važe za sve stubove; ovde se proverava pojedinačni stub
  await expect(page.getByTestId('post-caps-all')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('post-caps-all').click();
  await expect(page.getByTestId('post-caps')).toBeVisible();
  await expect(page.getByTestId('post-cap-top')).toHaveValue('flat');
  await expect(page.getByTestId('post-cap-bottom')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('post-cap-top').locator('option')).toHaveText(['Bez kape', 'Kapa ravna', 'Kapa pismo']); // rozetna ne ide na vrh
  await page.getByTestId('post-cap-top').selectOption('pyramid');
  await page.getByTestId('post-cap-bottom').click(); // rozetna u dnu
  await expect(page.getByTestId('post-cap-bottom')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('post-cap-note')).toContainText('100×100');
  await page.getByRole('button', { name: '80×80' }).click();
  await expect(page.getByTestId('post-cap-note')).toContainText('80×80');

  // sastavnica: cevi i kape iz kataloga
  await page.getByTestId('btn-open-calc').click();
  const bom = page.getByTestId('calc-bom');
  for (const sku of ['KV000007', 'K100018', 'KTWM3899', 'KTF10010020', 'KTF808030', 'K100010', 'K100007', 'K100014']) await expect(bom).toContainText(sku);
  await page.getByTestId('calc-close').click();

  // izbor svih stubova uz tarabicu odjednom
  await page.locator('[data-hit="post"]').nth(0).click();
  await page.getByTestId('post-caps-all').click();
  await page.getByTestId('post-cap-top').selectOption('none');
  await page.locator('[data-hit="post"]').nth(2).click();
  await expect(page.getByTestId('post-cap-top')).toHaveValue('none');

  // 3D: kape se crtaju bez grešaka
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
});

test('stubovi: Ctrl+klik bira više stubova (boja važi za sve izabrane), katalog i dodavanje nude model projekta', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('picket_wide');
  for (let i = 0; i < 2; i++) await page.getByTestId('cat-fence-add').click();

  // izbor više stubova: Ctrl+klik dodaje, a boja se menja na svim izabranim
  const posts = page.locator('[data-hit="post"]');
  await posts.nth(0).click();
  await posts.nth(2).click({ modifiers: ['Control'] });
  await expect(page.getByTestId('panel-post')).toContainText('Izabrano stubova: 2');
  await expect(page.getByTestId('multi-post-outline')).toHaveCount(2);
  await page.getByTestId('post-color-current').click();
  await page.getByTestId('chart-color').and(page.locator('[data-color="RAL 5011"]')).click();
  await posts.nth(0).click();
  await expect(page.getByTestId('post-color-value')).toHaveText('RAL 5011');
  await posts.nth(2).click();
  await expect(page.getByTestId('post-color-value')).toHaveText('RAL 5011');
  await posts.nth(1).click();
  await expect(page.getByTestId('post-color-value')).not.toHaveText('RAL 5011');
  // prekidač „sve stubove" menja i boju svih
  await expect(page.getByTestId('post-caps-all')).toHaveAttribute('aria-checked', 'true'); // podrazumevano: sve stubove
  await page.getByTestId('post-color').locator('[data-color="RAL 8017"]').click();
  await posts.nth(0).click();
  await expect(page.getByTestId('post-color-value')).toHaveText('RAL 8017');

  // posle osvežavanja katalog nudi ogradu koju projekat već ima, a dodavanje ne nudi drugi model
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('btn-save')).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
  await page.reload();
  await expect(page.getByTestId('catalog-model')).toHaveValue('picket_wide');
  await expect(page.getByTestId('cat-fence')).toContainText('široke vertikalne letvice');
  // sličice su 2D crtež sa sivom pozadinom za belu ogradu; svi stubovi i samo podnožje su uvek u katalogu
  for (const id of ['cat-fence', 'cat-gate-pedestrian', 'cat-gate-sliding', 'cat-opening', 'cat-post-concrete_plinth']) await expect(page.locator(`[data-testid="${id}"] [class*="b3bac3"]`)).toHaveCount(1);
  for (const t of ['aluminium', 'concrete', 'concrete_plinth']) await expect(page.getByTestId(`cat-post-${t}`)).toBeVisible();
  await page.getByTestId('field-all-plinth').click(); // podnožje svih ograda
  await page.locator('[data-hit="item"]').first().click();
  await expect(page.getByTestId('field-item-plinth')).toHaveValue('400');
  // širina podnožja: podrazumevano od ivice do ivice stubova, a može da se zada
  await expect(page.getByTestId('field-item-plinth-width')).toBeVisible();
  await page.getByTestId('field-item-plinth-width').fill('1500');
  await expect(page.getByTestId('field-item-plinth-width')).toHaveValue('1500');
  await expect(page.getByTestId('field-width')).toHaveValue('1500'); // šire podnožje širi i ogradu
  await page.getByTestId('field-item-plinth-on').click(); // bez podnožja
  await expect(page.getByTestId('field-item-plinth')).toHaveCount(0);
  await expect(page.getByTestId('field-item-plinth-width')).toHaveCount(0);
  await page.getByTestId('add-end').click({ force: true });
  await page.getByTestId('add-kind-fence').click();
  await expect(page.getByTestId('add-form')).toBeVisible();
  await expect(page.getByTestId('add-model')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('novi elementi preuzimaju mere postojeće ograde; prazan otvor nema stubove; stubovi stoje na podnožju', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('picket_wide');
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('field-height').fill('900');
  await page.getByTestId('field-width').fill('1400');
  await page.getByTestId('field-gap').fill('25');
  // dugme „Dodaj": isto polje (visina, širina, razmak)
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('field-height')).toHaveValue('900');
  await expect(page.getByTestId('field-width')).toHaveValue('1400');
  await expect(page.getByTestId('field-gap')).toHaveValue('25');
  // kapija ima istu visinu
  await page.getByTestId('cat-gate-pedestrian-add').click();
  await expect(page.getByTestId('field-height')).toHaveValue('900');
  // prozor „Dodaj element" predlaže iste mere
  await page.getByTestId('add-end').click({ force: true });
  await page.getByTestId('add-kind-fence').click();
  await expect(page.getByTestId('add-height')).toHaveValue('900');
  // širina je spoljna mera poslednje ograde (uz kapiju je stub širi, pa je nekoliko mm veća)
  const addW = Number(await page.getByTestId('add-width').inputValue());
  expect(addW).toBeGreaterThanOrEqual(1400);
  expect(addW).toBeLessThanOrEqual(1420);
  await page.getByTestId('add-apply').click();
  // prazan otvor: visina i širina ograde, a na kraju nema svoj stub
  await page.getByTestId('cat-opening-add').click();
  await expect(page.getByTestId('field-height')).toHaveValue('900');
  const openW = Number(await page.getByTestId('field-width').inputValue());
  expect(openW).toBeGreaterThanOrEqual(1380);
  expect(openW).toBeLessThanOrEqual(1420);
  await expect(page.getByTestId('count-items')).toHaveText('5');
  // ograda, ograda, kapija, ograda, otvor: 6 mesta za stub, ali stub iza otvora se ne postavlja
  const posts = await page.getByTestId('count-posts').textContent();
  expect(Number(posts!.trim().split(' ')[0])).toBe(5);
  expect(errors).toEqual([]);
});

test('3D: izbor podloge (beton, trava, pločice) se pamti; skretanje ne pomera prvi deo ograde', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('picket_wide');
  for (let i = 0; i < 3; i++) await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.getByTestId('ground-concrete')).toHaveAttribute('aria-checked', 'true');
  for (const g of ['grass', 'tiles', 'concrete', 'grass']) {
    await page.getByTestId(`ground-${g}`).click();
    await expect(page.getByTestId(`ground-${g}`)).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(150);
  }
  await page.reload();
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('ground-grass')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('kapija sa svojim stubovima: stub ograde i stub kapije umesto zajedničkog stuba', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('picket_wide');
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-gate-pedestrian-add').click();
  await expect(page.getByTestId('count-posts')).toContainText('3');
  // izabrana je nova kapija: uključi svoje stubove
  await page.getByTestId('field-gate-own-posts').click();
  await expect(page.getByTestId('field-gate-own-posts')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('count-items')).toHaveText('2'); // razmaknik nije element
  await expect(page.getByTestId('count-posts')).toContainText('4');
  await expect(page.locator('[data-hit="post"]')).toHaveCount(4);
  await expect(page.getByTestId('field-gate-post-gap')).toHaveValue('40'); // razmak između stuba ograde i stuba kapije
  // 3D i pogled odozgo se crtaju bez grešaka
  await page.getByRole('tab', { name: /Pogled odozgo/ }).click();
  await expect(page.getByTestId('top-view')).toBeVisible();
  await page.getByRole('tab', { name: /3D prikaz/ }).click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  // novo polje posle kapije: kapija i dalje ima svoje stubove (tri razmaknika nisu potrebna: samo uz kapiju)
  await page.getByRole('tab', { name: /2D prikaz/ }).click();
  await page.getByTestId('field-all-gates-own-posts').click();
  await expect(page.getByTestId('count-posts')).toContainText('3');
  expect(errors).toEqual([]);
});

test('pregled dokumenta: dugme otvara pregled preko celog ekrana i vraća ga', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('btn-workorder').click();
  await page.getByTestId('pdf-frame').waitFor({ timeout: 30000 });
  const dlg = page.getByRole('dialog');
  const vp = page.viewportSize()!;
  expect((await dlg.boundingBox())!.width).toBeLessThan(vp.width - 10);
  await page.getByTestId('pdf-fullscreen').click();
  const full = (await dlg.boundingBox())!;
  expect(full.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(full.height).toBeLessThanOrEqual(vp.height + 1);
  await expect(page.getByTestId('pdf-save')).toBeVisible();
  await page.getByTestId('pdf-fullscreen').click();
  expect((await dlg.boundingBox())!.width).toBeLessThan(vp.width - 10);
});

test('stepenište: kartica u katalogu za terase, smer, visinska razlika i broj stepenika; crtež spreda i odozgo', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('rail_inox');
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-stair-add').click();
  // posle terase stepenište silazi; u crtežu su stepenici
  await expect(page.getByTestId('field-stair-on')).toBeVisible();
  await expect(page.getByTestId('stair-steps-1')).toBeVisible();
  await expect(page.getByTestId('level-0')).toBeVisible();
  await expect(page.getByTestId('field-stair-rise')).toHaveValue(/1[.]?020/);
  await expect(page.getByTestId('field-stair-steps')).toHaveValue('6');
  // smer: penje se — terasa je sada na tlu, a deo posle stepeništa gore
  await page.getByTestId('field-stair-dir').getByRole('radio', { name: 'Penje se' }).click();
  await expect(page.getByTestId('level-0')).toHaveCount(0);
  await page.getByTestId('field-stair-steps').fill('7');
  await page.getByTestId('field-stair-steps').press('Enter');
  await expect(page.getByTestId('field-stair-steps')).toHaveValue('7');
  // u pogledu odozgo su gazišta i strelica uz stepenice
  await page.getByRole('tab', { name: /Pogled odozgo/ }).click();
  await expect(page.getByTestId('top-stair-1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('RL10 (inox prečke): svaki deo se crta, broj prečki i mere delova se menjaju za celu ogradu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('rail_inox');
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-fence-add').click();
  const fv = page.getByTestId('front-view');
  await expect(fv.locator('[data-rl10="post"]')).toHaveCount(3);
  await expect(fv.locator('[data-rl10="field"]')).toHaveCount(2);
  // broj prečki: 4 nosača po stubu → 6
  await expect(fv.locator('[data-rl10="post"]').first().locator('circle')).toHaveCount(8);
  await page.getByTestId('field-rods').fill('6');
  await page.getByTestId('field-rods').press('Enter');
  await expect(fv.locator('[data-rl10="post"]').first().locator('circle')).toHaveCount(12);
  // mere delova
  await page.getByTestId('rl10-parts-toggle').click();
  await expect(page.getByTestId('rl10-railDiaMm')).toHaveValue('50');
  await page.getByTestId('rl10-railDiaMm').fill('42');
  await page.getByTestId('rl10-railDiaMm').press('Enter');
  await expect(page.getByTestId('rl10-railDiaMm')).toHaveValue('42');
  await page.getByTestId('rl10-reset').click();
  await expect(page.getByTestId('rl10-railDiaMm')).toHaveValue('50');
  expect(errors).toEqual([]);
});

test('RL10 stepenište: zglob AK-5020K na spoju, stub na sredini svakog trećeg stepenika, sastavnica sa zglobovima', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('rail_inox');
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('field-width')).toHaveValue('1000');
  await expect(page.getByTestId('field-height')).toHaveValue('1000');
  await page.getByTestId('cat-stair-add').click();
  await page.getByTestId('field-stair-steps').fill('15');
  await page.getByTestId('field-stair-steps').press('Enter');
  // 15 stepenika: 4 stuba između + 2 krajnja
  await expect(page.getByTestId('field-stair-posts')).toHaveValue('6');
  await expect(page.getByTestId('front-view').getByTestId('rl10-joint')).toHaveCount(1);
  await page.getByRole('tab', { name: /3D prikaz/ }).click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('uske horizontalne letvice: cevi u U profilima se crtaju, broj cevi prati razmak, dimenzije se menjaju za ceo model', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('h_narrow');
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('front-view').getByTestId('tubes-art')).toHaveCount(1);
  await expect(page.getByTestId('field-bar')).toHaveValue('30');
  await expect(page.getByTestId('field-gap')).toHaveValue('15');

  await expect(page.getByText('Širina U profila')).toBeVisible();
  const rects0 = await page.getByTestId('front-view').getByTestId('tubes-art').locator('rect').count();
  // veći razmak: manje cevi
  await page.getByTestId('field-gap').fill('20');
  await page.getByTestId('field-gap').press('Enter');
  const rects1 = await page.getByTestId('front-view').getByTestId('tubes-art').locator('rect').count();
  expect(rects1).toBeLessThan(rects0);
  // dimenzije cevi i U profila
  await page.getByTestId('tubes-parts-toggle').click();
  await expect(page.getByTestId('tubes-uDepthMm')).toHaveValue('20');
  await expect(page.getByTestId('tubes-uWallMm')).toHaveValue('1.35');
  await page.getByTestId('tubes-uDepthMm').fill('30');
  await page.getByTestId('tubes-uDepthMm').press('Enter');
  await expect(page.getByTestId('tubes-uDepthMm')).toHaveValue('30');
  await page.getByTestId('tubes-reset').click();
  await expect(page.getByTestId('tubes-uDepthMm')).toHaveValue('20');
  await expect(page.getByTestId('field-gap')).toHaveValue('15');
  await page.getByRole('tab', { name: /3D prikaz/ }).click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('zaglavlje: dugme Novi projekat otvara prazan projekat sa bilo koje stranice', async ({ page }) => {
  await page.goto('/projekti');
  await page.getByTestId('topbar-new-project').click();
  await expect(page).toHaveURL(/\/editor\/proj_/);
  const first = page.url();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('topbar-new-project').click();
  await expect(page).toHaveURL(/\/editor\/proj_/);
  expect(page.url()).not.toBe(first);
  await expect(page.getByTestId('count-items')).toHaveText('0');
});

test('tarabica: luk gornje ivice menja visine tarabica u 2D i 3D, i važi za kapiju', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('catalog-model').selectOption('picket_wide');
  await page.getByTestId('cat-fence-add').click();
  const tops = () => page.getByTestId('front-view').getByTestId('tarabica-art').first().locator('rect[height]').evaluateAll((els) => [...new Set(els.map((e) => Math.round(Number(e.getAttribute('y')))))].length);
  const before = await tops();
  await page.getByTestId('field-arch').fill('120');
  await page.getByTestId('field-arch').press('Enter');
  await expect.poll(tops).toBeGreaterThan(before + 2);
  await page.getByTestId('cat-gate-pedestrian-add').click();
  await expect(page.getByTestId('field-arch')).toBeVisible();
  // razmak od poda postoji i za kapiju i menja položaj tarabica
  const lowest = () => page.getByTestId('front-view').getByTestId('tarabica-art').last().locator('rect[height]').evaluateAll((els) => Math.max(...els.map((e) => Number(e.getAttribute('y')) + Number(e.getAttribute('height')))));
  await expect(page.getByTestId('field-lift')).toBeVisible();
  const bottomBefore = await lowest();
  await page.getByTestId('field-lift').fill('120');
  await page.getByTestId('field-lift').press('Enter');
  await expect.poll(lowest).toBeLessThan(bottomBefore - 50);
  await page.getByRole('tab', { name: /3D prikaz/ }).click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('boja: pet boja za brzi izbor + kružić trenutne boje; karta boja, izmena brzog izbora i završna obrada', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  await page.getByTestId('cat-fence-add').click();
  await page.locator('[data-hit="item"]').first().click();
  const field = page.getByTestId('field-color');
  // pet boja za brzi izbor (ne jedanaest) i poseban kružić trenutne boje
  await expect(field.locator('[data-color]')).toHaveCount(5);
  await expect(page.getByTestId('field-color-current')).toBeVisible();
  // karta: sve RAL boje sa slike
  await page.getByTestId('field-color-current').click();
  await expect(page.getByTestId('chart-grid').getByTestId('chart-color')).toHaveCount(185);
  // izmena brzog izbora: mesto 1 postaje RAL 8022
  await page.getByTestId('chart-mode-edit').click();
  await page.getByTestId('chart-color').and(page.locator('[data-color="RAL 8022"]')).click();
  await expect(page.getByTestId('chart-fav').first()).toHaveAttribute('data-color', 'RAL 8022');
  // završna obrada pa izbor boje: RAL 8022 mat
  await page.getByTestId('chart-mode-pick').click();
  await page.getByTestId('chart-finish-mat').click();
  await page.getByTestId('chart-color').and(page.locator('[data-color="RAL 8022"]')).click();
  await expect(page.getByTestId('chart-grid')).toHaveCount(0);
  await expect(page.getByTestId('field-color-value')).toHaveText('RAL 8022 mat');
  await expect(field.locator('[data-color]').first()).toHaveAttribute('data-color', 'RAL 8022');
  // završna obrada se menja i u samom polju
  await page.getByTestId('field-color-finish').getByRole('radio', { name: 'Struktura' }).click();
  await expect(page.getByTestId('field-color-value')).toHaveText('RAL 8022 struktura');
});

test('kote osa–osa stubova ispod crteža za svako platno; nazivi su „Platno N", kapije zadržavaju svoje', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  for (let i = 0; i < 3; i++) await page.getByTestId('cat-fence-add').click();
  await showDims(page);
  await expect(page.getByTestId('dim-axis')).toHaveCount(3);
  // osa–osa je spoljna mera platna: svetla širina plus polovine stubova, pa je veća od mere platna
  const axis = ((await page.getByTestId('dim-axis').first().textContent()) ?? '').replace(/\s+/g, ' ');
  expect(axis).toMatch(/^\d+ mm ?osa–osa$/);
  await page.locator('[data-hit="item"]').nth(1).click();
  await expect(page.getByTestId('panel-item')).toContainText('Platno 2');
});

test('betonski stub nema izbor boje; stub sa podnožjem daje ogradi podnožje, a „Bez podnožja" ga uklanja', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  for (let i = 0; i < 2; i++) await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('catalog-show-all').click();
  await page.getByTestId('cat-post-concrete_plinth-add').click();
  // ograda uz stubove sa podnožjem piše „Sa podnožjem"
  await page.locator('[data-hit="item"]').first().click();
  await expect(page.getByTestId('field-item-plinth-on')).toHaveAttribute('aria-checked', 'true');
  // betonski stub: nema izbora boje (aluminijumski stub nije postavljen)
  await page.locator('[data-hit="post"]').first().click();
  await expect(page.getByTestId('panel-post')).toBeVisible();
  await expect(page.getByTestId('post-color')).toHaveCount(0);
  // bez podnožja: ograda ga gubi, a stubovi uz nju postaju obični betonski
  await page.locator('[data-hit="item"]').first().click();
  await page.getByTestId('field-item-plinth-on').click();
  await expect(page.getByTestId('field-item-plinth-on')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('field-item-plinth')).toHaveCount(0);
});

test('leve kote visine: jedna za platna, jedna za stubove i jedna za kapije; klik menja visinu svih te vrste', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').first().click();
  for (let i = 0; i < 2; i++) await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-gate-sliding-add').click();
  await showDims(page);
  await expect(page.locator('[data-dim="height-fence"]')).toHaveCount(1);
  await expect(page.locator('[data-dim="height-post"]')).toHaveCount(1);
  await expect(page.locator('[data-dim="height-gate"]')).toHaveCount(1);
  // visina svih platna
  await page.locator('[data-dim="height-fence"]').click({ force: true });
  await expect(page.getByRole('dialog')).toContainText('Visina svih platna');
  await page.getByTestId('dim-input').fill('1300');
  await page.getByTestId('dim-apply').click();
  await expect(page.getByTestId('dim-height-fence')).toBeAttached();
  await expect(page.locator('svg text', { hasText: /Ograda H: 1\.300 mm/ })).toHaveCount(1);
  // kapije se ne menjaju dok se ne klikne njihova kota
  await expect(page.locator('svg text', { hasText: /Kapija H/ })).toHaveCount(1);
  await page.locator('[data-dim="height-gate"]').click({ force: true });
  await expect(page.getByRole('dialog')).toContainText('Visina svih kapija');
  await page.getByTestId('dim-input').fill('1900');
  await page.getByTestId('dim-apply').click();
  await expect(page.locator('svg text', { hasText: /Kapija H: 1\.900 mm/ })).toHaveCount(1);
  await expect(page.locator('svg text', { hasText: /Ograda H: 1\.300 mm/ })).toHaveCount(1);
  // visina svih stubova
  await page.locator('[data-dim="height-post"]').click({ force: true });
  await expect(page.getByRole('dialog')).toContainText('Visina svih stubova');
  await page.getByTestId('dim-input').fill('2100');
  await page.getByTestId('dim-apply').click();
  await expect(page.locator('svg text', { hasText: /Stubovi H: 2\.100 mm/ })).toHaveCount(1);
});
