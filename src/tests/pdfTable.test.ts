import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEED_MATERIALS } from './fixtures/materials';
import { planImport } from '../domain/pricing/materialsIo';
import { readPdfTable, type PdfLib } from '../services/pdfTable';

const PDF = 'C:/Users/Andreja/Desktop/CENOVNIK - ALUMINIJUMSKE OGRADE - 2026 (7)_1740ea0c-25b3-44c5-85c4-09960912e2f5.pdf';

async function table(): Promise<string[][]> {
  const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLib;
  const b = readFileSync(PDF);
  return readPdfTable(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, lib);
}

// test koristi stvarni cenovnik dobavljača (Ekoluka Key); preskače se ako fajla nema na ovom računaru
describe.skipIf(!existsSync(PDF))('čitanje cenovnika iz PDF-a', () => {
  it('daje tabelu: 72 artikla, spojene ćelije (RAL, JM) važe za sve redove grupe', async () => {
    const t = await table();
    const head = t[0].map((h) => h.toLowerCase());
    expect(head.some((h) => h.includes('šifra') || h.includes('sifra'))).toBe(true);
    expect(t.length - 1).toBe(72);
    const col = (name: string) => t[0].findIndex((h) => h.toLowerCase().includes(name));
    const row = (sku: string) => t.find((r) => r[0] === sku || r[col('ifra')] === sku)!;
    const ral = col('ral'); const jm = col('jm');
    expect(row('KU000007')[ral]).toBe('7016');
    expect(row('KU000016')[ral]).toBe('7016');
    expect(row('KU000016')[jm]).toBe('6.5m');
    expect(row('KU000001')[jm]).toBe('6m');
    expect(row('KU000003')[jm]).toBe('6m');
    expect(row('KU000008')[ral]).toBe('7016');
    expect(row('KU000017')[ral]).toBe('7016');
  });

  it('uvoz iz PDF-a: cena po šipki → po metru, bez PDV-a, hiljade sa tačkom', async () => {
    const plan = planImport(SEED_MATERIALS, await table(), true);
    expect(plan.fatal).toBeUndefined();
    expect(plan.counts.error).toBe(0);
    expect(plan.counts.unknown).toBe(0);
    expect(plan.counts.changed + plan.counts.same + plan.counts.new).toBe(72);
    const price = (sku: string) => plan.rows.find((r) => r.sku === sku)!.newPrice;
    expect(price('KV000007')).toBeCloseTo(452.83, 2);
    expect(price('KU000016')).toBeCloseTo(263.08, 2);
    expect(price('KU000004')).toBeCloseTo(67, 2); // 0.402 = 402 din / 6 m
    expect(price('K100001')).toBe(2635);
    expect(price('K100005')).toBe(623); // 0.623 = 623 din
    const nw = plan.rows.find((r) => r.sku === 'KV000001')!;
    expect(nw.result?.name).toMatch(/Kvadratna cev 60×60×2 mm, sirovo/i);
    expect(nw.result?.unit).toBe('m');
    expect(plan.rows.find((r) => r.sku === 'K100001')!.result?.unit).toBe('kom');
  });
});

describe('probni PDF (test-cenovnik-dobavljac.pdf)', () => {
  it('spojene ćelije, cena po šipki i nove stavke se čitaju kako treba', async () => {
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfLib;
    const b = readFileSync('test-cenovnik-dobavljac.pdf');
    const t = await readPdfTable(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, lib);
    expect(t.length - 1).toBe(13);
    const plan = planImport(SEED_MATERIALS, t, true);
    expect(plan.counts).toMatchObject({ changed: 6, new: 7, error: 0, unknown: 0 });
    const by = (sku: string) => plan.rows.find((r) => r.sku === sku)!;
    expect(by('DEMO-HP-100').newPrice).toBe(560);
    expect(by('DEMO-ST-AL').newPrice).toBe(5450);
    expect(by('KV000007').newPrice).toBeCloseTo(483.33, 2);
    expect(by('TEST-001').newPrice).toBe(600);
    expect(by('TEST-002').newPrice).toBeCloseTo(691.67, 2); // spojena JM ćelija: 6m
    expect(by('TEST-002').result?.name).toMatch(/^Ogradna letvica 120x20x1,2mm, RAL 7016/); // spojen naziv
    expect(by('TEST-004').newPrice).toBeCloseTo(1600, 2); // 10.400 / 6,5 m
    expect(by('TEST-004').result?.name).toMatch(/^Rukohvat okrugli Ø50, RAL 7016, šipka 6,5 m/);
    expect(by('TEST-006').newPrice).toBe(950);
  });
});
