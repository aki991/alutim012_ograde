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

/** crtež sa okovom: fiksni delovi su ispod krila, pokretni iznad (oba u crtežu modela) */
const overlay = (page: Page) => page.getByTestId('designer-2d');
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

test('3D prikaz: klizna kapija se prikazuje kompletna (krilo + klizni okov), u crtanju modela i u projektu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_motorna').click();
  await expect(page.getByTestId('designer-sliding-bar')).toBeVisible();
  await page.getByTestId('designer-view-3d').click();
  const d3 = page.getByTestId('designer-3d');
  await expect(d3).toBeVisible();
  // delovi okova su u 3D prikazu (C-profil, rep, kolica, vođica, graničnik, letva, motor …)
  expect(Number(await d3.getAttribute('data-hw-parts'))).toBeGreaterThan(8);
  await expect(d3.locator('canvas')).toBeVisible();
  // sklop je na crtežu kao i u 3D: uklanjanje dela smanjuje broj delova
  await page.getByTestId('designer-view-2d').click();
  await page.getByTestId('sl-add-stop').click();
  await page.getByTestId('sl-remove-stop').click();
  await page.getByTestId('designer-view-3d').click();
  expect(Number(await page.getByTestId('designer-3d').getAttribute('data-hw-parts'))).toBeGreaterThan(7);
  // projekat: 3D prikaz sa kapijom iz modela
  await page.getByTestId('designer-back').click();
  await page.getByTestId('use-gate-model').first().click();
  await expect(page).toHaveURL(/\/editor\/proj_/);
  await page.getByTestId('tab-three').click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(800);
  expect(errors.filter((e) => !/WebGL|GPU|swiftshader|ANGLE/i.test(e))).toEqual([]);
});

test('kolica: materijal sa merama koje se menjaju; izbor kolica iz liste prenosi mere u sklop', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/materijali');
  // polazna kolica su u cenovniku, a sve mere se menjaju u „Izmeni“
  const row = page.getByTestId('material-row').filter({ hasText: 'Kolica za samonoseću kapiju 210×100' });
  await expect(row).toHaveCount(1);
  await row.getByTestId('material-edit').click();
  for (const k of ['plateW', 'plateD', 'plateH', 'stemW', 'stemH', 'wheelD', 'wheelGap']) await expect(page.getByTestId(`material-dim-${k}`)).toBeVisible();
  await expect(page.getByTestId('material-dim-wheelD')).toHaveValue('52');
  await setNum(page, 'material-dim-wheelD', '60');
  await page.getByTestId('material-save').click();
  // u crtanju modela se kolica biraju iz padajućeg menija i prenose mere
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await page.getByTestId('sl-add-carriages').click();
  await expect(page.getByTestId('sl-dim-car.wheelD')).toHaveValue('52');
  await pickMaterial(page, 'sl-mat-carriages', '160×100');
  await expect(page.getByTestId('sl-dim-car.plateW')).toHaveValue('160');
  await expect(page.getByTestId('sl-dim-car.wheelD')).toHaveValue('45');
  await pickMaterial(page, 'sl-mat-carriages', '210×100');
  await expect(page.getByTestId('sl-dim-car.wheelD')).toHaveValue('60');
  expect(errors).toEqual([]);
});

test('rep: okretanje pravougaone cevi (čeona strana), uglovi sečenja ostaju, dužine se menjaju', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await page.getByTestId('sl-add-tail').click();
  const polyW = () => overlay(page).locator('[data-sliding-part="tail"] polygon').first().getAttribute('points');
  // kvadratna cev nema izbor čeone strane; pravougaona ima
  await pickMaterial(page, 'sl-profile-tail-diag', '40×40');
  await expect(page.getByTestId('sl-profile-tail-diag-orient')).toHaveCount(0);
  await pickMaterial(page, 'sl-profile-tail-diag', '30×20');
  await expect(page.getByTestId('sl-profile-tail-diag-orient')).toBeVisible();
  await expect(page.getByTestId('sl-profile-tail-diag-orient-0')).toContainText('30 mm');
  await expect(page.getByTestId('sl-profile-tail-diag-orient-90')).toContainText('20 mm');
  const info = () => page.getByTestId('sl-cutinfo-tail-diag').innerText();
  const before = await polyW(); const t0 = await info();
  expect(t0).toContain('čeona strana 30 mm');
  await page.getByTestId('sl-profile-tail-diag-orient-90').click();
  await expect.poll(polyW).not.toBe(before);
  const t1 = await info();
  expect(t1).toContain('čeona strana 20 mm');
  // uglovi sečenja su isti, dužina se promenila
  const angles = (t: string) => /rez pod uglom ([^(]+)/.exec(t)![1].trim();
  expect(angles(t1)).toBe(angles(t0));
  expect(/dužina (\d+) mm/.exec(t1)![1]).not.toBe(/dužina (\d+) mm/.exec(t0)![1]);
  // isto za ojačanje
  await expect(page.getByTestId('sl-brace-0')).toBeVisible();
  await pickMaterial(page, 'sl-brace-profile-0', '30×20');
  await expect(page.getByTestId('sl-brace-profile-0-orient')).toBeVisible();
  expect(errors).toEqual([]);
});

test('crtanje modela: pravougaona cev se okreće čeonom stranom (bez biranja uglova), profil sa otvorom ostaje na uglovima', async ({ page }) => {
  const errors = trackErrors(page);
  await seedMaterials(page, '/modeli');
  await page.getByTestId('rework-model-h_narrow').click();
  await page.getByTestId('designer-part').first().waitFor();
  // ram od pravougaone cevi: čeona strana (dva dugmeta sa merama), a ne uglovi
  await page.getByTestId('designer-add-frame').click();
  await page.getByTestId('frame-material').click();
  await page.getByTestId('frame-material-option').filter({ hasText: '30×20' }).first().click();
  await expect(page.getByTestId('multi-face')).toBeVisible();
  await expect(page.getByTestId('multi-rot-90')).toHaveCount(0);
  await expect(page.getByTestId('multi-face-0')).toContainText('30 mm');
  await expect(page.getByTestId('multi-face-90')).toContainText('20 mm');
  const w0 = Number(await page.getByTestId('designer-width').inputValue());
  await page.getByTestId('multi-face-90').click();
  await expect(page.getByTestId('multi-face-90')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('designer-notice')).toHaveCount(0);
  // ram sa užom čeonom stranom menja ukupnu širinu crteža
  expect(Number(await page.getByTestId('designer-width').inputValue())).toBeLessThan(w0);
  await page.getByTestId('multi-face-0').click();
  expect(Number(await page.getByTestId('designer-width').inputValue())).toBe(w0);
  expect(errors).toEqual([]);
});

test('Modeli kapija: minijatura klizne kapije je crtež krila sa repom, bez zone uvlačenja i fiksnog okova', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('designer-back').click();
  const thumb = page.getByTestId('gate-model-card').first().getByTestId('custom-model-thumb');
  await expect(thumb).toHaveAttribute('data-sliding-thumb', 'true');
  // krilo (delovi crteža) i rep; bez zone uvlačenja, kote i fiksnog okova
  expect(await thumb.locator('[data-part-id]').count()).toBeGreaterThan(4);
  await expect(thumb.locator('[data-sliding-part="tail"]')).toHaveCount(1);
  await expect(thumb.locator('[data-testid="sliding-retract-zone"]')).toHaveCount(0);
  await expect(thumb.locator('[data-testid="sliding-dims"]')).toHaveCount(0);
  await expect(thumb.locator('[data-sliding-part="upperGuide"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('stub vođice: položaj po X se zadaje poljem, podrazumevano prati vođicu, a vrednost ide uz kapiju u projekat', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('sl-add-guidePost').click();
  await expect(page.getByTestId('sliding-designer-part')).toContainText('Stub');
  const post = overlay(page).locator('[data-sliding-part="guidePost"] rect').first();
  const x0 = Number(await post.getAttribute('x'));
  // bez ručne vrednosti stoji uz vođicu: isto X kao vođica
  const guideX = await overlay(page).locator('[data-sliding-part="upperGuide"] rect').first().evaluate((e) => Number(e.getAttribute('x')) + Number(e.getAttribute('width')) / 2);
  const postW = Number(await post.getAttribute('width'));
  expect(Math.abs(x0 + postW / 2 - guideX)).toBeLessThan(1);
  await setNum(page, 'sl-pos-guidePost', '2000');
  await expect(post).not.toHaveAttribute('x', String(x0));
  expect(Math.abs(Number(await post.getAttribute('x')) + postW / 2 - guideX)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('stub prihvatnika: polje za položaj stuba (X) uz prihvatnik, računska vrednost i ručna izmena', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('sl-add-catch').click();
  const f = page.getByTestId('sl-pos-catchPost');
  await expect(f).toBeVisible();
  const auto = Number(await f.inputValue());
  await setNum(page, 'sl-pos-catchPost', '-20');
  await expect(page.getByTestId('sl-pos-state-catchPost')).toContainText('ručno');
  expect(Number(await f.inputValue())).toBe(-20);
  expect(auto).not.toBe(-20);
  expect(errors).toEqual([]);
});

test('rep: svaka cev (kosnik, pojasnica, ojačanja) se bira zasebno, na crtežu i dugmetom, i ističe radi poređenja sa krojnom listom', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('sl-add-tail').click();
  const members = overlay(page).locator('[data-tail-member]');
  expect(await members.count()).toBeGreaterThanOrEqual(3); // kosnik, pojasnica, bar jedno ojačanje
  await expect(overlay(page).locator('[data-tail-member][data-selected="true"]')).toHaveCount(0);
  // dugme „Istakni“ pored podataka o rezu: ističe tu cev na crtežu
  await page.getByTestId('sl-tail-pick-tail-diag').click();
  await expect(overlay(page).locator('[data-tail-member="tail-diag"][data-selected="true"]')).toHaveCount(1);
  await expect(page.getByTestId('sl-cutinfo-tail-diag')).toContainText('Rep');
  // klik na drugu cev na crtežu bira nju
  const brace = overlay(page).locator('[data-tail-member^="tail-brace-"]').first();
  const key = await brace.getAttribute('data-tail-member');
  // pravi klik mišem na tačku koja je zaista unutar cevi (ojačanje je kosa/uska cev)
  const pt = await brace.evaluate((el) => { const r = el.getBoundingClientRect(); for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const x = r.left + (r.width * i) / 40; const y = r.top + (r.height * j) / 40; if (document.elementFromPoint(x, y) === el) return { x, y }; } return null; });
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await expect(overlay(page).locator(`[data-tail-member="${key}"][data-selected="true"]`)).toHaveCount(1);
  await expect(overlay(page).locator('[data-tail-member="tail-diag"][data-selected="true"]')).toHaveCount(0);
  await expect(page.getByTestId(`sl-tail-pick-${key}`)).toHaveAttribute('aria-pressed', 'true');
  // ponovni klik na dugme skida isticanje
  await page.getByTestId(`sl-tail-pick-${key}`).click();
  await expect(overlay(page).locator('[data-tail-member][data-selected="true"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ojačanja repa: vodoravno se vari na koso; vrednost van dozvoljenog raspona se svodi na granicu uz obaveštenje ispod polja', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  await page.getByTestId('sl-add-tail').click();
  await page.getByTestId('sl-brace-add-diagonal').click();
  await page.getByTestId('sl-brace-add-horizontal').click();
  // brace 0 = uspravno, 1 = koso, 2 = vodoravno
  const range = await page.getByTestId('sl-brace-range-2-pos').innerText();
  const max = Number(/–(\d+) mm/.exec(range)![1]);
  await setNum(page, 'sl-brace-pos-2', String(max + 500));
  await expect(page.getByTestId('sl-brace-note-2-pos')).toContainText(`ne može biti veća od ${max} mm`);
  await expect(page.getByTestId('sl-brace-pos-2')).toHaveValue(String(max));
  // vrednost u rasponu: bez obaveštenja
  await setNum(page, 'sl-brace-pos-2', String(max - 100));
  await expect(page.getByTestId('sl-brace-note-2-pos')).toHaveCount(0);
  // manje od najmanje: obaveštenje o donjoj granici
  await setNum(page, 'sl-brace-pos-2', '1');
  await expect(page.getByTestId('sl-brace-note-2-pos')).toContainText('ne može biti manja od');
  expect(errors).toEqual([]);
});

test('podešavanja: štednja materijala se uključuje i pamti, a isto stanje je na stranici Proizvodnja', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/podesavanja');
  const sw = page.getByTestId('set-savematerial');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByTestId('set-savematerial')).toHaveAttribute('aria-checked', 'true');
  await page.goto('/proizvodnja');
  await expect(page.getByTestId('cut-savematerial')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('cut-savematerial').click();
  await expect(page.getByTestId('cut-savematerial')).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(500); // upis u lokalnu bazu
  await page.goto('/podesavanja');
  await expect(page.getByTestId('set-savematerial')).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});

test('meni: dok je otvoren crtež kapije označena je stavka Modeli kapija, a kod crteža ograde Modeli ograda', async ({ page }) => {
  await page.goto('/modeli-kapija');
  await page.getByTestId('rework-sliding-samonoseca_rucna').click();
  await expect(page.getByTestId('model-designer')).toBeVisible();
  const nav = page.locator('aside[aria-label="Glavna navigacija"]').first();
  await expect(nav.getByRole('link', { name: 'Modeli kapija' })).toHaveClass(/bg-accent/);
  await expect(nav.getByRole('link', { name: 'Modeli ograda' })).not.toHaveClass(/bg-accent/);
  // vrsta crteža se promeni u ogradu: označena je stavka Modeli ograda
  await page.getByTestId('designer-kind').selectOption('fence');
  await expect(nav.getByRole('link', { name: 'Modeli ograda' })).toHaveClass(/bg-accent/);
  await expect(nav.getByRole('link', { name: 'Modeli kapija' })).not.toHaveClass(/bg-accent/);
});
