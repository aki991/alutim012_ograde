import { expect, test } from '@playwright/test';

test('mera se potvrđuje jednom, Escape otkazuje unos, a opseg menja samo odabrane elemente', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); await page.getByTestId('hero-new').click();
  await page.getByTestId('cat-fence-add').click(); await page.getByTestId('cat-fence-add').click();
  await page.locator('[data-hit="item"]').first().click();
  const width = page.getByTestId('field-width');
  const initialWidth = await width.inputValue(); const initialTotal = await page.getByTestId('total-length').innerText();
  await width.fill('2200');
  await expect(page.getByTestId('total-length')).toHaveText(initialTotal);
  await width.press('Escape'); await width.press('Tab');
  await expect(width).toHaveValue(initialWidth);
  await expect(page.getByTestId('total-length')).toHaveText(initialTotal);
  await width.fill('2200'); await width.press('Enter');
  await expect(page.getByTestId('total-length')).not.toHaveText(initialTotal);
  await page.getByTestId('btn-undo').click();
  await expect(width).toHaveValue(initialWidth);
  await expect(page.getByTestId('total-length')).toHaveText(initialTotal);
  // Isti naziv i ista kontrola opsega, sa stvarnim brojem ciljeva.
  await expect(page.getByTestId('edit-scope-select-count')).toContainText('1');
  await page.getByTestId('edit-scope-select').selectOption('same');
  await expect(page.getByTestId('edit-scope-select-count')).toContainText('2');
  await page.getByTestId('field-height').fill('1300'); await page.getByTestId('field-height').press('Tab');
  await page.getByTestId('tab-dims').click();
  await expect(page.getByTestId('dims-table').locator('tbody tr').filter({ hasText: '1.300' })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('decimalni unos i validacija ne zatvaraju dijalog; strelice biraju jednu opciju', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('hero-new').click(); await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('btn-open-calc').click();
  const rate = page.getByTestId('calc-coating-rate'); const initial = await rate.inputValue();
  await rate.fill('2,5'); await rate.press('Escape');
  await expect(rate).toHaveValue(initial);
  await expect(page.getByRole('dialog')).toBeVisible();
  await rate.fill('-1'); await rate.press('Enter'); await expect(rate).toHaveAttribute('aria-invalid', 'true');
  await rate.press('Escape'); await expect(rate).not.toHaveAttribute('aria-invalid', 'true');
  await rate.fill('2,5'); await rate.press('Tab'); await expect(rate).toHaveValue('2,5');
  const profit = page.getByTestId('profit-mode');
  await profit.getByRole('radio').first().focus(); await profit.getByRole('radio').first().press('ArrowRight');
  await expect(profit.getByRole('radio').last()).toBeChecked();
  await expect(page.getByRole('dialog')).toBeVisible();
  await rate.focus(); await rate.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('crtanje modela koristi istu potvrdu mera i pretragu menija sa tastaturom', async ({ page }) => {
  await page.goto('/modeli-terasa/crtanje');
  const width = page.getByTestId('designer-width'); const before = await width.inputValue();
  await width.fill('2200'); await width.press('Escape'); await width.press('Tab'); await expect(width).toHaveValue(before);
  await width.fill('2200'); await width.press('Tab'); await expect(width).toHaveValue('2200');
  await page.getByTestId('designer-tools').locator('summary').click();
  await page.getByRole('button', { name: 'Poništi', exact: true }).click(); await expect(width).toHaveValue(before);
  await page.goto('/'); await page.getByTestId('hero-new').click();
  const trigger = page.getByTestId('catalog-model-button'); await trigger.press('ArrowDown');
  const search = page.getByTestId('catalog-model-button-search'); await expect(search).toBeFocused();
  await search.fill('nepostojeci model xyz'); await expect(page.getByTestId('catalog-model-button-list')).toContainText('Nema rezultata');
  await search.press('Escape'); await expect(trigger).toBeFocused(); await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('cat-fence-add').click(); await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('btn-save')).toHaveAttribute('data-state', 'saved');
  await page.goto('/projekti');
  const actions = page.getByRole('button', { name: 'Akcije', exact: true }).first();
  await actions.press('ArrowDown'); await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.getByRole('menuitem').first().press('Escape'); await expect(actions).toBeFocused(); await expect(actions).toHaveAttribute('aria-expanded', 'false');
});
