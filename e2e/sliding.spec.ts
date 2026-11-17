import { expect, test, type Page } from '@playwright/test';

/**
 * Klizne kapije kao sklop (references/kapije): četiri varijante iz kataloga, mere i hod, proba hoda koja pomera samo pokretne delove,
 * preslikavanje pri otvaranju ulevo, upozorenje zahvata letve i njegova korekcija, snimanje, šablon kao nezavisna kopija, stara klizna kapija.
 */

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

async function newProject(page: Page) {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await expect(page).toHaveURL(/\/editor\/proj_/);
}

async function setNum(page: Page, testId: string, value: string) {
  const f = page.getByTestId(testId);
  await f.fill(value);
  await f.press('Enter');
}

/** otvara karticu dela u panelu (ako već nije otvorena) */
async function openPart(page: Page, key: string) {
  const t = page.getByTestId(`sl-part-toggle-${key}`);
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
}

async function save(page: Page) {
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('btn-save')).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
}

const fv = (page: Page) => page.getByTestId('front-view');
const box = async (page: Page, part: string) => (await fv(page).locator(`[data-testid="sliding-assembly"] [data-sliding-part="${part}"]`).first().boundingBox())!;

test('četiri varijante iz kataloga: na šini ručna/motorna, samonoseća ručna/motorna', async ({ page }) => {
  const errors = trackErrors(page);
  await newProject(page);
  const ids = ['klizna_sina_rucna', 'klizna_sina_motorna', 'samonoseca_rucna', 'samonoseca_motorna'];
  const titles = ['Na donjoj šini · ručna', 'Na donjoj šini · motorna', 'Samonoseća · ručna', 'Samonoseća · motorna'];
  for (let i = 0; i < ids.length; i++) {
    await page.getByTestId(`cat-sliding-${ids[i]}-add`).click();
    await expect(page.getByTestId('sliding-panel')).toBeVisible();
    await expect(page.getByTestId('sl-variant')).toHaveText(titles[i]);
    await expect(page.getByTestId('sl-width')).toHaveValue('3000');
    await expect(page.getByTestId('sl-height')).toHaveValue('1285');
  }
  await expect(fv(page).locator('[data-testid="sliding-assembly"]')).toHaveCount(4);
  for (const id of ids) await expect(fv(page).locator(`[data-testid="sliding-assembly"][data-variant="${id}"]`)).toHaveCount(1);
  // dugme „Mere kapije“ postoji i uz klizni sklop, kao kod ostalih kapija
  await expect(page.getByTestId('btn-gate-design')).toBeVisible();
  await page.getByTestId('btn-gate-design').click();
  await expect(page.getByTestId('gate-design')).toBeVisible();
  await expect(page.getByTestId('gate-sketch')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('gate-design')).toHaveCount(0);
  // samonoseća: kolica i C-profil; motorna: letva i motor
  await expect(fv(page).locator('[data-variant="samonoseca_motorna"] [data-sliding-part="carrier"]')).toHaveCount(1);
  await expect(fv(page).locator('[data-variant="samonoseca_motorna"] [data-sliding-part="motor"]')).toHaveCount(1);
  await expect(fv(page).locator('[data-variant="klizna_sina_rucna"] [data-sliding-part="rail"]')).toHaveCount(1);
  await expect(fv(page).locator('[data-variant="klizna_sina_rucna"] [data-sliding-part="motor"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('motorna na šini: mere i hod, proba hoda, preslikavanje, upozorenje letve i korekcija, snimanje', async ({ page }) => {
  const errors = trackErrors(page);
  await newProject(page);
  await page.getByTestId('cat-sliding-klizna_sina_motorna-add').click();
  await expect(page.getByTestId('sliding-panel')).toBeVisible();

  // demo podaci: na punom otvaranju zupčanik je 15 mm van letve
  await expect(page.getByTestId('sl-check-rack')).toHaveAttribute('data-level', 'warn');
  await expect(page.getByTestId('sl-check-rack')).toContainText('15 mm van letve');
  // svetli otvor nije izmeren: provera čeka merenje
  await expect(page.getByTestId('sl-check-passage')).toHaveAttribute('data-level', 'pending');

  // proba hoda: pomeraju se samo pokretni delovi (ram, letva), vođica i motor stoje
  const frame0 = await box(page, 'leaf'); const guide0 = await box(page, 'upperGuide'); const motor0 = await box(page, 'motor');
  await page.getByTestId('sl-slider').fill('100');
  await expect(fv(page).locator('[data-testid="sliding-assembly"]')).toHaveAttribute('data-pct', '100');
  const frame1 = await box(page, 'leaf'); const guide1 = await box(page, 'upperGuide'); const motor1 = await box(page, 'motor');
  expect(frame1.x).toBeGreaterThan(frame0.x + 50);
  expect(Math.abs(guide1.x - guide0.x)).toBeLessThan(1);
  expect(Math.abs(motor1.x - motor0.x)).toBeLessThan(1);
  await page.getByTestId('sl-half').click();
  const frameHalf = await box(page, 'leaf');
  expect(Math.abs(frameHalf.x - (frame0.x + frame1.x) / 2)).toBeLessThan(2);

  // otvaranje ulevo: ceo sklop se preslikava, krilo na probi hoda ide ulevo
  await page.getByTestId('sl-closed').click();
  await page.getByTestId('sl-opening-left').click();
  await expect(fv(page).locator('[data-testid="sliding-assembly"]')).toHaveAttribute('data-opening', 'left');
  const l0 = await box(page, 'leaf');
  await page.getByTestId('sl-open').click();
  const l1 = await box(page, 'leaf');
  expect(l1.x).toBeLessThan(l0.x - 50);
  await page.getByTestId('sl-closed').click();

  // korekcija: letva počinje na X 30 i duga je 2.950 mm → zahvat kroz ceo hod
  await openPart(page, 'rack');
  await setNum(page, 'sl-pos-rackStart', '30');
  await expect(page.getByTestId('sl-pos-state-rackStart')).toContainText('ručno');
  await setNum(page, 'sl-dim-rackLength', '2950');
  await expect(page.getByTestId('sl-check-rack')).toHaveAttribute('data-level', 'ok');

  // promena širine rama preračunava vođicu, šinu i zupčanik; hod se menja nezavisno
  await setNum(page, 'sl-width', '3500');
  await openPart(page, 'upperGuide'); await openPart(page, 'rail'); await openPart(page, 'stop');
  await expect(page.getByTestId('sl-pos-upperGuide')).toHaveValue('3440');
  await expect(page.getByTestId('sl-pos-railLength')).toHaveValue('7500');
  await setNum(page, 'sl-travel', '3400');
  await expect(page.getByTestId('sl-travel')).toHaveValue('3400');
  await expect(page.getByTestId('sl-pos-stop')).toHaveValue(String(3500 + 3400 + 30));
  await setNum(page, 'sl-height', '1400');
  await expect(page.getByTestId('sl-height')).toHaveValue('1400');
  // svetli otvor izmeren
  await setNum(page, 'sl-clearOpening', '3300');
  await expect(page.getByTestId('sl-check-passage')).toHaveAttribute('data-level', 'ok');

  // snimanje i ponovno otvaranje: sve mere i ručna pozicija ostaju
  await save(page);
  await page.reload();
  await page.locator('[data-hit="item"]').last().click();
  await expect(page.getByTestId('sliding-panel')).toBeVisible();
  await expect(page.getByTestId('sl-width')).toHaveValue('3500');
  await expect(page.getByTestId('sl-travel')).toHaveValue('3400');
  await expect(page.getByTestId('sl-height')).toHaveValue('1400');
  await expect(page.getByTestId('sl-clearOpening')).toHaveValue('3300');
  await expect(fv(page).locator('[data-testid="sliding-assembly"]')).toHaveAttribute('data-opening', 'left');
  await openPart(page, 'rack');
  await expect(page.getByTestId('sl-pos-rackStart')).toHaveValue('30');
  await expect(page.getByTestId('sl-pos-state-rackStart')).toContainText('ručno');
  expect(errors).toEqual([]);
});

test('promena oslonca i pogona menja samo pripadajuće delove; šablon je nezavisna kopija', async ({ page }) => {
  const errors = trackErrors(page);
  await newProject(page);
  await page.getByTestId('cat-sliding-samonoseca_rucna-add').click();
  await expect(fv(page).locator('[data-sliding-part="handle"]')).toHaveCount(1);
  await page.getByTestId('sl-actuation-motor').click();
  await expect(page.getByTestId('sl-variant')).toHaveText('Samonoseća · motorna');
  await expect(fv(page).locator('[data-sliding-part="handle"]')).toHaveCount(0);
  await expect(fv(page).locator('[data-sliding-part="motor"]')).toHaveCount(1);
  await expect(fv(page).locator('[data-sliding-part="carrier"]')).toHaveCount(1);
  await page.getByTestId('sl-support-ground_rail').click();
  await expect(fv(page).locator('[data-sliding-part="carrier"]')).toHaveCount(0);
  await expect(fv(page).locator('[data-sliding-part="rail"]')).toHaveCount(1);
  await expect(fv(page).locator('[data-sliding-part="motor"]')).toHaveCount(1);
  await page.getByTestId('sl-support-cantilever').click();
  await setNum(page, 'sl-travel', '2800');

  // šabloni klizne kapije više ne postoje
  await expect(page.getByTestId('sl-template')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('stara klizna kapija (bez sklopa) radi kao ranije', async ({ page }) => {
  const errors = trackErrors(page);
  await newProject(page);
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('add-end').click({ force: true });
  await page.getByTestId('add-kind-sliding').click();
  await page.getByTestId('add-apply').click();
  await page.locator('[data-hit="item"]').last().click();
  await expect(page.getByTestId('sliding-panel')).toHaveCount(0);
  await expect(page.getByTestId('btn-gate-design')).toBeVisible();
  await expect(fv(page).locator('[data-testid="sliding-assembly"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
