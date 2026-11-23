import { expect, test } from '@playwright/test';

test('radni prostor: sklopivi meni, katalog i svojstva na užem i širem ekranu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1160, height: 900 });
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  const nav = page.getByTestId('main-navigation');
  await expect(nav).toHaveAttribute('data-compact', 'true');
  await page.getByTestId('toggle-navigation').click();
  await expect(nav).toHaveAttribute('data-compact', 'false');
  await page.getByTestId('toggle-navigation').click();
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('toggle-catalog')).toHaveText('Sakrij elemente');
  await page.getByTestId('toggle-catalog').click();
  await expect(page.getByTestId('catalog')).toBeHidden();
  await expect(page.getByTestId('toggle-catalog')).toHaveText('Prikaži elemente');
  const canvas = page.getByTestId('canvas-card');
  const wide = (await canvas.boundingBox())!.width;
  await page.getByTestId('toggle-props').click();
  await expect(page.getByTestId('panel-basics')).toBeVisible();
  const docked = (await canvas.boundingBox())!;
  expect(docked.width).toBeLessThan(wide - 300);
  expect(docked.x + docked.width).toBeLessThan((await page.getByTestId('props-drawer').boundingBox())!.x);
  await page.getByTestId('close-props').click();
  await expect(page.getByTestId('properties')).toBeHidden();
  await page.setViewportSize({ width: 900, height: 900 });
  const narrow = (await canvas.boundingBox())!.width;
  await page.getByTestId('toggle-props').click();
  expect((await canvas.boundingBox())!.width).toBe(narrow);
  await page.getByTestId('close-props').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const full = (await canvas.boundingBox())!.width;
  await page.getByTestId('toggle-props').click();
  expect((await canvas.boundingBox())!.width).toBeLessThan(full - 300);
  await page.getByTestId('close-props').click();
  expect((await canvas.boundingBox())!.width).toBe(full);
  await page.getByTestId('toggle-catalog').click();
  await expect(page.getByTestId('cat-fence-add')).toBeVisible();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('toggle-props').click();
  await expect(page.getByTestId('count-items')).toHaveText('2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('crtanje modela: svaki panel se sklapa nezavisno i oslobađa prostor za crtež', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1160, height: 900 });
  await page.goto('/modeli-terasa/crtanje');
  const drawing = page.getByTestId('designer-drawing');
  await expect(drawing).toBeVisible();
  const initial = (await drawing.boundingBox())!.width;
  await page.getByTestId('toggle-designer-properties').click();
  expect((await drawing.boundingBox())!.width).toBeGreaterThan(initial + 300);
  await page.getByTestId('toggle-designer-materials').click();
  expect((await drawing.boundingBox())!.width).toBeGreaterThan(initial);
  await expect(page.locator('#designer-materials')).toBeVisible();
  await page.getByTestId('toggle-designer-properties').click();
  expect((await drawing.boundingBox())!.width).toBeLessThan(initial - 200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('fiksna dužina: dugmad ne šire svojstva i zadržavanje prostora ne menja mere', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/podesavanja'); await page.getByTestId('set-advanced').check();
  await page.getByRole('link', { name: 'Početna', exact: true }).click(); await page.getByTestId('hero-new').click();
  await page.getByTestId('cat-fence-add').click(); await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('total-mode').getByRole('radio', { name: 'Fiksna', exact: true }).click();
  const before = await page.getByTestId('total-modular').innerText();
  const target = Number(before.replace(/\D/g, '')) + 500;
  await page.getByTestId('fixed-total').fill(String(target)); await page.getByTestId('fixed-total').press('Enter');
  await page.getByTestId('btn-leave-free').click();
  await expect(page.getByTestId('total-modular')).toHaveText(before);
  await expect(page.getByTestId('panel-basics')).toContainText('Zadržane su postojeće širine.');
  const drawer = page.getByTestId('props-drawer');
  for (const width of [1280, 1160, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth), `Širina prozora ${width}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByTestId('btn-autofill').click();
  await expect(page.getByTestId('total-modular')).toContainText(target.toLocaleString('sr-RS'));
  await expect(page.getByTestId('btn-autofill')).toBeDisabled(); await expect(page.getByTestId('btn-leave-free')).toBeDisabled();
  await drawer.screenshot({ path: 'test-results/fixed-total-controls.png' });
});
