import { expect, test } from '@playwright/test';

test('desktop (PWA): manifest, service worker i rad bez interneta', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Materijali i cene' }).first()).toBeVisible();

  // manifest koji traži instalacija kao desktop aplikacija
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.short_name).toBe('ALU TIM 012');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);

  // service worker se aktivira i unapred sačuva celu aplikaciju
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('alutim-'))!);
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain('/index.html');
  expect(cached.some((p) => /^\/assets\/Scene3D-.*\.js$/.test(p))).toBe(true);
  expect(cached.some((p) => /^\/assets\/pdfmake-.*\.js$/.test(p))).toBe(true);

  // bez interneta aplikacija se i dalje otvara, i na drugim stranama
  await context.setOffline(true);
  await page.goto('/materijali');
  await expect(page.getByRole('heading', { name: /Materijali/ }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Početna' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await context.setOffline(false);
});
