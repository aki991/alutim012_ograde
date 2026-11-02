import { expect, test } from '@playwright/test';

test('mobilni prikaz: meni, editor, katalog i svojstva', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Otvori meni' }).click();
  await expect(page.getByTestId('mobile-menu')).toBeVisible();
  await expect(page.getByTestId('mobile-menu').getByTestId('nav-current-project')).toBeVisible();
  await page.getByTestId('mobile-menu').getByRole('link', { name: 'Početna' }).click();
  await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
  await page.getByTestId('hero-new').click();
  await expect(page).toHaveURL(/\/editor\//);

  // canvas je vidljiv, katalog dodaje element
  await expect(page.getByTestId('canvas-area')).toBeVisible();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('cat-fence-add').click();
  await expect(page.getByTestId('front-view')).toBeVisible();

  // panel svojstava se otvara po izboru
  await expect(page.getByTestId('panel-basics')).toBeHidden();
  await page.getByTestId('toggle-props').click();
  await expect(page.getByTestId('panel-basics')).toBeVisible();
  await expect(page.getByTestId('count-items')).toHaveText('2');

  // bez horizontalnog skrolovanja cele stranice
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // pregled tabele projekata na telefonu
  await page.goto('/projekti');
  await expect(page.getByTestId('projects-table')).toBeVisible();
  expect(errors).toEqual([]);

  // 3D na telefonu: jedan prikaz, kontrole dostupne, numerički panel kao alternativa
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.getByTestId('mode-edit')).toBeVisible();
  await expect(page.getByTestId('tab-split')).toBeHidden(); // podeljeni prikaz je samo za desktop
  await page.getByTestId('toggle-props').click();
  await expect(page.getByTestId('props-drawer')).toBeVisible();
  await page.getByTestId('close-props').click();
  expect(errors).toEqual([]);
});
