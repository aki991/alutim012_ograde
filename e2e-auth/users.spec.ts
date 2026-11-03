import { expect, test } from '@playwright/test';

test('prijava korisničkim imenom (bez e-maila): obični korisnik nema ovlašćenja administratora', async ({ page }) => {
  await page.goto('/podesavanja');
  await page.getByTestId('login-email').fill('Petar');
  await page.getByTestId('login-password').fill('lozinka99');
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('heading', { name: 'Podešavanja' })).toBeVisible();
  await page.getByRole('button', { name: 'Korisnički meni' }).click();
  await expect(page.getByTestId('user-email')).toHaveText('petar');
  await expect(page.getByTestId('user-role')).toHaveCount(0);
  // običan korisnik nema odeljak Korisnici
  await expect(page.getByTestId('users-admin')).toHaveCount(0);
  // odjava, pa pogrešna lozinka za isto korisničko ime
  await page.getByTestId('btn-logout').click();
  await page.getByTestId('login-email').fill('petar');
  await page.getByTestId('login-password').fill('pogresna');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveText('Pogrešan email ili lozinka.');
});

test('administrator u Podešavanjima pravi korisnika (korisničko ime ili e-mail) i vidi spisak', async ({ page }) => {
  type U = { id: string; login: string; fullName: string; role: string | null; createdAt: string; lastSignInAt: string | null };
  const users: U[] = [{ id: 'u1', login: 'radnik@alutim.rs', fullName: 'Radnik', role: 'admin', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null }];
  const posts: { auth: string | undefined; body: Record<string, string> }[] = [];
  await page.route('**/api/users', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { users } });
    const body = req.postDataJSON() as Record<string, string>;
    posts.push({ auth: req.headers().authorization, body });
    if (body.login === 'postoji') return route.fulfill({ status: 409, json: { error: 'Korisnik sa tim imenom ili e-mailom već postoji.' } });
    users.push({ id: `u${users.length + 1}`, login: body.login, fullName: body.fullName, role: null, createdAt: '2026-02-02T00:00:00Z', lastSignInAt: null });
    return route.fulfill({ status: 201, json: { id: 'novi', login: body.login } });
  });

  await page.goto('/podesavanja');
  await page.getByTestId('login-email').fill('radnik@alutim.rs');
  await page.getByTestId('login-password').fill('tajna123');
  await page.getByTestId('login-submit').click();
  const admin = page.getByTestId('users-admin');
  await expect(admin).toBeVisible();
  await expect(admin.getByTestId('user-row')).toHaveCount(1);
  await expect(admin.getByTestId('user-row').first()).toContainText('Administrator');

  // korisničko ime + lozinka
  await admin.getByTestId('user-new-login').fill('petar.petrovic');
  await admin.getByTestId('user-new-name').fill('Petar Petrović');
  await admin.getByTestId('user-new-password').fill('lozinka99');
  await admin.getByTestId('user-create').click();
  await expect(admin.getByTestId('user-message')).toContainText('petar.petrovic');
  await expect(admin.getByTestId('user-row')).toHaveCount(2);
  expect(posts[0].auth).toMatch(/^Bearer .+/);
  expect(posts[0].body).toEqual({ login: 'petar.petrovic', fullName: 'Petar Petrović', password: 'lozinka99' });
  await expect(admin.getByTestId('user-new-login')).toHaveValue('');
  await expect(admin.getByTestId('user-new-password')).toHaveValue('');

  // greška servera (korisnik već postoji) se prikazuje, spisak se ne menja
  await admin.getByTestId('user-new-login').fill('postoji');
  await admin.getByTestId('user-new-password').fill('lozinka99');
  await admin.getByTestId('user-create').click();
  await expect(admin.getByTestId('user-message')).toContainText('već postoji');
  await expect(admin.getByTestId('user-row')).toHaveCount(2);
});
