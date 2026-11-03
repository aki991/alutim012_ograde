import { expect, test } from '@playwright/test';

const A = '585c2d3e-7e22-426e-a1b2-05a92739ab12';
const B = '11111111-2222-4333-8444-555555555555';
const items = [
  { id: A, createdAt: '2026-11-03T17:47:37Z', status: 'received', customerName: 'Marko Marković', technician: 'Petar', positionCount: 3, totalAmount: 1234.5, currency: 'EUR', hasUnpriced: true, fileName: 'specifikacija.pdf', fileSize: 250000 },
  { id: B, createdAt: '2026-11-02T10:00:00Z', status: 'processed', customerName: 'Ana Anić', technician: 'Jovan', positionCount: 1, totalAmount: 99, currency: 'EUR', hasUnpriced: false, fileName: 'specifikacija.pdf', fileSize: 1500000 },
];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

async function mockApi(page: import('@playwright/test').Page, calls: string[]) {
  await page.route('**/api/field-specs**', async (route) => {
    const req = route.request();
    const id = new URL(req.url()).searchParams.get('id');
    calls.push(`${req.headers().authorization ? 'auth' : 'bez-tokena'}:${id ?? 'lista'}`);
    if (!id) return route.fulfill({ json: { items } });
    const item = items.find((i) => i.id === id)!;
    return route.fulfill({ json: { item, viewUrl: `http://localhost:18321/mock-storage/${id}/view.pdf`, downloadUrl: `http://localhost:18321/mock-storage/${id}/view.pdf?download=1`, expiresInSeconds: 120 } });
  });
  await page.route('**/mock-storage/**', (route) => route.fulfill({ body: PDF, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' } }));
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('login-email').fill('radnik@alutim.rs');
  await page.getByTestId('login-password').fill('tajna123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByRole('button', { name: /Obaveštenja/ })).toBeVisible();
}

test('specifikacija sa terena: obaveštenje u zvončiću, otvaranje PDF-a, preuzimanje i pročitano', async ({ page }) => {
  const calls: string[] = [];
  await mockApi(page, calls);
  await login(page);

  // broj nepročitanih na zvončiću; poziv ide sa prijavom
  await expect(page.getByTestId('bell-badge')).toHaveText('2');
  expect(calls[0]).toBe('auth:lista');
  await page.getByRole('button', { name: /Obaveštenja/ }).click();
  const list = page.getByTestId('bell-item');
  await expect(list).toHaveCount(2);
  await expect(list.first()).toContainText('Marko Marković');
  await expect(list.first()).toContainText('3 pozicije');
  await expect(list.first()).toContainText('bez cene');
  await expect(list.first()).toHaveAttribute('data-unread', 'true');

  // klik otvara specifikaciju: podaci, PDF u okviru i preuzimanje
  await list.first().click();
  const meta = page.getByTestId('spec-meta');
  await expect(meta).toContainText('Marko Marković');
  await expect(meta).toContainText('Petar');
  await expect(meta).toContainText('ima pozicija bez cene');
  await expect(page.getByTestId('spec-frame')).toHaveAttribute('src', /^blob:/);
  const dl = page.getByTestId('spec-download');
  await expect(dl).toHaveAttribute('href', /^blob:/);
  await expect(dl).toHaveAttribute('download', 'specifikacija.pdf');
  expect(calls).toContain(`auth:${A}`);
  await page.getByTestId('spec-close').click();
  await expect(page.getByTestId('spec-frame')).toHaveCount(0);

  // pročitana ostaje pročitana i posle osvežavanja (po korisniku, u ovom pregledaču)
  await expect(page.getByTestId('bell-badge')).toHaveText('1');
  await page.reload();
  await expect(page.getByTestId('bell-badge')).toHaveText('1');
  await page.getByRole('button', { name: /Obaveštenja/ }).click();
  await expect(page.getByTestId('bell-item').first()).toHaveAttribute('data-unread', 'false');
  await page.getByTestId('bell-mark-all').click();
  await expect(page.getByTestId('bell-badge')).toHaveCount(0);
});

test('specifikacija sa terena: bez servera zvončić kaže da provera nije uspela, a aplikacija radi dalje', async ({ page }) => {
  await page.route('**/api/field-specs**', (route) => route.fulfill({ status: 500, json: { error: 'Server nije podešen: nedostaje SUPABASE_SERVICE_ROLE_KEY.' } }));
  await login(page);
  await expect(page.getByTestId('bell-badge')).toHaveCount(0);
  await page.getByRole('button', { name: /Obaveštenja/ }).click();
  await expect(page.getByTestId('bell-empty')).toContainText('Provera obaveštenja nije uspela');
});

test('specifikacija sa terena: PDF koji ne može da se učita daje poruku, a preuzimanje ostaje', async ({ page }) => {
  await mockApi(page, []);
  await page.route('**/mock-storage/**', (route) => route.fulfill({ status: 403, body: 'istekao' }));
  await login(page);
  await page.getByRole('button', { name: /Obaveštenja/ }).click();
  await page.getByTestId('bell-item').first().click();
  await expect(page.getByTestId('spec-error')).toContainText('nije mogao da se učita');
  await expect(page.getByTestId('spec-download')).toHaveAttribute('href', /download=1/);
});
