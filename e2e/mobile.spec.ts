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

test('telefon: ponuda, krojna lista i radni nalog se otvaraju kao PDF (bez okvira koji telefon ne prikazuje)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('hero-new').click();
  await page.getByTestId('cat-fence-add').click();
  await page.getByTestId('toggle-props').click();
  for (const [btn, title] of [['btn-pdf', 'Pregled ponude'], ['btn-cutlist', 'Pregled krojne liste'], ['btn-workorder', 'Pregled radnog naloga']] as const) {
    await page.getByTestId(btn).scrollIntoViewIfNeeded();
    await page.getByTestId(btn).click();
    await expect(page.getByRole('dialog')).toContainText(title);
    if (btn === 'btn-cutlist') {
      // pre krojne liste: pitanje o ostacima materijala
      await page.getByTestId('offcuts-none').click();
      await page.getByTestId('offcuts-continue').click();
    }
    const open = page.getByTestId('pdf-open');
    await expect(open).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('pdf-frame')).toHaveCount(0);
    const href = await open.getAttribute('href');
    expect(href).toMatch(/^blob:/);
    // PDF iza veze je stvaran dokument
    const head = await page.evaluate(async (u) => new TextDecoder().decode((await (await fetch(u!)).arrayBuffer()).slice(0, 5)), href);
    expect(head).toBe('%PDF-');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdf-save').click()]);
    expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
    await page.getByTestId('pdf-close').click();
  }
});
