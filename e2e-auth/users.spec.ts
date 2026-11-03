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

test('administrator menja (lozinka, ime, uloga) i briše korisnika; sebe ne može da obriše', async ({ page }) => {
  type U = { id: string; login: string; fullName: string; role: string | null; createdAt: string; lastSignInAt: string | null };
  let users: U[] = [
    { id: 'user-1', login: 'radnik@alutim.rs', fullName: 'Radnik', role: 'admin', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null },
    { id: 'u2', login: 'petar', fullName: 'Petar', role: null, createdAt: '2026-02-01T00:00:00Z', lastSignInAt: null },
  ];
  const patches: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  await page.route('**/api/users**', async (route) => {
    const req = route.request();
    const m = req.method();
    if (m === 'GET') return route.fulfill({ json: { users } });
    if (m === 'PATCH') {
      const body = req.postDataJSON() as Record<string, unknown>;
      patches.push(body);
      if (body.login === 'zauzeto') return route.fulfill({ status: 409, json: { error: 'Korisnik sa tim imenom ili e-mailom već postoji.' } });
      users = users.map((u) => (u.id === body.id ? { ...u, login: (body.login as string) ?? u.login, fullName: (body.fullName as string) ?? u.fullName, role: body.role === 'admin' ? 'admin' : body.role === 'user' ? null : u.role } : u));
      return route.fulfill({ json: { ok: true } });
    }
    if (m === 'DELETE') {
      const id = new URL(req.url()).searchParams.get('id')!;
      deletes.push(id);
      users = users.filter((u) => u.id !== id);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: 405, json: { error: 'x' } });
  });

  await page.goto('/podesavanja');
  await page.getByTestId('login-email').fill('radnik@alutim.rs');
  await page.getByTestId('login-password').fill('tajna123');
  await page.getByTestId('login-submit').click();
  const admin = page.getByTestId('users-admin');
  const rows = admin.getByTestId('user-row');
  await expect(rows).toHaveCount(2);

  // sopstveni nalog: brisanje onemogućeno, prijava i uloga zaključani
  const mine = rows.filter({ hasText: 'radnik@alutim.rs' });
  await expect(mine).toContainText('(vi)');
  await expect(mine.getByTestId('user-delete')).toBeDisabled();
  await mine.getByTestId('user-edit').click();
  await expect(page.getByTestId('user-edit-login')).toBeDisabled();
  await expect(page.getByTestId('user-edit-admin')).toBeDisabled();
  await page.getByRole('button', { name: 'Otkaži' }).click();

  // izmena: nova lozinka + ime + administrator; šalje se samo promenjeno
  const petar = rows.filter({ hasText: 'petar' });
  await petar.getByTestId('user-edit').click();
  await expect(page.getByTestId('user-edit-name')).toHaveValue('Petar');
  await page.getByTestId('user-edit-name').fill('Petar Petrović');
  await page.getByTestId('user-edit-password').fill('novalozinka1');
  await page.getByTestId('user-edit-admin').check();
  await page.getByTestId('user-edit-save').click();
  await expect(admin.getByTestId('user-message')).toContainText('Izmene za korisnika');
  await expect(admin.getByTestId('user-message')).toContainText('Nova lozinka važi odmah');
  expect(patches[0]).toEqual({ id: 'u2', fullName: 'Petar Petrović', password: 'novalozinka1', role: 'admin' });
  await expect(rows.filter({ hasText: 'Petar Petrović' })).toContainText('Administrator');

  // greška servera (zauzeto ime) ostaje u prozoru
  await rows.filter({ hasText: 'petar' }).getByTestId('user-edit').click();
  await page.getByTestId('user-edit-login').fill('zauzeto');
  await page.getByTestId('user-edit-save').click();
  await expect(page.getByTestId('user-edit-error')).toContainText('već postoji');
  await page.getByRole('button', { name: 'Otkaži' }).click();

  // bez izmena: prozor se samo zatvara, bez poziva servera
  const before = patches.length;
  await rows.filter({ hasText: 'petar' }).getByTestId('user-edit').click();
  await page.getByTestId('user-edit-save').click();
  await expect(page.getByTestId('user-edit-form')).toHaveCount(0);
  expect(patches.length).toBe(before);

  // brisanje traži potvrdu; Otkaži ne briše, Obriši briše
  await rows.filter({ hasText: 'petar' }).getByTestId('user-delete').click();
  await page.getByRole('button', { name: 'Otkaži' }).click();
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'petar' }).getByTestId('user-delete').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Obriši' }).click();
  await expect(admin.getByTestId('user-message')).toContainText('je obrisan');
  await expect(rows).toHaveCount(1);
  expect(deletes).toEqual(['u2']);
});
