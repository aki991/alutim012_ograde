import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

async function enableAdvanced(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Podešavanja' }).first().click();
  const sw = page.getByTestId('set-advanced');
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await page.getByRole('link', { name: 'Početna' }).first().click();
}

async function showDims(page: import('@playwright/test').Page) {
  await page.getByTestId('btn-view-options').click();
  const cb = page.getByTestId('opt-showDimensions');
  if (!(await cb.isChecked())) await cb.check();
  await page.getByTestId('btn-view-options').click();
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

const num = (s: string | null) => Number((s ?? '').replace(/[^\d]/g, ''));

async function openDemo(page: Page) {
  await page.goto('/');
  await enableAdvanced(page);
  await page.getByTestId('recent-row').filter({ hasText: 'Petrović' }).getByRole('link').click();
  await expect(page.getByTestId('count-items')).toHaveText('5');
}

async function open3D(page: Page) {
  await page.getByTestId('tab-three').click();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__aluTest));
}

/** Broj različitih boja u trenutnom kadru scene — dokazuje da je scena stvarno nacrtana (nije prazno/crno platno). */
async function distinctColors(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const url = window.__aluTest!.snapshot()!;
    const img = new Image();
    await new Promise<void>((r) => { img.onload = () => r(); img.src = url; });
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 160, 100);
    const d = ctx.getImageData(0, 0, 160, 100).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return set.size;
  });
}

const pointOf = (page: Page, id: string, handle?: 'width' | 'height') =>
  page.evaluate(([i, h]) => window.__aluTest!.screenPointOf(i as string, (h as 'width' | 'height' | undefined) ?? undefined), [id, handle] as const);

async function itemIds(page: Page): Promise<string[]> {
  // ID-jevi se čitaju iz 2D crteža u podeljenom prikazu
  return page.locator('[data-hit="item"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
}

test.describe('prazan projekat (D1/D2)', () => {
  test('čisto prazno stanje, nula cena, undo/redo i ponovno otvaranje', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.getByTestId('hero-new').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('empty-state')).toContainText('Dodajte element iz kataloga da započnete projekat');
    await expect(page.getByTestId('count-posts')).toHaveText('0 (0)');
    await expect(page.getByTestId('panel-price')).toHaveCount(0);
    // prazan projekat nema panel cene ni dugmad; obračun se otvara događajem (npr. sa Početne)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-calc')));
    await expect(page.getByTestId('calc-empty')).toBeVisible();
    await expect(page.getByTestId('calc-total')).toContainText('0 RSD');
    await page.getByTestId('calc-close').click();

    await page.getByTestId('cat-fence-add').click();
    await expect(page.getByTestId('count-posts')).toHaveText('2 (0)');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('count-items')).toHaveText('0');
    await expect(page.getByTestId('count-posts')).toHaveText('0 (0)');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('count-items')).toHaveText('1');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByTestId('count-items')).toHaveText('0');

    // 3D prazno stanje
    await page.getByTestId('tab-three').click();
    await expect(page.getByTestId('three-empty')).toBeVisible();

    // sačuvaj, osveži: i dalje prazno
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('btn-save')).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
    await page.reload();
    await page.getByTestId('tab-front').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('count-posts')).toHaveText('0 (0)');

    // izveštaji: nova stavka nema vrednost
    await page.goto('/izvestaji');
    const cells = await page.locator('tr', { hasText: 'Novi projekat' }).first().locator('td').allTextContents();
    expect(cells.join('|')).toContain('0,0 m');
    expect(cells.slice(-2).every((c) => c.trim().startsWith('0 '))).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('3D prikaz', () => {
  test('scena je stvarno nacrtana; klik bira objekat; panel i 2D ostaju sinhronizovani', async ({ page }) => {
    const errors = trackErrors(page);
    // širi desni panel ostavlja manje mesta za 3D u podeljenom prikazu, pa se objekti biraju na širem prozoru
    await page.setViewportSize({ width: 1700, height: 900 });
    await openDemo(page);
    await page.getByTestId('tab-split').click();
    await page.waitForFunction(() => Boolean(window.__aluTest));
    await expect.poll(() => distinctColors(page), { timeout: 15000 }).toBeGreaterThan(40);
    const stats = await page.evaluate(() => window.__aluTest!.stats());
    expect(stats.calls).toBeGreaterThan(5);

    const ids = await itemIds(page);
    expect(ids).toHaveLength(5);
    // klik na stvarni objekat u 3D (drugi segment ograde)
    const pt = (await pointOf(page, ids[1]))!;
    await page.mouse.click(pt.x, pt.y);
    await expect(page.getByTestId('panel-item')).toContainText('Platno 2');
    await expect(page.getByTestId('selection-outline')).toBeVisible(); // ista selekcija u 2D

    // izmena iz panela dok je 3D aktivan — 2D kote i ukupna dužina se ažuriraju
    await page.getByTestId('field-width').fill('1500');
    await expect(page.getByTestId('total-modular')).toContainText('10.390');
    await showDims(page);
    await expect(page.getByTestId('front-view').getByText(/1\.280/).first()).toBeVisible(); // kota platna je svetla širina: spoljna 1500 minus stubovi
    await page.getByTestId('field-color').locator('[data-color=\"RAL 9005\"]').click();
    await page.getByTestId('field-model').selectOption('v_framed');
    await expect(page.getByTestId('field-bar')).toBeVisible();

    // klik na stub
    const post = (await page.locator('[data-hit="post"]').nth(2).getAttribute('data-id'))!;
    const pp = (await pointOf(page, post))!;
    await page.mouse.click(pp.x, pp.y);
    await expect(page.getByTestId('panel-post')).toBeVisible();

    // selekcija ostaje pri prelasku 2D ↔ odozgo ↔ 3D
    await page.mouse.click(pt.x, pt.y);
    await page.getByTestId('tab-top').click();
    await expect(page.getByTestId('panel-item')).toContainText('Platno 2');
    await page.getByTestId('tab-three').click();
    await expect(page.getByTestId('panel-item')).toContainText('Platno 2');
    expect(errors).toEqual([]);
  });

  test('orbit ne menja projekat; režim uređivanja: prevlačenje, ručka, Escape i undo', async ({ page }) => {
    const errors = trackErrors(page);
    // širi desni panel ostavlja manje mesta za 3D u podeljenom prikazu: ručke za širinu se hvataju samo kad su u kadru, pa širi prozor
    await page.setViewportSize({ width: 1700, height: 900 });
    await openDemo(page);
    await page.getByTestId('tab-split').click();
    await page.waitForFunction(() => Boolean(window.__aluTest));
    const ids = await itemIds(page);
    const before = await page.getByTestId('count-items').textContent();

    // orbit u režimu pregleda: pomeranje kamere ne menja ni selekciju ni projekat
    const wrap = page.getByTestId('three-wrap');
    const box = (await wrap.boundingBox())!;
    const camBefore = await distinctColors(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.18, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('panel-item')).toHaveCount(0);
    await expect(page.getByTestId('count-items')).toHaveText(before!);
    expect(camBefore).toBeGreaterThan(10);

    // uređivanje
    await page.getByTestId('cam-front').click();
    await page.getByTestId('mode-edit').click();
    const dimsOrder = async () => (await itemIds(page)).join('|');
    const order0 = await dimsOrder();

    // Escape otkazuje prevlačenje bez upisa
    let a = (await pointOf(page, ids[4]))!;
    let b = (await pointOf(page, ids[0]))!;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x - 40, a.y, { steps: 5 });
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await expect(page.getByTestId('drag-ghost')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await dimsOrder()).toBe(order0);

    // prevlačenje poslednjeg elementa na početak menja redosled
    a = (await pointOf(page, ids[4]))!;
    b = (await pointOf(page, ids[0]))!;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x - 40, a.y, { steps: 5 });
    await page.mouse.move(b.x - 30, b.y, { steps: 15 });
    await page.mouse.up();
    const order1 = await dimsOrder();
    expect(order1).not.toBe(order0);
    expect(order1.split('|')[0]).toBe(order0.split('|')[4]);
    await expect(page.getByTestId('total-modular')).toContainText('11.000');
    await page.getByTestId('btn-undo').click();
    expect(await dimsOrder()).toBe(order0);

    // ručka za širinu: jedna istorijska radnja
    const sel = (await pointOf(page, ids[0]))!;
    await page.mouse.click(sel.x, sel.y);
    await expect(page.getByTestId('panel-item')).toBeVisible();
    const w0 = num(await page.getByTestId('field-width').inputValue());
    // ručka se crta tek posle sledećeg kadra, a raspored se može malo pomeriti posle izbora: čekaj da se ručka može uhvatiti
    const grab = (id: string) => page.evaluate((i) => { const p = window.__aluTest!.screenPointOf(i, 'width'); return p && window.__aluTest!.pick(p.x, p.y)?.kind === 'handle' ? p : null; }, id);
    await expect.poll(async () => (await grab(ids[0])) !== null).toBe(true);
    const h = (await grab(ids[0]))!;
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 25, h.y, { steps: 6 });
    await page.mouse.move(h.x + 60, h.y, { steps: 6 });
    await expect(page.getByTestId('resize-label')).toBeVisible();
    await page.mouse.up();
    const w1 = num(await page.getByTestId('field-width').inputValue());
    expect(w1).not.toBe(w0);
    await page.getByTestId('btn-undo').click();
    // posle undo selekcija ostaje (element i dalje postoji) i vraćena je prvobitna širina
    expect(num(await page.getByTestId('field-width').inputValue())).toBe(w0);
    await page.getByTestId('btn-redo').click();
    expect(num(await page.getByTestId('field-width').inputValue())).toBe(w1);
    expect(errors).toEqual([]);
  });

  test('dodavanje iz kataloga prevlačenjem u 3D, kapije se otvaraju i zatvaraju bez uticaja na cenu', async ({ page }) => {
    const errors = trackErrors(page);
    await openDemo(page);
    await open3D(page);
    // prevlačenje iz kataloga na scenu
    const card = page.getByTestId('cat-fence');
    await card.scrollIntoViewIfNeeded();
    const cb = (await card.boundingBox())!;
    const wb = (await page.getByTestId('three-wrap').boundingBox())!;
    await page.mouse.move(cb.x + 40, cb.y + 40);
    await page.mouse.down();
    await page.mouse.move(cb.x + 60, cb.y + 20, { steps: 5 });
    await page.mouse.move(wb.x + wb.width * 0.5, wb.y + wb.height * 0.5, { steps: 15 });
    await expect(page.getByTestId('drag-ghost')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('count-items')).toHaveText('6');

    // kapija: izaberi kliznu, otvori, proveri procenat i cenu
    await page.getByTestId('tab-split').click();
    await page.waitForFunction(() => Boolean(window.__aluTest));
    await page.getByTestId('cam-fit').click(); // kadar iz celog prikaza je sačuvan, a podeljen ekran je uži: uklopi ga
    await page.waitForTimeout(300);
    const gateIds = (await itemIds(page)).filter((i) => i.startsWith('gate_'));
    expect(gateIds).toHaveLength(2);
    // klik na stvarni objekat u 3D; tražimo kliznu kapiju
    for (const gid of gateIds) {
      const gp = (await pointOf(page, gid))!;
      await page.mouse.click(gp.x, gp.y);
      if ((await page.getByTestId('panel-item').textContent())?.includes('Klizna')) break;
    }
    await expect(page.getByTestId('gate-controls')).toBeVisible();
    const price = await page.getByTestId('price-total').textContent();
    await page.getByTestId('gate-open').click();
    await expect(page.getByTestId('gate-percent')).toHaveText('100%', { timeout: 8000 });
    await expect(page.getByTestId('price-total')).toHaveText(price!);
    await page.getByTestId('gate-slider').fill('40');
    await expect(page.getByTestId('gate-percent')).toHaveText('40%');
    await page.getByTestId('gate-close').click();
    await expect(page.getByTestId('gate-percent')).toHaveText('0%', { timeout: 8000 });
    await page.getByTestId('gate-open').click();
    await page.waitForTimeout(500);
    await page.getByTestId('gate-pause').click();
    const paused = await page.getByTestId('gate-percent').textContent();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('gate-percent')).toHaveText(paused!);
    // upozorenje o prostoru za klizanje
    await expect(page.getByTestId('sliding-warning')).toContainText('nije zadat');
    await page.getByTestId('field-space-known').click();
    await page.getByTestId('field-space').fill('1000');
    await expect(page.getByTestId('sliding-warning')).toContainText('Nedovoljan prostor');
    expect(errors).toEqual([]);
  });

  test('sve četiri vrste kapija: otvaranje 0→100→0 u 3D', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.getByTestId('hero-new').click();
    await page.getByTestId('cat-fence-add').click();
    for (const t of ['pedestrian', 'sliding', 'double', 'single']) {
      await page.getByTestId(`cat-gate-${t}-add`).click();
    }
    await page.getByTestId('tab-split').click();
    await page.waitForFunction(() => Boolean(window.__aluTest));
    const ids = await itemIds(page);
    expect(ids).toHaveLength(5);
    await page.getByTestId('btn-fit').click();
    const c0 = await distinctColors(page);
    await page.getByTestId('gates-open-all').first().click();
    await page.waitForFunction(() => Boolean(window.__aluTest));
    // izaberi svaku kapiju i sačekaj 100%
    for (const id of ids.slice(1)) {
      const p = (await pointOf(page, id))!;
      await page.mouse.click(p.x, p.y);
      await expect(page.getByTestId('gate-percent')).toHaveText('100%', { timeout: 10000 });
    }
    expect(await distinctColors(page)).toBeGreaterThan(10);
    await page.getByTestId('gates-close-all').click();
    for (const id of ids.slice(1)) {
      const p = (await pointOf(page, id))!;
      await page.mouse.click(p.x, p.y);
      await expect(page.getByTestId('gate-percent')).toHaveText('0%', { timeout: 10000 });
    }
    expect(c0).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });

  test('preuzimanje 3D slike daje pravi PNG', async ({ page }) => {
    await openDemo(page);
    await open3D(page);
    await expect.poll(() => distinctColors(page), { timeout: 15000 }).toBeGreaterThan(40);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-png').click()]);
    const buf = fs.readFileSync((await dl.path())!);
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.readUInt32BE(16)).toBeGreaterThan(300); // širina
    expect(buf.readUInt32BE(20)).toBeGreaterThan(200); // visina
    expect(buf.length).toBeGreaterThan(8000);
    expect(dl.suggestedFilename()).toMatch(/_3d\.png$/);
  });

  test('bez WebGL-a: poruka, nastavak u 2D, podaci očuvani', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        // @ts-expect-error prosleđivanje argumenata
        return orig.call(this, type, ...rest);
      } as typeof orig;
    });
    await openDemo(page);
    await page.getByTestId('tab-three').click();
    await expect(page.getByTestId('three-fallback')).toBeVisible();
    await page.getByRole('button', { name: 'Nastavi u 2D' }).click();
    await expect(page.getByTestId('front-view')).toBeVisible();
    await expect(page.getByTestId('count-items')).toHaveText('5');
  });
});

test.describe('raspored (D3, D4, D5)', () => {
  test('minijature prikazuju celu konfiguraciju sa ujednačenim odnosom stranica', async ({ page }) => {
    await page.goto('/projekti');
    const thumbs = page.getByTestId('project-thumb');
    await expect(thumbs.first()).toBeVisible();
    const n = await thumbs.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      const b = (await thumbs.nth(i).boundingBox())!;
      expect(b.width).toBeGreaterThan(60);
      expect(b.height / b.width).toBeGreaterThan(0.5);
      expect(b.height / b.width).toBeLessThan(0.75);
      // crtež popunjava okvir: sadrži stvarne SVG oblike
      expect(await thumbs.nth(i).locator('svg rect, svg image').count()).toBeGreaterThan(5);
    }
  });

  for (const [w, h] of [[1366, 768], [1460, 1308]] as const) {
    test(`kalkulacija: ukupni iznosi vidljivi bez horizontalnog skrola (${w}×${h})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openDemo(page);
      await page.getByTestId('btn-open-calc').click();
      const dlg = page.getByRole('dialog');
      await expect(dlg).toBeVisible();
      const db = (await dlg.boundingBox())!;
      expect(db.x + db.width).toBeLessThanOrEqual(w + 1);
      const lastCol = (await page.getByTestId('calc-bom').locator('thead th').last().boundingBox())!;
      expect(lastCol.x + lastCol.width).toBeLessThanOrEqual(db.x + db.width + 1);
      await expect(page.getByTestId('calc-total-footer')).toBeInViewport();
      await expect(page.getByTestId('calc-close')).toBeInViewport();
      // nema horizontalnog skrola unutar modala
      const overflowX = await dlg.evaluate((el) => Array.from(el.querySelectorAll('*')).some((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible' && getComputedStyle(n).overflowX !== 'hidden'));
      expect(overflowX).toBe(false);
      // fokus ulazi u dijalog, Escape zatvara i vraća fokus na dugme
      await page.keyboard.press('Escape');
      await expect(dlg).toHaveCount(0);
      await expect(page.getByTestId('btn-open-calc')).toBeFocused();
    });
  }

  test('promena marže u uvećanje menja ukupan iznos (formule sačuvane)', async ({ page }) => {
    await openDemo(page);
    await page.getByTestId('btn-open-calc').click();
    const margin = num(await page.getByTestId('calc-total').textContent());
    await page.getByTestId('profit-mode').getByRole('radio', { name: 'Uvećanje' }).click();
    await expect.poll(async () => num(await page.getByTestId('calc-total').textContent())).toBeLessThan(margin);
  });

  for (const [w, h] of [[1366, 768], [1100, 800]] as const) {
    test(`klik na element jasno prikazuje parametre (${w}×${h})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openDemo(page);
      await page.locator('[data-hit="item"]').first().click();
      await expect(page.getByTestId('panel-item')).toBeInViewport();
      await expect(page.getByTestId('field-width')).toBeInViewport();
      await expect(page.getByTestId('panel-item')).toContainText('Odabran element');
    });
  }

  test('modeli: primena na izabrani segment prikazuje projekat i segment', async ({ page }) => {
    await openDemo(page);
    await page.locator('[data-hit="item"]').first().click();
    await page.getByRole('link', { name: 'Modeli ograda' }).click();
    await page.getByTestId('use-model-v_framed').click();
    await expect(page.getByTestId('apply-target')).toContainText('Platno 1');
    await page.getByTestId('apply-to-selected').click();
    await expect(page.getByTestId('field-model')).toHaveValue('v_framed');
  });
});
