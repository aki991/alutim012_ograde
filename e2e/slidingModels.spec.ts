import { expect, test, type Page } from '@playwright/test';
import { SEED_MATERIALS } from '../src/tests/fixtures/materials';

/**
 * Klizne kapije u crtanju modela: Doradi polazne varijante otvara crtanje modela (ram, U-profili i prečke su crtež, kao kod
 * ostalih kapija), a klizni okov se postavlja dugmićima i podešava (veličina, prvi od početka, razmak, broj, okov iz cenovnika).
 * Klizna kapija se pravi i od nule. Model se koristi u projektu: krilo je crtež modela, okov iz modela, sastavnica piše „nije definisano“.
 */

/** cenovnik je u novoj instalaciji prazan: upisuje se probni cenovnik u lokalnu bazu (isto kao u editor.spec.ts) */
async function seedMaterials(page: import('@playwright/test').Page, path = '/materijali') {
  await page.goto('/');
  await page.waitForSelector('[data-testid="hero"]');
  await page.evaluate(async (mats) => {
    localStorage.setItem('alutim.modelMaterialsV1', '1'); // bez automatskog dodavanja materijala modela
    const open = () => new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('alu-tim-012'); r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result); });
    const get = (db: IDBDatabase, store: string, key: string) => new Promise<unknown>((resolve, reject) => { const r = db.transaction([store]).objectStore(store).get(key); r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result); });
    const db = await open();
    // početni upis aplikacije mora da se završi pre našeg (inače bi obrisao naše materijale)
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
  }, SEED_MATERIALS.map((m) => ({ ...m, demo: false }))); // „demo" ugrađeni materijali se pri učitavanju brišu, pa se upisuju kao obični
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

/** izbor materijala iz liste (dugme + lista sa pretragom) */
async function pickMaterial(page: Page, testId: string, text: string | RegExp) {
  await page.getByTestId(testId).click();
  await page.getByTestId(`${testId}-option`).filter({ hasText: text }).first().click();
}

const overlay = (page: Page) => page.getByTestId('designer-overlay');
const wheelCx = (page: Page) => overlay(page).locator('[data-sliding-part="wheels"] circle').evaluateAll((els) => els.map((e) => Number(e.getAttribute('cx'))));

test('Doradi klizne kapije: crtanje modela sa kliznim okovom, podešavanje točkića, okov iz cenovnika, model u projektu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  for (const id of ['klizna_sina_rucna', 'klizna_sina_motorna', 'samonoseca_rucna', 'samonoseca_motorna']) await expect(page.getByTestId(`basic-sliding-${id}`)).toBeVisible();

  await page.getByTestId('rework-sliding-klizna_sina_motorna').click();
  await expect(page).toHaveURL(/\/modeli\/crtanje\/cm_/);
  await expect(page.getByTestId('model-designer')).toBeVisible();
  // sva podešavanja obične kapije: tip, Mere kapije, ram, mere, boja
  await expect(page.getByTestId('designer-gate-type')).toHaveValue('sliding');
  await expect(page.getByTestId('designer-gate-measures')).toBeVisible();
  await expect(page.getByTestId('designer-add-frame')).toBeVisible();
  await expect(page.getByTestId('designer-name')).toHaveValue('Klizna na šini · motorna');
  // krilo je crtež (delovi iz cenovnika), okov preko njega
  expect(await page.locator('[data-testid="designer-2d"] [data-part-id]').count()).toBeGreaterThan(4);
  await expect(page.getByTestId('designer-sliding-bar')).toBeVisible();
  for (const k of ['wheels', 'rail', 'upperGuide', 'catch', 'stop', 'rack', 'motor']) await expect(page.getByTestId(`sl-add-${k}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay(page).locator('[data-sliding-part="wheels"]')).toHaveCount(1);
  await expect(overlay(page).locator('[data-sliding-part="frame"]')).toHaveCount(0);

  // točkići: veličina, prvi od početka, razmak, broj
  await page.getByTestId('sl-add-wheels').click();
  await expect(page.getByTestId('sliding-designer-part')).toContainText('Donji točkići');
  await setNum(page, 'sl-dim-wheelDiameter', '50');
  await expect.poll(async () => Number(await overlay(page).locator('[data-sliding-part="wheels"] circle').first().getAttribute('r'))).toBe(25);
  await setNum(page, 'sl-dim-wheel.count', '3');
  await setNum(page, 'sl-dim-wheel.gap', '800');
  await setNum(page, 'sl-pos-wheel1', '300');
  await expect.poll(() => wheelCx(page)).toEqual([300, 1100, 1900]);

  // okov iz cenovnika: novi okov se upisuje u materijale; bez izbora piše „nije definisano“
  await expect(page.getByTestId('sl-mat-wheels')).toContainText('— izaberite iz cenovnika —');
  await page.getByTestId('sl-mat-wheels-text').fill('Točkić Ø50 sa nosačem');
  await page.getByTestId('sl-mat-wheels-add').click();
  await expect(page.getByTestId('sl-mat-wheels')).toContainText('Točkić Ø50 sa nosačem');

  // uklanjanje i ponovno postavljanje dela
  await page.getByTestId('sl-add-stop').click();
  await page.getByTestId('sl-remove-stop').click();
  await expect(overlay(page).locator('[data-sliding-part="stop"]')).toHaveCount(0);
  await expect(page.getByTestId('sl-add-stop')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('sl-add-stop').click();
  await expect(overlay(page).locator('[data-sliding-part="stop"]')).toHaveCount(1);

  // klik na deo okova na crtežu otvara njegova podešavanja
  await page.getByTestId('sliding-designer-part-close').click();
  await overlay(page).locator('[data-sliding-part="rail"] rect').first().dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
  await expect(page.getByTestId('sliding-designer-part')).toContainText('Podna šina');

  // okov u sastavnici modela: točkić definisan, ostalo „nije definisano“
  await page.getByTestId('sliding-designer-part-close').click();
  await expect(page.getByTestId('sl-hw-bom-wheels')).toContainText('Točkić Ø50 sa nosačem');
  await expect(page.getByTestId('sl-hw-bom-catch')).toContainText('nije definisano');

  // model se čuva i koristi u projektu: krilo iz crteža, okov iz modela
  await page.waitForTimeout(800);
  await page.getByTestId('designer-back').click();
  const card = page.getByTestId('gate-model-card').filter({ hasText: 'Klizna na šini · motorna' });
  await expect(card).toHaveCount(1);
  await card.getByTestId('use-gate-model').click();
  await expect(page).toHaveURL(/\/editor\/proj_/);
  const fv = page.getByTestId('front-view');
  await expect(fv.locator('[data-testid="sliding-assembly"]')).toHaveCount(1);
  await expect(fv.locator('[data-sliding-part="leaf"]')).toHaveCount(1);
  await expect(fv.locator('[data-sliding-part="wheels"] circle')).toHaveCount(3);
  await page.getByTestId('tab-bom').click();
  const bom = page.getByTestId('bom-table');
  await expect(bom).toContainText('Točkić Ø50 sa nosačem');
  await expect(bom).toContainText('Prihvatnik krila (klizna kapija) — nije definisano');
  expect(errors).toEqual([]);
});

test('klizna kapija od nule: tip kapije Klizna, delovi se postavljaju klikom', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('btn-create-gate-model').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('designer-gate-type').selectOption('sliding');
  await expect(page.getByTestId('designer-sliding-bar')).toBeVisible();
  await expect(page.getByTestId('sl-add-wheels')).toHaveAttribute('aria-pressed', 'false');
  await expect(overlay(page).locator('[data-sliding-part]')).toHaveCount(0);
  await page.getByTestId('sl-add-wheels').click();
  await expect(overlay(page).locator('[data-sliding-part="wheels"]')).toHaveCount(1);
  await page.getByTestId('sliding-designer-part-close').click();
  await page.getByTestId('sl-add-upperGuide').click();
  await page.getByTestId('sl-add-stop').click();
  await expect(overlay(page).locator('[data-sliding-part="upperGuide"]')).toHaveCount(1);
  await expect(overlay(page).locator('[data-sliding-part="stop"]')).toHaveCount(1);
  await expect(overlay(page).locator('[data-sliding-part="rail"]')).toHaveCount(0);
  // samonoseća: dugmad za kolica i C-profil
  await page.getByTestId('sliding-designer-part-close').click();
  await page.getByTestId('sl-support-cantilever').click();
  await expect(page.getByTestId('sl-add-carriages')).toBeVisible();
  await expect(page.getByTestId('sl-add-wheels')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('osnovna klizna kapija se briše sa strane i vraća', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('delete-basic-sliding-samonoseca_rucna').click();
  await page.getByRole('button', { name: 'Obriši', exact: true }).last().click();
  await expect(page.getByTestId('basic-sliding-samonoseca_rucna')).toHaveCount(0);
  await page.getByTestId('restore-basic-gates').click();
  await expect(page.getByTestId('basic-sliding-samonoseca_rucna')).toBeVisible();
  expect(errors).toEqual([]);
});

test('rep samonoseće: profil iz padajućeg menija, ojačanja (bez, uspravno, vodoravno, koso), uglovi sečenja', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('designer-sliding-bar')).toBeVisible();
  await page.getByTestId('sl-add-tail').click();
  await expect(page.getByTestId('sl-tail-editor')).toBeVisible();
  // nema ručnog unosa širine, ni „okov iz cenovnika“ za rep
  await expect(page.getByTestId('sl-dim-tail.beam')).toHaveCount(0);
  await expect(page.getByTestId('sl-dim-tail.diag.w')).toHaveCount(0);
  await expect(page.getByTestId('sl-part-bom-tail')).toHaveCount(0);
  // uglovi sečenja uz cev
  await expect(page.getByTestId('sl-cutinfo-tail-diag')).toContainText('rez pod uglom');
  await expect(page.getByTestId('sl-cutinfo-tail-bottom')).toContainText('90°');
  // profil kosnika iz padajućeg menija
  const polyW = () => overlay(page).locator('[data-sliding-part="tail"] polygon').first().getAttribute('points');
  const before = await polyW();
  await pickMaterial(page, 'sl-profile-tail-diag', '40×40');
  await expect.poll(polyW).not.toBe(before);
  await expect(page.getByTestId('sl-profile-tail-diag')).toContainText('40×40');
  // jedno uspravno ojačanje je polazno; bez ojačanja
  await expect(page.getByTestId('sl-brace-0')).toBeVisible();
  const polys = () => overlay(page).locator('[data-sliding-part="tail"] polygon').count();
  expect(await polys()).toBe(3);
  await page.getByTestId('sl-braces-none').click();
  await expect(page.getByTestId('sl-braces-empty')).toBeVisible();
  expect(await polys()).toBe(2);
  // tri ojačanja kao na stvarnoj kapiji, svako se pomera
  for (const k of ['vertical', 'horizontal', 'diagonal']) await page.getByTestId(`sl-brace-add-${k}`).click();
  expect(await polys()).toBe(5);
  const v0 = await polyW();
  await setNum(page, 'sl-brace-pos-0', '3900');
  expect(await polyW()).toBe(v0);
  await setNum(page, 'sl-brace-pos-1', '500');
  await setNum(page, 'sl-brace-pos2-2', '3700');
  expect(await polys()).toBe(5);
  await page.getByTestId('sl-brace-remove-1').click();
  expect(await polys()).toBe(4);
  expect(errors).toEqual([]);
});

test('noseći C-profil: prvo profil iz padajućeg menija pa dužina; visina dolazi iz izabranog profila', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await page.getByTestId('sl-add-carrier').click();
  const body = page.getByTestId('sl-partbody-carrier');
  await expect(body).toBeVisible();
  await expect(page.getByTestId('sl-dim-carrier.h')).toHaveCount(0);
  // redosled: profil, pa dužina
  const profileY = (await page.getByTestId('sl-profile-carrier').boundingBox())!.y;
  const lengthY = (await page.getByTestId('sl-pos-carrierLength').boundingBox())!.y;
  expect(profileY).toBeLessThan(lengthY);
  const h = () => overlay(page).locator('[data-sliding-part="carrier"] rect').first().getAttribute('height');
  expect(Number(await h())).toBe(80);
  await pickMaterial(page, 'sl-profile-carrier', '30×20');
  await expect.poll(async () => Number(await h())).not.toBe(80);
  expect([20, 30]).toContain(Number(await h()));
  expect(errors).toEqual([]);
});

test('materijal koji nije u cenovniku: ručno upisan naziv, dugme Dodaj, lista sortirana po merama', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await page.getByTestId('sl-add-carrier').click();
  // ručno upisan naziv: čuva se kao stavka, bez izbora iz cenovnika
  await page.getByTestId('sliding-designer-part-close').click();
  await expect(page.getByTestId('sl-hw-bom-carrier')).toContainText('nije definisano');
  await page.getByTestId('sl-add-carrier').click();
  await page.getByTestId('sl-profile-carrier-text').fill('C profil 60x60x2');
  await page.getByTestId('sl-profile-carrier-text').press('Enter');
  await expect(page.getByTestId('sl-profile-carrier-manual')).toContainText('krojnu listu');
  await page.getByTestId('sliding-designer-part-close').click();
  await expect(page.getByTestId('sl-hw-bom-carrier')).toContainText('C profil 60x60x2');
  // „Dodaj“ upisuje materijal u „Materijali i cene“ i bira ga iz liste
  await page.getByTestId('sl-add-carrier').click();
  await page.getByTestId('sl-profile-carrier-add').click();
  await expect(page.getByTestId('sl-profile-carrier')).toContainText('C profil 60x60x2');
  await expect(page.getByTestId('sl-profile-carrier-manual')).toHaveCount(0);
  await page.goto('/materijali');
  await expect(page.getByTestId('materials-table')).toContainText('C profil 60x60x2');
  // posle toga se bira iz liste
  await page.goBack();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('sl-add-carrier').click();
  await page.getByTestId('sl-profile-carrier').click();
  await expect(page.getByTestId('sl-profile-carrier-option').filter({ hasText: 'C profil 60x60x2' })).toHaveCount(1);
  // sortirano po merama od najmanje do najveće (kvadratne cevi: prva mera ne opada)
  const names = await page.getByTestId('sl-profile-carrier-option').allInnerTexts();
  const first = names.map((n) => /Kvadratna cev (\d+)×/.exec(n)?.[1]).filter(Boolean).map(Number);
  expect(first.length).toBeGreaterThan(3);
  expect([...first].sort((a, b) => a - b)).toEqual(first);
  // nema oznake RAL u nazivima materijala
  expect(names.some((n) => /RAL/.test(n))).toBe(false);
  expect(errors).toEqual([]);
});

test('Materijali i cene: dugme Izmeni menja sve mere preseka (C profil otvor 30 → 20), naziv prati mere', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/materijali');
  await expect(page.getByTestId('material-edit').first()).toHaveText('Izmeni');
  await page.getByTestId('btn-add-material').click();
  await page.getByTestId('material-sku').fill('C-60');
  await page.getByTestId('material-name').fill('C profil 60x60x2');
  await expect(page.getByTestId('material-dims')).toBeVisible();
  await expect(page.getByTestId('material-dim-slot')).toHaveValue('30');
  await expect(page.getByTestId('material-preview')).toContainText('otvor = 30');
  await setNum(page, 'material-dim-slot', '20');
  await expect(page.getByTestId('material-preview')).toContainText('otvor = 20');
  // izmena A menja i naziv
  await setNum(page, 'material-dim-a', '50');
  await expect(page.getByTestId('material-name')).toHaveValue('C profil 50×60×2');
  await expect(page.getByTestId('material-preview')).toContainText('A = 50');
  await page.getByTestId('material-save').click();
  const row = page.getByTestId('material-row').filter({ hasText: 'C profil 50×60×2' });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByTestId('material-drawing-row')).toContainText('20 mm');
  // izmena postojećeg materijala; vraćanje mera iz cenovnika
  await row.getByTestId('material-edit').click();
  await expect(page.getByTestId('material-dim-slot')).toHaveValue('20');
  await page.getByTestId('material-dims-reset').click();
  await expect(page.getByTestId('material-dim-slot')).toHaveValue('25');
  expect(errors).toEqual([]);
});
