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

  // nalog bez imena: inicijali i ime iz emaila, uloga iz naloga
  await page.getByRole('button', { name: 'Korisnički meni' }).click();
  await expect(page.getByTestId('user-email')).toHaveText('radnik@alutim.rs');
  await expect(page.getByTestId('user-name')).toHaveText('radnik');
  await expect(page.getByTestId('user-role')).toHaveText('Administrator');
  await expect(page.getByRole('button', { name: 'Korisnički meni' })).toContainText('RA');
  // ime i prezime se upisuje u nalog (Podešavanja) i menja avatar
  await page.goto('/podesavanja');
  await expect(page.getByTestId('account-name')).toBeVisible();
  await page.getByTestId('account-name').fill('Petar Petrović');
  await page.getByTestId('account-name-save').click();
  await expect(page.getByText('Ime je sačuvano u nalogu.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Korisnički meni' })).toContainText('PP');
  await page.getByRole('button', { name: 'Korisnički meni' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Petar Petrović');
  await page.getByTestId('btn-logout').click();
  await expect(page.getByTestId('login-form')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('bez interneta: ulaz kao gost; sa internetom dugme za gosta se ne nudi', async ({ page, context }) => {
  await page.goto('/materijali');
  await expect(page.getByTestId('login-form')).toBeVisible();
  await expect(page.getByTestId('guest-box')).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByTestId('btn-guest')).toBeVisible();
  await page.getByTestId('btn-guest').click();
  await expect(page.getByRole('heading', { name: 'Materijali i cene' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Korisnički meni' })).toContainText('G');

  // gost ostaje posle osvežavanja; meni nudi izlaz, a Podešavanja ne traže nalog
  await page.getByRole('button', { name: 'Korisnički meni' }).click();
  await expect(page.getByTestId('user-name')).toHaveText('Gost');
  await page.keyboard.press('Escape');
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('link', { name: 'Podešavanja' }).first().click();
  await expect(page.getByTestId('account-name')).toHaveCount(0);
  await expect(page.getByTestId('set-company')).toBeVisible();

  await page.getByRole('button', { name: 'Korisnički meni' }).click();
  await page.getByTestId('btn-logout').click();
  await expect(page.getByTestId('login-form')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByTestId('guest-box')).toHaveCount(0);
});
