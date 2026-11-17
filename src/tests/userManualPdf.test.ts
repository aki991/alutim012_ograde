import { describe, expect, it, vi } from 'vitest';

// logotipi se u testu ne učitavaju (nema servera za slike): PDF se pravi bez njih
vi.mock('../services/pdfHeader', async (orig) => ({ ...(await orig<typeof import('../services/pdfHeader')>()), loadHeaderLogos: () => Promise.reject(new Error('bez slika')) }));

describe('uputstvo za upotrebu kao PDF', () => {
  it('pravi se PDF sa naslovnom stranom, sadržajem i svim poglavljima', async () => {
    const { buildManualPdfBlob } = await import('../services/pdfManual');
    const { SEED_SETTINGS } = await import('../data/seed');
    const blob = await buildManualPdfBlob(SEED_SETTINGS);
    const buf = Buffer.from(await blob.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
    expect(pages).toBeGreaterThan(20);
  }, 60_000);
});
