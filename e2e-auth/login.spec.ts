import { expect, test } from '@playwright/test';

test('bez prijave se vidi samo stranica za prijavu, na istoj adresi', async ({ page }) => {
  await page.goto('/materijali');
  await expect(page.getByTestId('login-form')).toBeVisible();
  await expect(page.getByTestId('login-disabled')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Materijali i cene' })).toHaveCount(0);
});

test('pogrešna lozinka, previše pokušaja, pa uspešna prijava, ostaje posle osvežavanja, odjava', async ({ page }) => {
  await page.goto('/materijali');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('Unesite email i lozinku');

  await page.getByTestId('login-email').fill('radnik@alutim.rs');
  await page.getByTestId('login-password').fill('pogresna');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveText('Pogrešan email ili lozinka.');
  await expect(page.getByTestId('login-password')).toHaveValue('');

  await page.getByTestId('login-email').fill('spor@alutim.rs');
  await page.getByTestId('login-password').fill('x');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toContainText('Previše pokušaja');

  await page.getByTestId('login-email').fill('radnik@alutim.rs');
  await page.getByTestId('login-password').fill('tajna123');
  await page.getByRole('button', { name: 'Prikaži lozinku' }).click();
  await expect(page.getByTestId('login-password')).toHaveAttribute('type', 'text');
  await page.getByTestId('login-submit').click();
  // posle prijave se otvara tražena strana
  await expect(page.getByRole('heading', { name: 'Materijali i cene' })).toBeVisible();
  await expect(page).toHaveURL(/\/materijali$/);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Materijali i cene' })).toBeVisible();

  await page.getByRole('button', { name: 'Korisnički meni' }).click();
  await expect(page.getByTestId('user-email')).toHaveText('radnik@alutim.rs');
  await page.getByTestId('btn-logout').click();
  await expect(page.getByTestId('login-form')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('login-form')).toBeVisible();
});
