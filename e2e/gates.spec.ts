import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * Mere kapije kroz aplikaciju: dvokrilna i samonoseća sa ručnim merama, prazan cenovnik, snimanje i ponovno otvaranje,
 * šablon sačuvan na jednom poslu i učitan na novom, nova verzija šablona ne menja raniji posao.
 */

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

async function newProjectWithGate(page: Page, type: 'double' | 'sliding' | 'single') {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await expect(page).toHaveURL(/\/editor\/proj_/);
  await page.getByTestId(`cat-gate-${type}-add`).click();
  await page.locator('[data-hit="item"]').last().click();
  await page.getByTestId('btn-gate-design').click();
  await expect(page.getByTestId('gate-design')).toBeVisible();
}

async function setDim(page: Page, key: string, value: string) {
  const f = page.getByTestId(`gd-${key}`);
  await f.fill(value);
  await f.press('Enter');
}

const val = (page: Page, key: string) => page.getByTestId(`gd-${key}`);

async function save(page: Page) {
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('btn-save')).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
}

test('dvokrilna: ručne mere, prazan cenovnik, okov bez šifre, dodatna kota, ponovno otvaranje i potvrda', async ({ page }) => {
  const errors = trackErrors(page);
  await newProjectWithGate(page, 'double');

  // svetli otvor 4000, zazori 25 / 10 / 25 → krila 1970 + 1970
  await setDim(page, 'W', '4000');
  await expect(val(page, 'W')).toHaveValue('4000');
  await setDim(page, 'gL', '25');
  await setDim(page, 'gC', '10');
  await setDim(page, 'gR', '25');
  await expect(val(page, 'WL')).toHaveValue('1970');
  await expect(val(page, 'WR')).toHaveValue('1970');
  await expect(page.getByTestId('gd-origin-WL')).toHaveText('proračun');
  await expect(page.getByTestId('gd-origin-gL')).toHaveText('ručni unos');
  await expect(page.getByTestId('sk-dim-WL')).toHaveAttribute('data-value', '1970');

  // zadato levo krilo 1200 → desno 2740
  await setDim(page, 'WL', '1200');
  await expect(val(page, 'WR')).toHaveValue('2740');

  // nejednaki bočni zazori: preslikavanje pokazuje svaki na pravoj strani
  await setDim(page, 'gR', '35');
  await expect(val(page, 'WR')).toHaveValue('2730');
  await page.getByTestId('gd-mirror').click();
  await expect(val(page, 'gL')).toHaveValue('35');
  await expect(val(page, 'gR')).toHaveValue('25');
  await expect(val(page, 'WR')).toHaveValue('1200');
  await expect(page.getByTestId('sk-dim-gL')).toHaveAttribute('data-value', '35');
  await expect(page.getByTestId('sk-dim-gR')).toHaveAttribute('data-value', '25');
  await page.getByTestId('gd-mirror').click();
  await setDim(page, 'gR', '25');
  await expect(val(page, 'WR')).toHaveValue('2740');

  // klik na kotu na crtežu otvara njeno polje
  await page.getByTestId('sk-dim-gC').click();
  await expect(val(page, 'gC')).toBeFocused();

  // šarka bez fabričke šifre sa minimumom B = 8; zazor 7 upozorava i ostaje sačuvan
  await page.getByTestId('gd-tab-delovi').click();
  await page.getByTestId('gd-hw-role').selectOption('hinge_left');
  await page.getByTestId('gd-hw-add').click();
  await page.getByTestId('gd-hw-name-0').fill('Šarka radionice M12');
  const min = page.getByTestId('gd-hw-min-0');
  await min.fill('8'); await min.press('Enter');
  // ručno zadat profil rama
  await page.getByTestId('gd-profile-add').click();
  await page.getByTestId('gd-profile-name-0').fill('Ram 60×40 radionica');
  const face = page.getByTestId('gd-profile-face-0'); await face.fill('60'); await face.press('Enter');
  const kg = page.getByTestId('gd-profile-kg-0'); await kg.fill('1,5'); await kg.press('Enter');
  await page.getByTestId('gd-tab-mere').click();
  await setDim(page, 'gL', '7');
  await expect(page.getByTestId('gd-row-gL')).toContainText('manji od minimuma 8 mm');
  await expect(val(page, 'gL')).toHaveValue('7');
  await expect(val(page, 'WR')).toHaveValue('2758');
  await setDim(page, 'gL', '8');
  await expect(page.getByTestId('gd-row-gL')).not.toContainText('minimuma');
  await setDim(page, 'gL', '7');

  // dodatna kota
  await page.getByTestId('gd-extra-add').click();
  await page.getByTestId('gd-extra-name-0').fill('Bušenje gornje šarke od vrha');
  const xv = page.getByTestId('gd-extra-value-0'); await xv.fill('150'); await xv.press('Enter');

  // sastavnica i krojna lista koriste ručne podatke; donji zazor ostaje nepoznat
  await page.getByTestId('gd-tab-izrada').click();
  await expect(page.getByTestId('gd-cut-len-Levo krilo|horiz')).toHaveAttribute('placeholder', String(1200 - 120));
  await expect(page.getByTestId('gd-cut-len-Desno krilo|horiz')).toHaveAttribute('placeholder', String(2758 - 120));
  await expect(page.getByTestId('gd-cut-table')).toContainText('Ram 60×40 radionica');
  await expect(page.getByTestId('gd-bom')).toContainText('Šarka radionice M12 (bez fabričke šifre)');
  await expect(page.getByTestId('gd-mass-moving')).not.toHaveText('0,0 kg');
  // ručna rezna mera sa razlikom od geometrijske
  const cut = page.getByTestId('gd-cut-len-Levo krilo|horiz'); await cut.fill('1078'); await cut.press('Enter');
  await expect(page.getByTestId('gd-cut-diff-Levo krilo|horiz')).toContainText('-2 mm');
  await page.getByTestId('gd-tab-mere').click();
  await expect(val(page, 'gB')).toHaveValue('');

  // potvrda mera
  await page.getByTestId('gd-tab-provere').click();
  await page.getByTestId('gd-confirm-btn-mere').click();
  await expect(page.getByTestId('gd-confirm-state')).toHaveText('Mere potvrđene');

  // snimanje i ponovno otvaranje projekta
  await page.keyboard.press('Escape');
  await save(page);
  await page.reload();
  await page.locator('[data-hit="item"]').last().click();
  await page.getByTestId('btn-gate-design').click();
  await expect(val(page, 'W')).toHaveValue('4000');
  await expect(val(page, 'WL')).toHaveValue('1200');
  await expect(val(page, 'gL')).toHaveValue('7');
  await expect(val(page, 'WR')).toHaveValue('2758');
  await expect(val(page, 'gB')).toHaveValue('');
  await expect(page.getByTestId('gd-row-gL')).toContainText('manji od minimuma 8 mm');
  await expect(page.getByTestId('gd-extra-name-0')).toHaveValue('Bušenje gornje šarke od vrha');
  await expect(page.getByTestId('gd-confirm-state')).toHaveText('Mere potvrđene');
  await page.getByTestId('gd-tab-izrada').click();
  await expect(page.getByTestId('gd-cut-len-Levo krilo|horiz')).toHaveValue('1078');
  await expect(page.getByTestId('gd-bom')).toContainText('Šarka radionice M12');

  // potvrda stare konfiguracije ne važi za promenjenu
  await page.getByTestId('gd-tab-mere').click();
  await setDim(page, 'gC', '12');
  await expect(page.getByTestId('gd-confirm-state')).toContainText('ne važi');

  // PDF mera kapije
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('gd-pdf').click()]);
  const pdf = fs.readFileSync((await dl.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  // krojna lista projekta (proizvodnja) sadrži ram kapije
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('dvokrilna: zadate obe širine i bočni zazori → srednji zazor 30; ručnih 10 daje razliku 20 i izbor kote', async ({ page }) => {
  await newProjectWithGate(page, 'double');
  await setDim(page, 'W', '4000');
  await setDim(page, 'gL', '25');
  await setDim(page, 'gR', '25');
  await setDim(page, 'WL', '1950');
  await page.getByTestId('gd-solve-double').selectOption('gC');
  await setDim(page, 'WR', '1970');
  await page.getByTestId('gd-solve-double').selectOption('gC');
  await expect(val(page, 'gC')).toHaveValue('30');
  await expect(page.getByTestId('gd-origin-gC')).toHaveText('proračun');
  await setDim(page, 'gC', '10');
  await expect(page.getByTestId('gd-conflict-double')).toContainText('Odstupanje 20 mm');
  await expect(val(page, 'gC')).toHaveValue('10');
  await page.getByTestId('gd-fix-double-WR').click();
  await expect(val(page, 'WR')).toHaveValue('1990');
  await expect(page.getByTestId('gd-conflict-double')).toHaveCount(0);
});

test('samonoseća: L 5500, Pmin 5600, nedostaje 100 mm, preslikano iste dužine, hod i kolica', async ({ page }) => {
  const errors = trackErrors(page);
  await newProjectWithGate(page, 'sliding');
  await expect(page.getByTestId('gd-slide')).toHaveValue('cantilever');
  await setDim(page, 'W', '4000');
  for (const [k, v] of [['a', '50'], ['b', '50'], ['T', '1400'], ['e', '0'], ['S', '4050'], ['R', '100'], ['P', '5500']]) await setDim(page, k, v);
  await expect(val(page, 'L')).toHaveValue('5500');
  // Enter prelazi na sledeće polje; izračunata kota kroz koju se prođe ostaje izračunata (ne upisuje se kao ručna)
  await expect(page.getByTestId('gd-origin-L')).toHaveText('proračun');
  const tField = val(page, 'T');
  await tField.fill('1400'); await tField.press('Enter');
  await expect(val(page, 'L')).toBeFocused();
  await page.getByTestId('gd-tab-mere').click();
  await expect(page.getByTestId('gd-origin-L')).toHaveText('proračun');
  await expect(page.getByTestId('gd-Pmin')).toHaveText('5600 mm');
  await expect(page.getByTestId('gd-shortfall')).toHaveText('100 mm');
  await expect(page.getByTestId('gd-issues')).toContainText('Nedostaje 100 mm prostora na strani otvaranja');
  await setDim(page, 'P', '5600');
  await expect(page.getByTestId('gd-shortfall')).toHaveText('0 mm');
  await expect(page.getByTestId('gd-issues')).not.toContainText('Nedostaje 100 mm');
  // otvaranje ulevo: iste dužine, skica preslikana
  await page.getByTestId('gd-opening').selectOption('left');
  await expect(val(page, 'L')).toHaveValue('5500');
  await expect(page.getByTestId('gd-Pmin')).toHaveText('5600 mm');
  await expect(page.getByTestId('gate-sketch')).toContainText('otvaranje ulevo');
  // hod manji od 4050 ne oslobađa otvor
  await setDim(page, 'S', '4000');
  await expect(page.getByTestId('gd-row-S')).toContainText('ne oslobađa ceo otvor');
  await setDim(page, 'S', '4050');
  // ručni razmak kolica: računa se položaj drugih kolica
  await setDim(page, 't1', '300');
  await page.getByTestId('gd-solve-trolley').selectOption('t2');
  await setDim(page, 'tD', '900');
  await expect(val(page, 't2')).toHaveValue('1200');
  await expect(page.getByTestId('gd-origin-t2')).toHaveText('proračun');
  // krojna lista: noseći profil = L, rep po √(T² + H²)
  await page.getByTestId('gd-tab-izrada').click();
  await expect(page.getByTestId('gd-cut-len-Pokretni sklop|carrier')).toHaveAttribute('placeholder', '5500');
  expect(errors).toEqual([]);
});

test('šablon: sačuvaj ručne kote, pravilo i deo; ponovo pokreni; učitaj na novom poslu sa drugim otvorom; nova verzija ne menja stari posao', async ({ page }) => {
  await newProjectWithGate(page, 'double');
  const firstUrl = page.url();
  await setDim(page, 'W', '4000');
  await setDim(page, 'gL', '25');
  await setDim(page, 'gC', '10');
  await setDim(page, 'gR', '25');
  await setDim(page, 'WL', '1200');
  await page.getByTestId('gd-tab-delovi').click();
  await page.getByTestId('gd-profile-add').click();
  await page.getByTestId('gd-profile-name-0').fill('Moj ram 50×50');
  const face = page.getByTestId('gd-profile-face-0'); await face.fill('50'); await face.press('Enter');
  await page.getByTestId('gd-tab-sabloni').click();
  await page.getByTestId('gd-tpl-name').fill('Dvokrilna ALU TIM');
  await page.getByTestId('gd-tpl-save').click();
  await expect(page.getByTestId('gd-tpl-msg')).toContainText('sačuvan (v1)');
  await expect(page.getByTestId('gd-template-ref')).toContainText('v1');
  await page.keyboard.press('Escape');
  await save(page);

  // ponovno pokretanje aplikacije
  await page.reload();
  await newProjectWithGate(page, 'double');
  await setDim(page, 'W', '3500');
  await page.getByTestId('gd-tab-sabloni').click();
  await expect(page.getByTestId('gd-tpl-row')).toContainText('Dvokrilna ALU TIM');
  await page.getByTestId('gd-tpl-apply').click();
  await page.getByTestId('gd-tab-mere').click();
  await expect(val(page, 'WL')).toHaveValue('1200');
  await expect(page.getByTestId('gd-origin-WL')).toHaveText('šablon');
  await expect(val(page, 'WR')).toHaveValue(String(3500 - 25 - 10 - 25 - 1200));
  await expect(page.getByTestId('gd-template-ref')).toContainText('v1');
  await page.getByTestId('gd-tab-izrada').click();
  await expect(page.getByTestId('gd-cut-table')).toContainText('Moj ram 50×50');
  // nova verzija šablona sa drugim srednjim zazorom
  await page.getByTestId('gd-tab-mere').click();
  await setDim(page, 'gC', '20');
  await page.getByTestId('gd-tab-sabloni').click();
  await page.getByTestId('gd-tpl-version').click();
  await expect(page.getByTestId('gd-tpl-msg')).toContainText('v2');
  await page.keyboard.press('Escape');
  await save(page);

  // prvi posao zadržava svoje mere i verziju šablona
  await page.goto(firstUrl);
  await page.locator('[data-hit="item"]').last().click();
  await page.getByTestId('btn-gate-design').click();
  await expect(val(page, 'gC')).toHaveValue('10');
  await expect(val(page, 'WR')).toHaveValue('2740');
  await expect(page.getByTestId('gd-template-ref')).toContainText('v1');
});
